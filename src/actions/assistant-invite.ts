"use server";

// Public, unauthenticated actions behind /invite/assistant/[token] — an
// assistant coach setting their own password on an account the head coach
// already created (see actions/users.ts::generateAssistantInviteLink).
// No requireUser/requireRole here: the token itself is the credential.
// Mirrors actions/invite.ts's athlete flow, but updates an EXISTING User
// row instead of creating a new one — see AssistantInvite in
// prisma/schema.prisma for why.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, hashPassword, normalizeRole, dashboardPathFor } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { acceptAssistantInviteSchema } from "@/lib/validations";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ActionResult } from "./types";

const INVITE_ATTEMPT_MAX = 20;
const INVITE_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

function formToObject(fd: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) obj[k] = v;
  return obj;
}

export type AssistantInviteInfo = { valid: true; name: string } | { valid: false; reason: string };

export async function getAssistantInviteInfo(token: string): Promise<AssistantInviteInfo> {
  const invite = await prisma.assistantInvite.findUnique({
    where: { token },
    include: { user: { select: { name: true, active: true, mustChangePassword: true } } },
  });
  if (!invite) return { valid: false, reason: "This invite link isn't valid. Ask your head coach for a new one." };
  if (!invite.user.active) return { valid: false, reason: "This account has been deactivated. Contact your head coach." };
  if (!invite.user.mustChangePassword) return { valid: false, reason: "This invite has already been used." };
  if (invite.expiresAt < new Date()) return { valid: false, reason: "This invite link has expired. Ask your head coach for a new one." };
  return { valid: true, name: invite.user.name };
}

export async function acceptAssistantInvite(token: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!checkRateLimit(`assistant-invite-accept:${token}`, INVITE_ATTEMPT_MAX, INVITE_ATTEMPT_WINDOW_MS).ok) {
    return { ok: false, error: "Too many attempts on this invite link. Please wait a few minutes and try again." };
  }

  const invite = await prisma.assistantInvite.findUnique({ where: { token }, include: { user: true } });
  if (!invite || invite.expiresAt < new Date()) {
    return { ok: false, error: "This invite link is invalid or has expired. Ask your head coach for a new one." };
  }
  if (!invite.user.active) return { ok: false, error: "This account has been deactivated. Contact your head coach." };
  if (!invite.user.mustChangePassword) return { ok: false, error: "This invite has already been used." };

  const parsed = acceptAssistantInviteSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: invite.userId },
      data: { passwordHash: await hashPassword(parsed.data.password), mustChangePassword: false },
    }),
    prisma.assistantInvite.delete({ where: { token } }),
  ]);
  await logActivity({
    userId: invite.userId,
    actionType: "ASSISTANT_INVITE_ACCEPTED",
    description: `${invite.user.name} set their own password via invite`,
  });

  await createSession({
    id: invite.user.id,
    name: invite.user.name,
    email: invite.user.email,
    role: normalizeRole(invite.user.role),
    mustChangePassword: false,
    athleteId: null,
    allClientsAccess: invite.user.allClientsAccess,
    ownerId: invite.user.ownerId,
    sv: invite.user.sessionVersion,
  });
  redirect(dashboardPathFor(normalizeRole(invite.user.role)));
}
