"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOwner, requireStaff } from "@/lib/auth";
import { assertCanAccessTeam, assertCanAccessAthlete } from "@/lib/access";
import { setCurrentTeamId } from "@/lib/teams";
import { logActivity } from "@/lib/activity-log";
import { teamSchema } from "@/lib/validations";
import { generateInviteToken, INVITE_TTL_DAYS } from "@/lib/password";
import { emailSendingConfigured, sendInviteEmail } from "@/lib/email";
import { siteBaseUrl } from "@/lib/app-config";
import type { ActionResult } from "./types";

function formToObject(fd: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) obj[k] = v;
  return obj;
}

// --- Current-team switcher (staff) -------------------------------------------

export async function switchTeam(teamId: string, returnTo?: string) {
  const user = await requireStaff();
  await assertCanAccessTeam(user, teamId);
  await setCurrentTeamId(user.id, teamId);
  revalidatePath("/admin/dashboard");
  revalidatePath("/assistant/dashboard");
  if (returnTo) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}team=${teamId}`);
  return { ok: true };
}

// --- Team CRUD (head-coach-only) ---------------------------------------------

export async function createTeam(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireOwner();
  const parsed = teamSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const d = parsed.data;
  const team = await prisma.team.create({
    data: { name: d.name, ageGroup: d.ageGroup ?? null, season: d.season ?? null, coachId: user.id },
  });
  await logActivity({ userId: user.id, actionType: "TEAM_CREATED", description: `Created team ${team.name}` });
  revalidatePath("/admin/teams");
  redirect(`/admin/teams/${team.id}`);
}

export async function updateTeam(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireOwner();
  const existing = await prisma.team.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Team not found." };
  // Administrative team actions (rename/archive) are head-coach-only — an
  // assistant coach grant gives operational access (roster, board, matches),
  // not the right to edit another coach's team metadata.
  if (existing.coachId !== user.id) return { ok: false, error: "Team not found." };
  const parsed = teamSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const d = parsed.data;
  await prisma.team.update({
    where: { id },
    data: { name: d.name, ageGroup: d.ageGroup ?? null, season: d.season ?? null },
  });
  await logActivity({ userId: user.id, actionType: "TEAM_UPDATED", description: `Updated team ${d.name}` });
  revalidatePath(`/admin/teams/${id}`);
  revalidatePath("/admin/teams");
  return { ok: true, id };
}

export async function setTeamArchived(id: string, archived: boolean): Promise<ActionResult> {
  const user = await requireOwner();
  const existing = await prisma.team.findUnique({ where: { id }, select: { coachId: true } });
  if (!existing || existing.coachId !== user.id) return { ok: false, error: "Team not found." };
  await prisma.team.update({ where: { id }, data: { archived } });
  await logActivity({ userId: user.id, actionType: archived ? "TEAM_ARCHIVED" : "TEAM_UNARCHIVED", description: `${archived ? "Archived" : "Restored"} a team` });
  revalidatePath("/admin/teams");
  revalidatePath(`/admin/teams/${id}`);
  return { ok: true };
}

// --- Assistant coach assignment (head-coach-only) ----------------------------

export async function assignAssistantCoach(teamId: string, assistantCoachUserId: string): Promise<ActionResult> {
  const user = await requireOwner();
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { coachId: true } });
  if (!team || team.coachId !== user.id) return { ok: false, error: "Team not found." };
  const assistant = await prisma.user.findFirst({ where: { id: assistantCoachUserId, role: "ASSISTANT" }, select: { id: true, name: true } });
  if (!assistant) return { ok: false, error: "Assistant coach not found." };
  await prisma.teamAssistantCoach.upsert({
    where: { teamId_assistantCoachUserId: { teamId, assistantCoachUserId } },
    update: {},
    create: { teamId, assistantCoachUserId },
  });
  await logActivity({ userId: user.id, actionType: "ASSISTANT_COACH_ASSIGNED", description: `Assigned ${assistant.name} to team` });
  revalidatePath(`/admin/teams/${teamId}`);
  return { ok: true };
}

export async function unassignAssistantCoach(teamId: string, assistantCoachUserId: string): Promise<ActionResult> {
  const user = await requireOwner();
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { coachId: true } });
  if (!team || team.coachId !== user.id) return { ok: false, error: "Team not found." };
  await prisma.teamAssistantCoach.deleteMany({ where: { teamId, assistantCoachUserId } });
  await logActivity({ userId: user.id, actionType: "ASSISTANT_COACH_UNASSIGNED", description: "Unassigned an assistant coach from team" });
  revalidatePath(`/admin/teams/${teamId}`);
  return { ok: true };
}

// --- Roster management (head-coach-only) -------------------------------------
// Upsert-on-add / status-flip-on-remove rather than hard delete, so an
// athlete's match-history from a prior roster stint stays attached to a real
// RosterSpot row rather than an orphaned one.

export async function addToRoster(teamId: string, athleteId: string): Promise<ActionResult> {
  const user = await requireOwner();
  await assertCanAccessTeam(user, teamId);
  await assertCanAccessAthlete(user, athleteId);
  const athlete = await prisma.athlete.findUnique({ where: { id: athleteId }, select: { id: true, displayName: true } });
  if (!athlete) return { ok: false, error: "Athlete not found." };
  await prisma.rosterSpot.upsert({
    where: { athleteId_teamId: { athleteId, teamId } },
    update: { status: "ACTIVE" },
    create: { athleteId, teamId, status: "ACTIVE" },
  });
  await logActivity({ userId: user.id, athleteId, actionType: "ROSTERED", description: `Added ${athlete.displayName} to the roster` });
  revalidatePath(`/admin/teams/${teamId}`);
  return { ok: true };
}

export async function removeFromRoster(teamId: string, athleteId: string): Promise<ActionResult> {
  const user = await requireOwner();
  await assertCanAccessTeam(user, teamId);
  await assertCanAccessAthlete(user, athleteId);
  await prisma.rosterSpot.updateMany({ where: { teamId, athleteId }, data: { status: "INACTIVE" } });
  await logActivity({ userId: user.id, athleteId, actionType: "UNROSTERED", description: "Removed an athlete from the roster" });
  revalidatePath(`/admin/teams/${teamId}`);
  return { ok: true };
}

// --- Bulk athlete-invite emails (head-coach-only) ----------------------------
// One button on the team roster: generate (or reuse) a self-service portal
// invite for every rostered athlete who has an email on file and no portal
// login yet, then email each one via Gmail SMTP (see lib/email.ts). Athletes
// who already have a login, or have no email on file, are skipped and
// counted back rather than silently dropped — the button's toast reports
// exactly what happened.

export type BulkInviteResult =
  | { ok: true; sent: number; skippedNoEmail: number; skippedAlreadyLinked: number; failed: number; firstError: string | null }
  | { ok: false; error: string };

export async function sendTeamInvites(teamId: string): Promise<BulkInviteResult> {
  const user = await requireOwner();
  await assertCanAccessTeam(user, teamId);

  if (!(await emailSendingConfigured())) {
    return { ok: false, error: "Email sending isn't set up yet — add a Gmail address and App Password in Settings." };
  }

  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { name: true } });
  if (!team) return { ok: false, error: "Team not found." };

  const rosterSpots = await prisma.rosterSpot.findMany({
    where: { teamId, status: "ACTIVE" },
    include: { athlete: { select: { id: true, displayName: true, email: true, linkedUserId: true } } },
  });

  let sent = 0, skippedNoEmail = 0, skippedAlreadyLinked = 0, failed = 0;
  let firstError: string | null = null;
  let authFailed = false; // an SMTP auth failure fails identically for every remaining athlete

  for (const { athlete } of rosterSpots) {
    if (athlete.linkedUserId) { skippedAlreadyLinked++; continue; }
    if (!athlete.email) { skippedNoEmail++; continue; }
    // Once the Gmail credentials themselves are confirmed bad, stop retrying
    // them — every remaining send would fail the same way, and repeated
    // failed SMTP logins risk Gmail temporarily blocking the account.
    if (authFailed) { failed++; continue; }

    const token = generateInviteToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    await prisma.athleteInvite.upsert({
      where: { athleteId: athlete.id },
      create: { athleteId: athlete.id, token, expiresAt },
      update: { token, expiresAt },
    });

    try {
      await sendInviteEmail({
        to: athlete.email,
        athleteName: athlete.displayName,
        coachName: user.name,
        coachEmail: user.email,
        teamName: team.name,
        inviteUrl: `${siteBaseUrl()}/invite/${token}`,
      });
      sent++;
      await logActivity({
        userId: user.id, athleteId: athlete.id, actionType: "ATHLETE_INVITE_EMAIL_SENT",
        description: `Emailed a portal invite link to ${athlete.displayName}`,
      });
    } catch (e) {
      failed++;
      const message = e instanceof Error ? e.message : String(e);
      firstError ??= message;
      // Nodemailer sets code "EAUTH" for a rejected login (bad address/App
      // Password) — a connection-level failure, not this one athlete's fault.
      if ((e as { code?: string })?.code === "EAUTH") authFailed = true;
      console.error(`[sendTeamInvites] failed to email ${athlete.email}`, e);
    }
  }

  revalidatePath(`/admin/teams/${teamId}`);
  return { ok: true, sent, skippedNoEmail, skippedAlreadyLinked, failed, firstError };
}
