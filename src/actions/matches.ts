"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { assertCanAccessTeam } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";
import type { ActionResult } from "./types";

function formToObject(fd: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) obj[k] = v;
  return obj;
}

export async function listMatchesForTeam(teamId: string) {
  const user = await requireStaff();
  await assertCanAccessTeam(user, teamId);
  return prisma.match.findMany({ where: { teamId }, orderBy: { date: "desc" } });
}

export async function createMatch(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireStaff();
  const raw = formToObject(formData);
  const teamId = String(raw.teamId ?? "");
  if (!teamId) return { ok: false, error: "Pick a team first." };
  await assertCanAccessTeam(user, teamId);

  const opponent = String(raw.opponent ?? "").trim();
  if (!opponent) return { ok: false, error: "Opponent is required.", fieldErrors: { opponent: "Required" } };
  const date = raw.date ? new Date(String(raw.date)) : null;
  if (!date || Number.isNaN(date.getTime())) return { ok: false, error: "A valid date/time is required.", fieldErrors: { date: "Required" } };
  const periodCount = Math.max(1, Math.min(8, Number(raw.periodCount) || 2));
  const periodMinutes = Math.max(1, Math.min(90, Number(raw.periodMinutes) || 40));

  const match = await prisma.match.create({
    data: {
      teamId,
      opponent,
      date,
      isHome: raw.isHome === "on" || raw.isHome === "true",
      periodCount,
      periodMinutes,
      notes: raw.notes ? String(raw.notes) : null,
      createdById: user.id,
    },
  });
  await logActivity({ userId: user.id, actionType: "MATCH_CREATED", description: `Scheduled a match vs ${opponent}` });
  revalidatePath("/teams/matches");
  redirect(`/teams/matches/${match.id}/plan`);
}

export async function updateMatch(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireStaff();
  const existing = await prisma.match.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Match not found." };
  await assertCanAccessTeam(user, existing.teamId);

  const raw = formToObject(formData);
  const opponent = String(raw.opponent ?? "").trim();
  if (!opponent) return { ok: false, error: "Opponent is required.", fieldErrors: { opponent: "Required" } };
  const date = raw.date ? new Date(String(raw.date)) : null;
  if (!date || Number.isNaN(date.getTime())) return { ok: false, error: "A valid date/time is required.", fieldErrors: { date: "Required" } };

  await prisma.match.update({
    where: { id },
    data: {
      opponent,
      date,
      isHome: raw.isHome === "on" || raw.isHome === "true",
      periodCount: Math.max(1, Math.min(8, Number(raw.periodCount) || existing.periodCount)),
      periodMinutes: Math.max(1, Math.min(90, Number(raw.periodMinutes) || existing.periodMinutes)),
      notes: raw.notes ? String(raw.notes) : null,
    },
  });
  revalidatePath("/teams/matches");
  revalidatePath(`/teams/matches/${id}/plan`);
  return { ok: true, id };
}

export async function setMatchStatus(id: string, status: "SCHEDULED" | "COMPLETED" | "CANCELLED"): Promise<ActionResult> {
  const user = await requireStaff();
  const match = await prisma.match.findUnique({ where: { id }, select: { teamId: true } });
  if (!match) return { ok: false, error: "Match not found." };
  await assertCanAccessTeam(user, match.teamId);
  await prisma.match.update({ where: { id }, data: { status } });
  revalidatePath("/teams/matches");
  return { ok: true };
}

export async function deleteMatch(id: string): Promise<ActionResult> {
  const user = await requireStaff();
  const match = await prisma.match.findUnique({ where: { id }, select: { teamId: true } });
  if (!match) return { ok: false, error: "Match not found." };
  await assertCanAccessTeam(user, match.teamId);
  await prisma.match.delete({ where: { id } });
  revalidatePath("/teams/matches");
  return { ok: true };
}

// --- The substitution planner -----------------------------------------------

export async function getMatchPlan(matchId: string) {
  const user = await requireStaff();
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      team: { include: { rosterSpots: { where: { status: "ACTIVE" }, include: { athlete: { select: { id: true, displayName: true, jerseyNumber: true, primaryPosition: true, injuryStatus: true } } } } } },
      appearances: { orderBy: [{ periodIndex: "asc" }, { startMinute: "asc" }] },
      lineups: { orderBy: { updatedAt: "desc" }, select: { id: true, name: true, formation: { select: { name: true } } } },
    },
  });
  if (!match) return null;
  await assertCanAccessTeam(user, match.teamId);
  return match;
}

// Seeds a period from a saved Lineup's starting XI — one open appearance
// (startMinute 0, endMinute null) per assigned slot. Refuses if the period
// already has appearances (use "clear period" first) so this never silently
// duplicates a period's plan.
export async function seedPeriodFromLineup(matchId: string, periodIndex: number, lineupId: string): Promise<ActionResult> {
  const user = await requireStaff();
  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { teamId: true } });
  if (!match) return { ok: false, error: "Match not found." };
  await assertCanAccessTeam(user, match.teamId);

  const existing = await prisma.matchAppearance.count({ where: { matchId, periodIndex } });
  if (existing > 0) return { ok: false, error: "This period already has a plan — clear it first." };

  const lineup = await prisma.lineup.findUnique({ where: { id: lineupId }, include: { slots: true } });
  if (!lineup || lineup.teamId !== match.teamId) return { ok: false, error: "Lineup not found." };
  const assigned = lineup.slots.filter((s) => s.athleteId);
  if (assigned.length === 0) return { ok: false, error: "That lineup has no athletes assigned yet." };

  await prisma.matchAppearance.createMany({
    data: assigned.map((s) => ({ matchId, athleteId: s.athleteId!, periodIndex, startMinute: 0, endMinute: null, slotKey: s.positionLabel })),
  });
  revalidatePath(`/teams/matches/${matchId}/plan`);
  return { ok: true };
}

// Copies whoever is still on the field at the end of the previous period
// into fresh open appearances for this period — the common "same XI carries
// into the next half" case, without re-picking a lineup.
export async function carryOverPeriod(matchId: string, fromPeriodIndex: number, toPeriodIndex: number): Promise<ActionResult> {
  const user = await requireStaff();
  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { teamId: true } });
  if (!match) return { ok: false, error: "Match not found." };
  await assertCanAccessTeam(user, match.teamId);

  const existing = await prisma.matchAppearance.count({ where: { matchId, periodIndex: toPeriodIndex } });
  if (existing > 0) return { ok: false, error: "This period already has a plan — clear it first." };

  const openOnes = await prisma.matchAppearance.findMany({ where: { matchId, periodIndex: fromPeriodIndex, endMinute: null } });
  if (openOnes.length === 0) return { ok: false, error: "No one was still on at the end of that period." };

  await prisma.matchAppearance.createMany({
    data: openOnes.map((a) => ({ matchId, athleteId: a.athleteId, periodIndex: toPeriodIndex, startMinute: 0, endMinute: null, slotKey: a.slotKey })),
  });
  revalidatePath(`/teams/matches/${matchId}/plan`);
  return { ok: true };
}

export async function clearPeriod(matchId: string, periodIndex: number): Promise<ActionResult> {
  const user = await requireStaff();
  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { teamId: true } });
  if (!match) return { ok: false, error: "Match not found." };
  await assertCanAccessTeam(user, match.teamId);
  await prisma.matchAppearance.deleteMany({ where: { matchId, periodIndex } });
  revalidatePath(`/teams/matches/${matchId}/plan`);
  return { ok: true };
}

// The core substitution move: end `offAthleteId`'s open appearance at
// `minute` (if they have one this period) and start a fresh open appearance
// for `onAthleteId` at the same minute, optionally taking over their slot.
export async function makeSubstitution(
  matchId: string,
  periodIndex: number,
  minute: number,
  offAthleteId: string | null,
  onAthleteId: string,
): Promise<ActionResult> {
  const user = await requireStaff();
  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { teamId: true, periodMinutes: true } });
  if (!match) return { ok: false, error: "Match not found." };
  await assertCanAccessTeam(user, match.teamId);
  if (minute < 0 || minute > match.periodMinutes) return { ok: false, error: `Minute must be between 0 and ${match.periodMinutes}.` };

  const onSpot = await prisma.rosterSpot.findUnique({ where: { athleteId_teamId: { athleteId: onAthleteId, teamId: match.teamId } } });
  if (!onSpot || onSpot.status !== "ACTIVE") return { ok: false, error: "That athlete isn't on this team's roster." };

  const alreadyOn = await prisma.matchAppearance.findFirst({ where: { matchId, periodIndex, athleteId: onAthleteId, endMinute: null } });
  if (alreadyOn) return { ok: false, error: "That athlete is already on the field this period." };

  let slotKey: string | null = null;
  if (offAthleteId) {
    const offApp = await prisma.matchAppearance.findFirst({ where: { matchId, periodIndex, athleteId: offAthleteId, endMinute: null } });
    if (!offApp) return { ok: false, error: "That athlete isn't currently on the field this period." };
    if (minute < offApp.startMinute) return { ok: false, error: "Substitution minute must be after they came on." };
    slotKey = offApp.slotKey;
    await prisma.matchAppearance.update({ where: { id: offApp.id }, data: { endMinute: minute } });
  }

  await prisma.matchAppearance.create({
    data: { matchId, athleteId: onAthleteId, periodIndex, startMinute: minute, endMinute: null, slotKey },
  });
  revalidatePath(`/teams/matches/${matchId}/plan`);
  return { ok: true };
}

export async function removeAppearance(appearanceId: string): Promise<ActionResult> {
  const user = await requireStaff();
  const appearance = await prisma.matchAppearance.findUnique({ where: { id: appearanceId }, include: { match: { select: { teamId: true, id: true } } } });
  if (!appearance) return { ok: false, error: "Not found." };
  await assertCanAccessTeam(user, appearance.match.teamId);
  await prisma.matchAppearance.delete({ where: { id: appearanceId } });
  revalidatePath(`/teams/matches/${appearance.match.id}/plan`);
  return { ok: true };
}
