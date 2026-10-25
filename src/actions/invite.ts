"use server";

// Public, unauthenticated actions behind /invite/[token] — an athlete
// accepting a self-service portal invite link a coach generated (see
// actions/athletes.ts::generateAthleteInviteLink). No requireUser/
// requireOwner here: the token itself is the credential.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, hashPassword } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { acceptAthleteInviteSchema } from "@/lib/validations";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ActionResult } from "./types";

const INVITE_ATTEMPT_MAX = 20;
const INVITE_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

function formToObject(fd: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) obj[k] = v;
  return obj;
}

export type InviteInfo = { valid: true; athleteName: string } | { valid: false; reason: string };

// Looked up by the invite page before rendering the form, so an expired/used
// link shows a clear message instead of a broken form.
export async function getInviteInfo(token: string): Promise<InviteInfo> {
  const invite = await prisma.athleteInvite.findUnique({
    where: { token },
    include: { athlete: { select: { displayName: true, linkedUserId: true } } },
  });
  if (!invite) return { valid: false, reason: "This invite link isn't valid. Ask your coach for a new one." };
  if (invite.athlete.linkedUserId) return { valid: false, reason: "This invite has already been used." };
  if (invite.expiresAt < new Date()) return { valid: false, reason: "This invite link has expired. Ask your coach for a new one." };
  return { valid: true, athleteName: invite.athlete.displayName };
}

export async function acceptAthleteInvite(token: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!checkRateLimit(`invite-accept:${token}`, INVITE_ATTEMPT_MAX, INVITE_ATTEMPT_WINDOW_MS).ok) {
    return { ok: false, error: "Too many attempts on this invite link. Please wait a few minutes and try again." };
  }

  const invite = await prisma.athleteInvite.findUnique({
    where: { token },
    include: { athlete: { select: { id: true, displayName: true, linkedUserId: true } } },
  });
  if (!invite || invite.expiresAt < new Date()) {
    return { ok: false, error: "This invite link is invalid or has expired. Ask your coach for a new one." };
  }
  if (invite.athlete.linkedUserId) return { ok: false, error: "This invite has already been used." };

  const parsed = acceptAthleteInviteSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }

  const email = parsed.data.email.toLowerCase().trim();
  const clash = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (clash) return { ok: false, error: "That email is already in use." };

  const created = await prisma.user.create({
    data: {
      name: invite.athlete.displayName,
      email,
      passwordHash: await hashPassword(parsed.data.password),
      role: "CLIENT",
    },
  });
  await prisma.$transaction([
    prisma.athlete.update({ where: { id: invite.athleteId }, data: { linkedUserId: created.id } }),
    prisma.athleteInvite.delete({ where: { token } }),
  ]);
  await logActivity({
    userId: created.id,
    athleteId: invite.athleteId,
    actionType: "ATHLETE_INVITE_ACCEPTED",
    description: `${invite.athlete.displayName} created their own portal login`,
  });

  await createSession({
    id: created.id,
    name: created.name,
    email: created.email,
    role: "CLIENT",
    athleteId: invite.athleteId,
    allClientsAccess: false,
    sv: created.sessionVersion,
  });
  redirect("/portal/dashboard");
}
