// Scripted test for an athlete's portal-login lifecycle: revoke, reinstate
// (same login comes back), and reset (old login detached for good, a fresh
// invite issued instead). Run:
// node --env-file=.env --import tsx scripts/athlete-login-test.mts
//
// src/actions/athletes.ts imports "server-only" (and calls requireOwner(),
// which needs a real request's cookies), so each action's core logic is
// re-implemented inline against a self-contained fixture, same approach as
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
  console.log("Real-DB fixture — an athlete's portal login lifecycle:");
  const coach = await prisma.user.findFirstOrThrow({ where: { email: "coach@matchday.test" } });

  await prisma.user.deleteMany({ where: { email: "test-athlete-login@matchday.test" } });
  await prisma.athlete.deleteMany({ where: { email: "test-athlete-login@matchday.test" } });

  const login = await prisma.user.create({
    data: {
      name: "[test fixture] Login", email: "test-athlete-login@matchday.test",
      passwordHash: await bcrypt.hash("Original-Pass-1!", 10), role: "CLIENT",
    },
  });
  const athlete = await prisma.athlete.create({
    data: { displayName: "[test fixture] Athlete", createdByUserId: coach.id, linkedUserId: login.id },
  });
  check("the athlete starts linked to an active login", (await prisma.user.findUniqueOrThrow({ where: { id: login.id } })).active === true);

  // revokeAthleteLogin's logic.
  await prisma.user.update({ where: { id: login.id }, data: { active: false, sessionVersion: { increment: 1 } } });
  const afterRevoke = await prisma.user.findUniqueOrThrow({ where: { id: login.id } });
  check("revoking deactivates the login", afterRevoke.active === false);
  check("revoking bumps sessionVersion (forces logout)", afterRevoke.sessionVersion === 1);
  const afterRevokeAthlete = await prisma.athlete.findUniqueOrThrow({ where: { id: athlete.id } });
  check("revoking leaves the athlete still linked to the same account", afterRevokeAthlete.linkedUserId === login.id);

  // reinstateAthleteLogin's logic: same account, active again.
  await prisma.user.update({ where: { id: login.id }, data: { active: true } });
  const afterReinstate = await prisma.user.findUniqueOrThrow({ where: { id: login.id } });
  check("reinstating re-activates the SAME login", afterReinstate.active === true && afterReinstate.id === login.id);
  check("the original password hash is untouched by reinstating", afterReinstate.passwordHash === login.passwordHash);

  // resetAthleteLogin's logic: revoke again first (simulating the coach
  // choosing "send new invite" from the revoked state), then detach +
  // invite, all as one transaction.
  await prisma.user.update({ where: { id: login.id }, data: { active: false } });
  const inviteToken = token();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.$transaction([
    prisma.user.update({ where: { id: login.id }, data: { active: false, sessionVersion: { increment: 1 } } }),
    prisma.athlete.update({ where: { id: athlete.id }, data: { linkedUserId: null } }),
    prisma.athleteInvite.upsert({
      where: { athleteId: athlete.id },
      create: { athleteId: athlete.id, token: inviteToken, expiresAt },
      update: { token: inviteToken, expiresAt },
    }),
  ]);
  const afterReset = await prisma.athlete.findUniqueOrThrow({ where: { id: athlete.id } });
  check("resetting detaches the athlete from the old login", afterReset.linkedUserId === null);
  const oldLoginAfterReset = await prisma.user.findUniqueOrThrow({ where: { id: login.id } });
  check("the old login is left deactivated, not deleted (kept for history)", oldLoginAfterReset.active === false);
  const newInvite = await prisma.athleteInvite.findUniqueOrThrow({ where: { athleteId: athlete.id } });
  check("a fresh invite is ready immediately after resetting", newInvite.token === inviteToken);

  // Cleanup.
  await prisma.athlete.delete({ where: { id: athlete.id } }); // cascades AthleteInvite
  await prisma.user.delete({ where: { id: login.id } });

  console.log(`\n${failures === 0 ? "✅ All athlete-login checks passed." : `❌ ${failures} check(s) FAILED.`}`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
