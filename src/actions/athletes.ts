"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { assertCanAccessAthlete } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";
import { athleteSchema } from "@/lib/validations";
import { generateInviteToken, INVITE_TTL_DAYS } from "@/lib/password";
import { checkAthleteEmailAllowed } from "@/lib/allowed-email";
import { emailSendingConfigured, sendInviteEmail } from "@/lib/email";
import { siteBaseUrl } from "@/lib/app-config";
import type { ActionResult } from "./types";

function formToObject(fd: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) obj[k] = v;
  return obj;
}

// --- Create / edit athletes (head-coach-only) --------------------------------

export async function createAthlete(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireOwner();
  const parsed = athleteSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const d = parsed.data;
  if (d.email) {
    const emailError = await checkAthleteEmailAllowed(d.email);
    if (emailError) return { ok: false, error: emailError, fieldErrors: { email: emailError } };
  }
  const athlete = await prisma.athlete.create({
    data: {
      displayName: d.displayName,
      dateOfBirth: d.dateOfBirth ?? null,
      jerseyNumber: d.jerseyNumber ?? null,
      primaryPosition: d.primaryPosition ?? null,
      secondaryPositions: d.secondaryPositions ? JSON.stringify(d.secondaryPositions) : null,
      dominantFoot: d.dominantFoot ?? null,
      status: d.status,
      injuryStatus: d.injuryStatus,
      injuryNote: d.injuryNote ?? null,
      injuryUpdatedAt: d.injuryStatus !== "HEALTHY" ? new Date() : null,
      notes: d.notes ?? null,
      email: d.email || null,
      createdByUserId: user.id,
    },
  });
  await logActivity({ userId: user.id, athleteId: athlete.id, actionType: "ATHLETE_CREATED", description: `Created athlete ${athlete.displayName}` });
  revalidatePath("/admin/athletes");
  redirect(`/admin/athletes/${athlete.id}`);
}

export async function updateAthlete(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireOwner();
  const existing = await prisma.athlete.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Athlete not found." };
  await assertCanAccessAthlete(user, id);
  const parsed = athleteSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const d = parsed.data;
  if (d.email && d.email !== existing.email) {
    const emailError = await checkAthleteEmailAllowed(d.email);
    if (emailError) return { ok: false, error: emailError, fieldErrors: { email: emailError } };
  }
  await prisma.athlete.update({
    where: { id },
    data: {
      displayName: d.displayName,
      dateOfBirth: d.dateOfBirth ?? null,
      jerseyNumber: d.jerseyNumber ?? null,
      primaryPosition: d.primaryPosition ?? null,
      secondaryPositions: d.secondaryPositions ? JSON.stringify(d.secondaryPositions) : null,
      dominantFoot: d.dominantFoot ?? null,
      status: d.status,
      injuryStatus: d.injuryStatus,
      injuryNote: d.injuryNote ?? null,
      injuryUpdatedAt: d.injuryStatus !== existing.injuryStatus ? new Date() : existing.injuryUpdatedAt,
      notes: d.notes ?? null,
      email: d.email || null,
    },
  });
  await logActivity({ userId: user.id, athleteId: id, actionType: "ATHLETE_UPDATED", description: `Updated athlete ${d.displayName}` });
  revalidatePath(`/admin/athletes/${id}`);
  revalidatePath("/admin/athletes");
  return { ok: true, id };
}

export async function setAthleteStatus(id: string, status: "ACTIVE" | "INACTIVE" | "ARCHIVED") {
  const user = await requireOwner();
  await assertCanAccessAthlete(user, id);
  await prisma.athlete.update({ where: { id }, data: { status } });
  await logActivity({ userId: user.id, athleteId: id, actionType: "ATHLETE_STATUS_CHANGED", newValue: status, description: `Set athlete status to ${status}` });
  revalidatePath("/admin/athletes");
  revalidatePath(`/admin/athletes/${id}`);
  return { ok: true };
}

// Quick-set from the roster table or the athlete detail page — the
// at-a-glance availability signal (see prisma/schema.prisma::Athlete).
export async function setAthleteInjuryStatus(id: string, injuryStatus: "HEALTHY" | "QUESTIONABLE" | "OUT", note?: string) {
  const user = await requireOwner();
  await assertCanAccessAthlete(user, id);
  await prisma.athlete.update({
    where: { id },
    data: { injuryStatus, injuryNote: note ?? null, injuryUpdatedAt: new Date() },
  });
  await logActivity({ userId: user.id, athleteId: id, actionType: "ATHLETE_INJURY_STATUS_CHANGED", newValue: injuryStatus, description: `Set injury status to ${injuryStatus}` });
  revalidatePath("/admin/athletes");
  revalidatePath(`/admin/athletes/${id}`);
  return { ok: true };
}

// --- Athlete portal invite (head-coach-only): generate a self-service link --
// The coach no longer picks the athlete's email/password — they generate a
// link, share it (copy/paste anywhere — no email transport required, though
// see actions/teams.ts::sendTeamInvites for the optional Gmail-backed bulk
// send), and the athlete sets their own email + password by visiting
// /invite/[token] (see actions/invite.ts::acceptAthleteInvite).

export type InviteLinkResult = { ok: true; token: string; expiresAt: string } | { ok: false; error: string };

export async function generateAthleteInviteLink(athleteId: string): Promise<InviteLinkResult> {
  const user = await requireOwner();
  const athlete = await prisma.athlete.findUnique({ where: { id: athleteId }, select: { id: true, displayName: true, linkedUserId: true } });
  if (!athlete) return { ok: false, error: "Athlete not found." };
  await assertCanAccessAthlete(user, athleteId);
  if (athlete.linkedUserId) return { ok: false, error: "This athlete already has a portal login." };

  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.athleteInvite.upsert({
    where: { athleteId },
    create: { athleteId, token, expiresAt },
    update: { token, expiresAt },
  });
  await logActivity({ userId: user.id, athleteId, actionType: "ATHLETE_INVITE_LINK_CREATED", description: `Generated a portal invite link for ${athlete.displayName}` });
  revalidatePath(`/admin/athletes/${athleteId}`);
  return { ok: true, token, expiresAt: expiresAt.toISOString() };
}

export async function cancelAthleteInvite(athleteId: string): Promise<ActionResult> {
  const user = await requireOwner();
  await assertCanAccessAthlete(user, athleteId);
  await prisma.athleteInvite.deleteMany({ where: { athleteId } });
  await logActivity({ userId: user.id, athleteId, actionType: "ATHLETE_INVITE_LINK_CANCELLED", description: "Cancelled a pending portal invite link" });
  revalidatePath(`/admin/athletes/${athleteId}`);
  return { ok: true };
}

// Individually email one athlete's invite link — the single-athlete
// counterpart to actions/teams.ts::sendTeamInvites' bulk send. Generates
// (or reuses) the invite token exactly like generateAthleteInviteLink above,
// so a coach can freely mix "copy link" and "email it" for the same athlete.
export async function sendAthleteInviteEmail(athleteId: string): Promise<ActionResult> {
  const user = await requireOwner();
  const athlete = await prisma.athlete.findUnique({
    where: { id: athleteId },
    select: {
      id: true, displayName: true, email: true, linkedUserId: true,
      rosterSpots: { where: { status: "ACTIVE" }, select: { team: { select: { name: true } } }, take: 1 },
    },
  });
  if (!athlete) return { ok: false, error: "Athlete not found." };
  await assertCanAccessAthlete(user, athleteId);
  if (athlete.linkedUserId) return { ok: false, error: "This athlete already has a portal login." };
  if (!athlete.email) return { ok: false, error: "Add an email address for this athlete first." };
  if (!(await emailSendingConfigured())) {
    return { ok: false, error: "Email sending isn't set up yet — add a Gmail address and App Password in Settings." };
  }

  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.athleteInvite.upsert({
    where: { athleteId },
    create: { athleteId, token, expiresAt },
    update: { token, expiresAt },
  });

  try {
    await sendInviteEmail({
      to: athlete.email,
      athleteName: athlete.displayName,
      coachName: user.name,
      coachEmail: user.email,
      teamName: athlete.rosterSpots[0]?.team.name ?? "the team",
      inviteUrl: `${siteBaseUrl()}/invite/${token}`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Couldn't send the invite email: ${message}` };
  }

  await logActivity({ userId: user.id, athleteId, actionType: "ATHLETE_INVITE_EMAIL_SENT", description: `Emailed a portal invite link to ${athlete.displayName}` });
  revalidatePath(`/admin/athletes/${athleteId}`);
  return { ok: true };
}

export async function revokeAthleteLogin(athleteId: string): Promise<ActionResult> {
  const user = await requireOwner();
  await assertCanAccessAthlete(user, athleteId);
  const athlete = await prisma.athlete.findUnique({ where: { id: athleteId }, select: { linkedUserId: true } });
  if (!athlete?.linkedUserId) return { ok: false, error: "No portal login to revoke." };
  // Deactivate the login and bump its session version (immediate logout).
  await prisma.user.update({ where: { id: athlete.linkedUserId }, data: { active: false, sessionVersion: { increment: 1 } } });
  await logActivity({ userId: user.id, athleteId, actionType: "ATHLETE_LOGIN_REVOKED", description: "Revoked athlete's portal login" });
  revalidatePath(`/admin/athletes/${athleteId}`);
  return { ok: true };
}

// Un-revoke: the athlete's existing login (same email/password) works
// again. For "I revoked this by mistake" or a temporary suspension — see
// resetAthleteLogin below for "give them a brand new one instead."
export async function reinstateAthleteLogin(athleteId: string): Promise<ActionResult> {
  const user = await requireOwner();
  await assertCanAccessAthlete(user, athleteId);
  const athlete = await prisma.athlete.findUnique({ where: { id: athleteId }, select: { linkedUserId: true } });
  if (!athlete?.linkedUserId) return { ok: false, error: "No portal login to reinstate." };
  const linked = await prisma.user.findUnique({ where: { id: athlete.linkedUserId }, select: { active: true } });
  if (linked?.active) return { ok: false, error: "This login is already active." };
  await prisma.user.update({ where: { id: athlete.linkedUserId }, data: { active: true } });
  await logActivity({ userId: user.id, athleteId, actionType: "ATHLETE_LOGIN_REINSTATED", description: "Reinstated athlete's portal login" });
  revalidatePath(`/admin/athletes/${athleteId}`);
  return { ok: true };
}

// Full reset for a revoked login: permanently detach the old (revoked)
// account from this athlete and generate a fresh invite so they set up a
// brand new email/password — for when the old credentials shouldn't come
// back (lost access to that email, coach wants a clean slate) rather than
// just un-revoking the same one. The old User row is left deactivated,
// unlinked, and otherwise untouched (not deleted — it may carry activity
// history) so it never resurfaces as anyone's login again.
export async function resetAthleteLogin(athleteId: string): Promise<InviteLinkResult> {
  const user = await requireOwner();
  const athlete = await prisma.athlete.findUnique({ where: { id: athleteId }, select: { id: true, displayName: true, linkedUserId: true } });
  if (!athlete) return { ok: false, error: "Athlete not found." };
  await assertCanAccessAthlete(user, athleteId);
  if (!athlete.linkedUserId) return { ok: false, error: "No portal login to reset." };

  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.$transaction([
    prisma.user.update({ where: { id: athlete.linkedUserId }, data: { active: false, sessionVersion: { increment: 1 } } }),
    prisma.athlete.update({ where: { id: athleteId }, data: { linkedUserId: null } }),
    prisma.athleteInvite.upsert({
      where: { athleteId },
      create: { athleteId, token, expiresAt },
      update: { token, expiresAt },
    }),
  ]);
  await logActivity({ userId: user.id, athleteId, actionType: "ATHLETE_LOGIN_RESET", description: `Reset ${athlete.displayName}'s portal login and generated a new invite link` });
  revalidatePath(`/admin/athletes/${athleteId}`);
  return { ok: true, token, expiresAt: expiresAt.toISOString() };
}
