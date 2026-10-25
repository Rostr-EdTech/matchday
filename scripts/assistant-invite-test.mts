// Scripted test for the assistant-coach self-service invite link
// (AssistantInvite) — an alternate onboarding path alongside the
// coach-issued temp password. Run:
// node --env-file=.env --import tsx scripts/assistant-invite-test.mts
//
// src/actions/users.ts and src/actions/assistant-invite.ts both import
// "server-only" (and the latter calls createSession(), which needs a real
// request's cookies), so the accept flow's core logic is re-implemented
// inline against a self-contained fixture, same approach as
// scripts/feedback-test.mts.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${name}`);
  if (!cond) failures++;
}

function token(): string {
  return randomBytes(32).toString("base64url");
}

async function main() {
  console.log("Real-DB fixture — an assistant coach's invite lifecycle:");
  const coach = await prisma.user.findFirstOrThrow({ where: { email: "coach@matchday.test" } });

  await prisma.user.deleteMany({ where: { email: "test-assistant-invite@matchday.test" } });
  const tempPasswordHash = await bcrypt.hash("Temp-Pass-123!", 10);
  const assistant = await prisma.user.create({
    data: {
      id: "test-assistant-invite-user",
      name: "[test fixture] Assistant",
      email: "test-assistant-invite@matchday.test",
      passwordHash: tempPasswordHash,
      role: "ASSISTANT",
      ownerId: coach.id,
      mustChangePassword: true,
    },
  });
  check("a freshly-created assistant starts with mustChangePassword true", assistant.mustChangePassword === true);

  // generateAssistantInviteLink's logic.
  const inviteToken = token();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.assistantInvite.upsert({
    where: { userId: assistant.id },
    create: { userId: assistant.id, token: inviteToken, expiresAt },
    update: { token: inviteToken, expiresAt },
  });
  const invite = await prisma.assistantInvite.findUniqueOrThrow({ where: { userId: assistant.id } });
  check("generating an invite creates exactly one row for this assistant", invite.token === inviteToken);

  // Regenerating replaces the token rather than creating a second row
  // (upsert on the unique userId, mirroring generateAssistantInviteLink).
  const secondToken = token();
  await prisma.assistantInvite.upsert({
    where: { userId: assistant.id },
    create: { userId: assistant.id, token: secondToken, expiresAt },
    update: { token: secondToken, expiresAt },
  });
  const allInvitesForAssistant = await prisma.assistantInvite.findMany({ where: { userId: assistant.id } });
  check("regenerating replaces the token rather than adding a second invite", allInvitesForAssistant.length === 1 && allInvitesForAssistant[0].token === secondToken);

  // getAssistantInviteInfo's validity logic against the current (regenerated) token.
  const lookup = await prisma.assistantInvite.findUnique({
    where: { token: secondToken },
    include: { user: { select: { name: true, active: true, mustChangePassword: true } } },
  });
  check("the invite resolves back to the right assistant", lookup?.user.name === assistant.name);
  check("it's still valid: user active, still pending, not expired", !!lookup && lookup.user.active && lookup.user.mustChangePassword && lookup.expiresAt > new Date());

  // acceptAssistantInvite's core logic: set a new password, flip
  // mustChangePassword, delete the invite — as one transaction.
  const newPasswordHash = await bcrypt.hash("My-Own-Password-1!", 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: assistant.id }, data: { passwordHash: newPasswordHash, mustChangePassword: false } }),
    prisma.assistantInvite.delete({ where: { token: secondToken } }),
  ]);
  const afterAccept = await prisma.user.findUniqueOrThrow({ where: { id: assistant.id } });
  check("accepting sets a new password hash", afterAccept.passwordHash === newPasswordHash);
  check("accepting clears mustChangePassword", afterAccept.mustChangePassword === false);
  const inviteGone = await prisma.assistantInvite.findUnique({ where: { userId: assistant.id } });
  check("accepting deletes the invite (one-time use)", inviteGone === null);

  // getAssistantInviteInfo should now refuse re-use of the (deleted) token —
  // simulated here as "no invite row found for it any more."
  const reuseAttempt = await prisma.assistantInvite.findUnique({ where: { token: secondToken } });
  check("the used token can't be looked up again", reuseAttempt === null);

  // Cascade delete via the schema's onDelete: Cascade on User -> AssistantInvite.
  const thirdToken = token();
  await prisma.assistantInvite.create({ data: { userId: assistant.id, token: thirdToken, expiresAt } });
  await prisma.user.delete({ where: { id: assistant.id } });
  const orphanInvite = await prisma.assistantInvite.findUnique({ where: { token: thirdToken } });
  check("deleting a User cascades away its AssistantInvite (schema onDelete: Cascade)", orphanInvite === null);

  console.log(`\n${failures === 0 ? "✅ All assistant-invite checks passed." : `❌ ${failures} check(s) FAILED.`}`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
