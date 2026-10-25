// Scripted test for per-coach workspace isolation (signup + multi-tenant
// access control). Run:
//   node --env-file=.env --import tsx scripts/multi-tenant-isolation-test.mts
//
// src/lib/access.ts imports "server-only" (tsx/plain Node can't resolve that
// bundler-time guard), so its logic is re-implemented here inline against
// the same Prisma shapes rather than imported directly.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
let failures = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ok - ${label}`);
  } else {
    failures++;
    console.log(`  FAIL - ${label}${detail ? ` (${detail})` : ""}`);
  }
}

// Mirrors access.ts::accessibleTeamIds/accessibleAthleteIds/canAccessTeam/
// canAccessAthlete's OWNER + ASSISTANT-allClientsAccess branches exactly.
function workspaceOwnerId(user: { id: string; role: string; ownerId: string | null }): string {
  return user.role === "OWNER" ? user.id : (user.ownerId ?? user.id);
}

async function accessibleTeamIds(user: { id: string; role: string; ownerId: string | null; allClientsAccess: boolean }): Promise<string[]> {
  if (user.role === "OWNER") {
    const rows = await prisma.team.findMany({
      where: { OR: [{ coachId: user.id }, { assistantCoaches: { some: { assistantCoachUserId: user.id } } }] },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
  if (user.allClientsAccess) {
    const rows = await prisma.team.findMany({ where: { coachId: workspaceOwnerId(user) }, select: { id: true } });
    return rows.map((r) => r.id);
  }
  const rows = await prisma.teamAssistantCoach.findMany({ where: { assistantCoachUserId: user.id }, select: { teamId: true } });
  return rows.map((r) => r.teamId);
}

async function accessibleAthleteIds(user: { id: string; role: string; ownerId: string | null; allClientsAccess: boolean }): Promise<string[]> {
  const teamIds = await accessibleTeamIds(user);
  const ids = new Set<string>();
  if (teamIds.length) {
    const rows = await prisma.rosterSpot.findMany({ where: { teamId: { in: teamIds }, status: "ACTIVE" }, select: { athleteId: true } });
    for (const r of rows) ids.add(r.athleteId);
  }
  if (user.role === "OWNER") {
    const own = await prisma.athlete.findMany({ where: { createdByUserId: user.id }, select: { id: true } });
    for (const r of own) ids.add(r.id);
  }
  return [...ids];
}

async function canAccessTeam(user: { id: string; role: string; ownerId: string | null; allClientsAccess: boolean }, teamId: string): Promise<boolean> {
  return (await accessibleTeamIds(user)).includes(teamId);
}
async function canAccessAthlete(user: { id: string; role: string; ownerId: string | null; allClientsAccess: boolean }, athleteId: string): Promise<boolean> {
  return (await accessibleAthleteIds(user)).includes(athleteId);
}

async function main() {
  // Two fully independent OWNER "head coaches" (simulating two separate
  // /signup accounts), each with their own team + athlete, plus an
  // all-access ASSISTANT under Coach A.
  const coachA = await prisma.user.create({ data: { name: "[test] Coach A", email: "mt-coach-a@example.com", passwordHash: "x", role: "OWNER" } });
  const coachB = await prisma.user.create({ data: { name: "[test] Coach B", email: "mt-coach-b@example.com", passwordHash: "x", role: "OWNER" } });
  const assistantA = await prisma.user.create({
    data: { name: "[test] Assistant A", email: "mt-assistant-a@example.com", passwordHash: "x", role: "ASSISTANT", ownerId: coachA.id, allClientsAccess: true },
  });

  const teamA = await prisma.team.create({ data: { name: "[test fixture] Team A", coachId: coachA.id } });
  const teamB = await prisma.team.create({ data: { name: "[test fixture] Team B", coachId: coachB.id } });
  const athleteA = await prisma.athlete.create({ data: { displayName: "[test fixture] Athlete A", status: "ACTIVE", createdByUserId: coachA.id } });
  const athleteB = await prisma.athlete.create({ data: { displayName: "[test fixture] Athlete B", status: "ACTIVE", createdByUserId: coachB.id } });
  await prisma.rosterSpot.create({ data: { athleteId: athleteA.id, teamId: teamA.id, status: "ACTIVE" } });
  await prisma.rosterSpot.create({ data: { athleteId: athleteB.id, teamId: teamB.id, status: "ACTIVE" } });

  try {
    const uA = { id: coachA.id, role: "OWNER", ownerId: null, allClientsAccess: false };
    const uB = { id: coachB.id, role: "OWNER", ownerId: null, allClientsAccess: false };
    const uAssistantA = { id: assistantA.id, role: "ASSISTANT", ownerId: coachA.id, allClientsAccess: true };

    console.log("=== Team isolation ===");
    check("Coach A can access their own team", await canAccessTeam(uA, teamA.id));
    check("Coach A can NOT access Coach B's team", !(await canAccessTeam(uA, teamB.id)));
    check("Coach B can access their own team", await canAccessTeam(uB, teamB.id));
    check("Coach B can NOT access Coach A's team", !(await canAccessTeam(uB, teamA.id)));
    const teamIdsA = await accessibleTeamIds(uA);
    check("Coach A's accessibleTeamIds contains exactly their own team (not a platform-wide list)", teamIdsA.includes(teamA.id) && !teamIdsA.includes(teamB.id));

    console.log("=== Athlete isolation ===");
    check("Coach A can access their own athlete", await canAccessAthlete(uA, athleteA.id));
    check("Coach A can NOT access Coach B's athlete", !(await canAccessAthlete(uA, athleteB.id)));
    check("Coach B can NOT access Coach A's athlete", !(await canAccessAthlete(uB, athleteA.id)));

    console.log("=== ASSISTANT allClientsAccess is workspace-scoped, not platform-wide ===");
    check("Coach A's all-access assistant CAN access Coach A's team", await canAccessTeam(uAssistantA, teamA.id));
    check("Coach A's all-access assistant CANNOT access Coach B's team", !(await canAccessTeam(uAssistantA, teamB.id)));
    check("Coach A's all-access assistant CAN access Coach A's athlete", await canAccessAthlete(uAssistantA, athleteA.id));
    check("Coach A's all-access assistant CANNOT access Coach B's athlete", !(await canAccessAthlete(uAssistantA, athleteB.id)));

    console.log("=== Explicit cross-workspace assistant-coach grant still works ===");
    await prisma.teamAssistantCoach.create({ data: { teamId: teamB.id, assistantCoachUserId: coachA.id } });
    check("Coach A CAN now access Coach B's team after an explicit TeamAssistantCoach grant", await canAccessTeam(uA, teamB.id));
    // Athlete B is rostered on Team B, which Coach A now has an assistant-coach grant on.
    check("Coach A CAN now access Athlete B (rostered on the shared team)", await canAccessAthlete(uA, athleteB.id));
    check("Coach B is UNAFFECTED — still can't see Coach A's own team/athlete", !(await canAccessTeam(uB, teamA.id)) && !(await canAccessAthlete(uB, athleteA.id)));
  } finally {
    await prisma.teamAssistantCoach.deleteMany({ where: { OR: [{ teamId: teamA.id }, { teamId: teamB.id }] } });
    await prisma.rosterSpot.deleteMany({ where: { OR: [{ athleteId: athleteA.id }, { athleteId: athleteB.id }] } });
    await prisma.athlete.deleteMany({ where: { OR: [{ id: athleteA.id }, { id: athleteB.id }] } });
    await prisma.team.deleteMany({ where: { OR: [{ id: teamA.id }, { id: teamB.id }] } });
    await prisma.user.deleteMany({ where: { OR: [{ id: coachA.id }, { id: coachB.id }, { id: assistantA.id }] } });
  }

  await prisma.$disconnect();
  if (failures > 0) {
    console.log(`\n${failures} check(s) FAILED.`);
    process.exit(1);
  }
  console.log("\n✅ All multi-tenant isolation checks passed.");
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
