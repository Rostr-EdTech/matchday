"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { assertCanAccessTeam, assertCanAccessAthlete, accessibleAthleteIds } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";
import type { ActionResult } from "./types";

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, n));
}

export async function listFormations() {
  return prisma.formation.findMany({ orderBy: { name: "asc" } });
}

export async function listLineupsForTeam(teamId: string) {
  const user = await requireStaff();
  await assertCanAccessTeam(user, teamId);
  return prisma.lineup.findMany({
    where: { teamId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, updatedAt: true, sharedAt: true, formation: { select: { name: true } }, matchId: true },
  });
}

// Full board state for one lineup: every placed athlete/empty placeholder,
// plus a bench pool to place from. The bench is deliberately every ACTIVE
// athlete this user can access — not just this specific team's official
// roster — so the board doubles as a flexible sketchpad (borrow a player
// from another team you coach, try out someone not rostered yet). Placing
// one auto-adds them to this team's roster (see placeAthlete) so the
// "official" roster stays in sync with who's actually been used, rather
// than the two views of "who's on this team" silently diverging.
export async function getLineupBoard(lineupId: string) {
  const user = await requireStaff();
  const lineup = await prisma.lineup.findUnique({
    where: { id: lineupId },
    include: {
      formation: { select: { id: true, name: true } },
      slots: { include: { athlete: { select: { id: true, displayName: true, jerseyNumber: true, primaryPosition: true, injuryStatus: true } } } },
      arrows: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!lineup) return null;
  await assertCanAccessTeam(user, lineup.teamId);

  const athleteIds = await accessibleAthleteIds(user);
  const athletes = await prisma.athlete.findMany({
    where: { ...(athleteIds === "ALL" ? {} : { id: { in: athleteIds } }), status: "ACTIVE" },
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true, jerseyNumber: true, primaryPosition: true, injuryStatus: true },
  });

  return { ...lineup, team: { rosterSpots: athletes.map((athlete) => ({ athlete })) } };
}

// A brand-new Lineup always starts blank (zero slots) — no formation is
// required to create or use a board. See applyFormationTemplate for the
// optional quick-fill.
export async function createLineup(teamId: string, name?: string): Promise<ActionResult> {
  const user = await requireStaff();
  await assertCanAccessTeam(user, teamId);
  const lineup = await prisma.lineup.create({
    data: { teamId, name: name?.trim() || "New board", createdById: user.id },
  });
  await logActivity({ userId: user.id, actionType: "LINEUP_CREATED", description: `Created board "${lineup.name}"` });
  revalidatePath("/teams/board");
  return { ok: true, id: lineup.id };
}

export async function renameLineup(lineupId: string, name: string): Promise<ActionResult> {
  const user = await requireStaff();
  const lineup = await prisma.lineup.findUnique({ where: { id: lineupId }, select: { teamId: true } });
  if (!lineup) return { ok: false, error: "Lineup not found." };
  await assertCanAccessTeam(user, lineup.teamId);
  if (!name.trim()) return { ok: false, error: "Name can't be empty." };
  await prisma.lineup.update({ where: { id: lineupId }, data: { name: name.trim() } });
  revalidatePath("/teams/board");
  return { ok: true };
}

export async function deleteLineup(lineupId: string): Promise<ActionResult> {
  const user = await requireStaff();
  const lineup = await prisma.lineup.findUnique({ where: { id: lineupId }, select: { teamId: true } });
  if (!lineup) return { ok: false, error: "Lineup not found." };
  await assertCanAccessTeam(user, lineup.teamId);
  await prisma.lineup.delete({ where: { id: lineupId } });
  revalidatePath("/teams/board");
  return { ok: true };
}

// Quick-fill: add one empty placeholder slot per position in a formation
// preset, at that preset's template coordinates. Only offered (see the
// board UI) while the lineup's OWN side has zero slots — refused otherwise
// so it never silently piles a second formation's worth of placeholders on
// top of a board a coach has already started placing athletes on (an
// opponent shape, if any, doesn't block this — the two sides are
// independent). Use `clearBoard` first to start over with a different
// preset.
export async function applyFormationTemplate(lineupId: string, formationId: string): Promise<ActionResult> {
  const user = await requireStaff();
  const lineup = await prisma.lineup.findUnique({ where: { id: lineupId }, select: { teamId: true } });
  if (!lineup) return { ok: false, error: "Lineup not found." };
  await assertCanAccessTeam(user, lineup.teamId);

  const existing = await prisma.lineupSlot.count({ where: { lineupId, side: "US" } });
  if (existing > 0) return { ok: false, error: "This board isn't empty — clear it first." };

  const formation = await prisma.formation.findUnique({ where: { id: formationId } });
  if (!formation) return { ok: false, error: "Formation not found." };
  const slots: { positionLabel: string; x: number; y: number }[] = JSON.parse(formation.slotsJson);

  await prisma.$transaction([
    prisma.lineup.update({ where: { id: lineupId }, data: { formationId } }),
    prisma.lineupSlot.createMany({ data: slots.map((s) => ({ lineupId, side: "US", positionLabel: s.positionLabel, x: s.x, y: s.y })) }),
  ]);
  revalidatePath("/teams/board");
  return { ok: true };
}

// Removes the coach's own-side slots from a board — everyone goes back to
// the bench — so a coach can start over (freeform, or with a different
// formation preset). Leaves a sketched-in opponent shape (if any) alone;
// use `clearOpponentFormation` for that side.
export async function clearBoard(lineupId: string): Promise<ActionResult> {
  const user = await requireStaff();
  const lineup = await prisma.lineup.findUnique({ where: { id: lineupId }, select: { teamId: true } });
  if (!lineup) return { ok: false, error: "Lineup not found." };
  await assertCanAccessTeam(user, lineup.teamId);
  await prisma.$transaction([
    prisma.lineupSlot.deleteMany({ where: { lineupId, side: "US" } }),
    prisma.lineup.update({ where: { id: lineupId }, data: { formationId: null } }),
  ]);
  revalidatePath("/teams/board");
  return { ok: true };
}

// --- Sketching in an opponent shape --------------------------------------
// Opponent markers are generic (never tied to the roster) so the team can
// see a possible opponent shape alongside their own. Mirrored (y' = 100-y)
// from the same preset coordinates so it faces the right way on the same
// pitch — their goal near the "opponent goal line" end, ours near the
// other.

export async function addOpponentFormation(lineupId: string, formationId: string): Promise<ActionResult> {
  const user = await requireStaff();
  const lineup = await prisma.lineup.findUnique({ where: { id: lineupId }, select: { teamId: true } });
  if (!lineup) return { ok: false, error: "Lineup not found." };
  await assertCanAccessTeam(user, lineup.teamId);

  const existing = await prisma.lineupSlot.count({ where: { lineupId, side: "OPPONENT" } });
  if (existing > 0) return { ok: false, error: "An opponent shape is already on the board — clear it first." };

  const formation = await prisma.formation.findUnique({ where: { id: formationId } });
  if (!formation) return { ok: false, error: "Formation not found." };
  const slots: { positionLabel: string; x: number; y: number }[] = JSON.parse(formation.slotsJson);

  await prisma.lineupSlot.createMany({
    data: slots.map((s) => ({ lineupId, side: "OPPONENT", positionLabel: s.positionLabel, x: s.x, y: 100 - s.y })),
  });
  revalidatePath("/teams/board");
  return { ok: true };
}

export async function clearOpponentFormation(lineupId: string): Promise<ActionResult> {
  const user = await requireStaff();
  const lineup = await prisma.lineup.findUnique({ where: { id: lineupId }, select: { teamId: true } });
  if (!lineup) return { ok: false, error: "Lineup not found." };
  await assertCanAccessTeam(user, lineup.teamId);
  await prisma.lineupSlot.deleteMany({ where: { lineupId, side: "OPPONENT" } });
  revalidatePath("/teams/board");
  return { ok: true };
}

// Repositioning an opponent marker is a plain move — there's no athlete
// identity to swap or displace, just a generic dot being dragged around.
export async function moveOpponentSlot(lineupId: string, slotId: string, x: number, y: number): Promise<ActionResult> {
  const user = await requireStaff();
  const lineup = await prisma.lineup.findUnique({ where: { id: lineupId }, select: { teamId: true } });
  if (!lineup) return { ok: false, error: "Lineup not found." };
  await assertCanAccessTeam(user, lineup.teamId);
  await prisma.lineupSlot.updateMany({
    where: { id: slotId, lineupId, side: "OPPONENT" },
    data: { x: clampPct(x), y: clampPct(y) },
  });
  return { ok: true };
}

// Deletes one empty placeholder slot outright (a coach decides a formation
// preset gave them one too many positions). Refuses if it's occupied —
// unassign it first (drag the athlete elsewhere, or use removeFromBoard).
export async function removeSlot(slotId: string): Promise<ActionResult> {
  const user = await requireStaff();
  const slot = await prisma.lineupSlot.findUnique({ where: { id: slotId }, include: { lineup: { select: { teamId: true } } } });
  if (!slot) return { ok: false, error: "Slot not found." };
  await assertCanAccessTeam(user, slot.lineup.teamId);
  if (slot.athleteId) return { ok: false, error: "That spot is occupied — move the athlete first." };
  await prisma.lineupSlot.delete({ where: { id: slotId } });
  revalidatePath("/teams/board");
  return { ok: true };
}

// Sends an athlete back to the bench (deletes their slot outright — a
// freeform slot has no "template default" to revert to).
export async function removeFromBoard(lineupId: string, athleteId: string): Promise<ActionResult> {
  const user = await requireStaff();
  const lineup = await prisma.lineup.findUnique({ where: { id: lineupId }, select: { teamId: true } });
  if (!lineup) return { ok: false, error: "Lineup not found." };
  await assertCanAccessTeam(user, lineup.teamId);
  await prisma.lineupSlot.deleteMany({ where: { lineupId, athleteId, side: "US" } });
  revalidatePath("/teams/board");
  return { ok: true };
}

// The board's core drag-drop mutation — freeform placement, not fixed
// slots. Four cases, driven by whether the athlete already has a slot in
// this lineup (`sourceSlot`) and whether the drop landed on a specific
// existing slot (`targetSlotId` — an empty placeholder or another athlete's
// token):
//   - no target, no source  -> place a brand-new slot at (x, y)
//   - no target, has source -> just move that slot to (x, y)
//   - target is empty       -> claim it (delete the old freeform slot, if any)
//   - target is occupied    -> swap (if source exists) or displace the
//                               occupant to the bench (if the athlete came
//                               from the bench — nowhere to send them)
export async function placeAthlete(
  lineupId: string,
  athleteId: string,
  x: number,
  y: number,
  targetSlotId?: string | null,
): Promise<ActionResult> {
  const user = await requireStaff();
  const lineup = await prisma.lineup.findUnique({ where: { id: lineupId }, select: { teamId: true } });
  if (!lineup) return { ok: false, error: "Lineup not found." };
  await assertCanAccessTeam(user, lineup.teamId);

  // Authorization is "can this user see this athlete at all" (see
  // getLineupBoard's comment) rather than "is this athlete already on this
  // team's roster" — placing them here is itself how they join it.
  try {
    await assertCanAccessAthlete(user, athleteId);
  } catch {
    return { ok: false, error: "You don't have access to that athlete." };
  }
  await prisma.rosterSpot.upsert({
    where: { athleteId_teamId: { athleteId, teamId: lineup.teamId } },
    update: {},
    create: { athleteId, teamId: lineup.teamId, status: "ACTIVE" },
  });

  const slots = await prisma.lineupSlot.findMany({ where: { lineupId, side: "US" } });
  const sourceSlot = slots.find((s) => s.athleteId === athleteId);
  const targetSlot = targetSlotId ? slots.find((s) => s.id === targetSlotId) : undefined;
  const cx = clampPct(x), cy = clampPct(y);

  if (targetSlot && targetSlot.id !== sourceSlot?.id) {
    if (targetSlot.athleteId) {
      // Occupied by someone else — swap, or displace them to the bench if
      // the incoming athlete came from the bench (no slot to send them to).
      await prisma.$transaction([
        prisma.lineupSlot.update({ where: { id: targetSlot.id }, data: { athleteId } }),
        ...(sourceSlot ? [prisma.lineupSlot.update({ where: { id: sourceSlot.id }, data: { athleteId: targetSlot.athleteId } })] : []),
      ]);
    } else {
      // An empty placeholder — claim it, dropping the old freeform slot (if any).
      await prisma.$transaction([
        prisma.lineupSlot.update({ where: { id: targetSlot.id }, data: { athleteId } }),
        ...(sourceSlot ? [prisma.lineupSlot.delete({ where: { id: sourceSlot.id } })] : []),
      ]);
    }
  } else if (sourceSlot) {
    await prisma.lineupSlot.update({ where: { id: sourceSlot.id }, data: { x: cx, y: cy } });
  } else {
    const athlete = await prisma.athlete.findUnique({ where: { id: athleteId }, select: { primaryPosition: true } });
    await prisma.lineupSlot.create({ data: { lineupId, athleteId, x: cx, y: cy, positionLabel: athlete?.primaryPosition ?? null } });
  }
  revalidatePath("/teams/board");
  return { ok: true };
}

// --- Sharing the board with the team -----------------------------------

// (Re)generates the share link and records the coach's game-plan message.
// A fresh token every time — the previous link (if any) stops working the
// moment a coach re-shares, same "old link is dead" posture as
// cancelAthleteInvite/revokeAthleteLogin elsewhere in this app.
export async function shareLineup(lineupId: string, notes: string): Promise<ActionResult & { token?: string }> {
  const user = await requireStaff();
  const lineup = await prisma.lineup.findUnique({ where: { id: lineupId }, select: { teamId: true } });
  if (!lineup) return { ok: false, error: "Lineup not found." };
  await assertCanAccessTeam(user, lineup.teamId);

  const token = crypto.randomUUID();
  await prisma.lineup.update({ where: { id: lineupId }, data: { shareToken: token, sharedAt: new Date(), notes: notes.trim() || null } });
  await logActivity({ userId: user.id, actionType: "LINEUP_SHARED", description: "Shared a board with the team" });
  revalidatePath("/teams/board");
  return { ok: true, token };
}

export async function unshareLineup(lineupId: string): Promise<ActionResult> {
  const user = await requireStaff();
  const lineup = await prisma.lineup.findUnique({ where: { id: lineupId }, select: { teamId: true } });
  if (!lineup) return { ok: false, error: "Lineup not found." };
  await assertCanAccessTeam(user, lineup.teamId);
  await prisma.lineup.update({ where: { id: lineupId }, data: { shareToken: null, sharedAt: null } });
  revalidatePath("/teams/board");
  return { ok: true };
}

// Public, unauthenticated lookup for the /share/lineup/[token] page — no
// requireStaff/requireUser here, the token itself is the credential (same
// posture as getInviteInfo). Only ever returns a lineup that is CURRENTLY
// shared (sharedAt set) — an unshared lineup's old token was already
// cleared in the same write, so this can't return stale data.
export async function getSharedLineup(token: string) {
  const lineup = await prisma.lineup.findFirst({
    where: { shareToken: token, sharedAt: { not: null } },
    include: {
      team: { select: { name: true, ageGroup: true, season: true } },
      formation: { select: { name: true } },
      slots: { include: { athlete: { select: { id: true, displayName: true, jerseyNumber: true, primaryPosition: true } } } },
      arrows: { orderBy: { createdAt: "asc" } },
    },
  });
  return lineup;
}

// --- The ball ----------------------------------------------------------
// One ball per board, dragged the same way a player is — see
// moveOpponentSlot for the same "plain position update, no swap/displace
// logic" shape (a ball has no identity to swap with either).

export async function addBall(lineupId: string): Promise<ActionResult> {
  const user = await requireStaff();
  const lineup = await prisma.lineup.findUnique({ where: { id: lineupId }, select: { teamId: true } });
  if (!lineup) return { ok: false, error: "Lineup not found." };
  await assertCanAccessTeam(user, lineup.teamId);
  await prisma.lineup.update({ where: { id: lineupId }, data: { ballX: 50, ballY: 50 } });
  revalidatePath("/teams/board");
  return { ok: true };
}

export async function removeBall(lineupId: string): Promise<ActionResult> {
  const user = await requireStaff();
  const lineup = await prisma.lineup.findUnique({ where: { id: lineupId }, select: { teamId: true } });
  if (!lineup) return { ok: false, error: "Lineup not found." };
  await assertCanAccessTeam(user, lineup.teamId);
  await prisma.lineup.update({ where: { id: lineupId }, data: { ballX: null, ballY: null } });
  revalidatePath("/teams/board");
  return { ok: true };
}

export async function moveBall(lineupId: string, x: number, y: number): Promise<ActionResult> {
  const user = await requireStaff();
  const lineup = await prisma.lineup.findUnique({ where: { id: lineupId }, select: { teamId: true } });
  if (!lineup) return { ok: false, error: "Lineup not found." };
  await assertCanAccessTeam(user, lineup.teamId);
  await prisma.lineup.update({ where: { id: lineupId }, data: { ballX: clampPct(x), ballY: clampPct(y) } });
  return { ok: true };
}

// --- Arrows (passes and player runs) ------------------------------------
// Purely diagrammatic — never move an athlete/the ball themselves. See
// LineupArrow's schema comment for why "play" (the animation) never writes
// back through these actions.

export async function addArrow(lineupId: string, kind: "PASS" | "RUN", fromX: number, fromY: number, toX: number, toY: number): Promise<ActionResult> {
  const user = await requireStaff();
  const lineup = await prisma.lineup.findUnique({ where: { id: lineupId }, select: { teamId: true } });
  if (!lineup) return { ok: false, error: "Lineup not found." };
  await assertCanAccessTeam(user, lineup.teamId);
  await prisma.lineupArrow.create({
    data: { lineupId, kind, fromX: clampPct(fromX), fromY: clampPct(fromY), toX: clampPct(toX), toY: clampPct(toY) },
  });
  revalidatePath("/teams/board");
  return { ok: true };
}

export async function removeArrow(arrowId: string): Promise<ActionResult> {
  const user = await requireStaff();
  const arrow = await prisma.lineupArrow.findUnique({ where: { id: arrowId }, include: { lineup: { select: { teamId: true } } } });
  if (!arrow) return { ok: false, error: "Not found." };
  await assertCanAccessTeam(user, arrow.lineup.teamId);
  await prisma.lineupArrow.delete({ where: { id: arrowId } });
  revalidatePath("/teams/board");
  return { ok: true };
}

export async function clearArrows(lineupId: string): Promise<ActionResult> {
  const user = await requireStaff();
  const lineup = await prisma.lineup.findUnique({ where: { id: lineupId }, select: { teamId: true } });
  if (!lineup) return { ok: false, error: "Lineup not found." };
  await assertCanAccessTeam(user, lineup.teamId);
  await prisma.lineupArrow.deleteMany({ where: { lineupId } });
  revalidatePath("/teams/board");
  return { ok: true };
}
