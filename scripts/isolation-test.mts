// Scripted isolation test for the athlete-scoping access spine.
// Run: node --env-file=.env --import tsx scripts/isolation-test.mts
//
// Verifies, against the seeded demo data, that:
//   - an assistant coach only sees athletes rostered on teams they're
//     assigned to (the 2-hop TeamAssistantCoach -> RosterSpot lookup)
//   - an assistant coach assigned to Team 1 CANNOT access an athlete who is
//     only rostered on Team 2 (the IDOR surface)
//   - an athlete sees only their own athleteId
//   - the head coach sees everything
//   - accessibleAthleteIds / canAccessAthlete agree, same for teams
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Re-implement the access rules here (the lib is "server-only" and can't be
// imported into a plain script). This mirrors src/lib/access.ts exactly.
type U = { id: string; role: string; athleteId?: string | null; allClientsAccess?: boolean };

async function accessibleAthleteIds(u: U): Promise<"ALL" | string[]> {
  if (u.role === "OWNER") return "ALL";
  if (u.role === "CLIENT") return u.athleteId ? [u.athleteId] : [];
  if (u.allClientsAccess) return "ALL";
  const teamRows = await prisma.teamAssistantCoach.findMany({ where: { assistantCoachUserId: u.id }, select: { teamId: true } });
  const teamIds = teamRows.map((r) => r.teamId);
  if (teamIds.length === 0) return [];
  const rosterRows = await prisma.rosterSpot.findMany({
    where: { teamId: { in: teamIds }, status: "ACTIVE" },
    select: { athleteId: true },
  });
  return [...new Set(rosterRows.map((r) => r.athleteId))];
}
async function canAccessAthlete(u: U, athleteId: string): Promise<boolean> {
  const ids = await accessibleAthleteIds(u);
  return ids === "ALL" || ids.includes(athleteId);
}
async function accessibleTeamIds(u: U): Promise<"ALL" | string[]> {
  if (u.role === "OWNER") return "ALL";
  if (u.role === "CLIENT") {
    if (!u.athleteId) return [];
    const rows = await prisma.rosterSpot.findMany({ where: { athleteId: u.athleteId, status: "ACTIVE" }, select: { teamId: true } });
    return rows.map((r) => r.teamId);
  }
  if (u.allClientsAccess) return "ALL";
  const rows = await prisma.teamAssistantCoach.findMany({ where: { assistantCoachUserId: u.id }, select: { teamId: true } });
  return rows.map((r) => r.teamId);
}
async function canAccessTeam(u: U, teamId: string): Promise<boolean> {
  const ids = await accessibleTeamIds(u);
  return ids === "ALL" || ids.includes(teamId);
}

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${name}`);
  if (!cond) failures++;
}

async function main() {
  const coach = await prisma.user.findUniqueOrThrow({ where: { email: "coach@matchday.test" } });
  const assistant1 = await prisma.user.findUniqueOrThrow({ where: { email: "assistant1@matchday.test" } }); // Varsity
  const assistant2 = await prisma.user.findUniqueOrThrow({ where: { email: "assistant2@matchday.test" } }); // JV

  const varsity = await prisma.team.findFirstOrThrow({ where: { name: "Varsity Boys" } });
  const jv = await prisma.team.findFirstOrThrow({ where: { name: "JV Boys" } });

  const athletes = await prisma.athlete.findMany({ include: { linkedUser: true } });
  const byName = (n: string) => athletes.find((a) => a.displayName.startsWith(n))!;
  const ava = byName("Ava"), liam = byName("Liam"), noor = byName("Noor"), caleb = byName("Caleb"), tyler = byName("Tyler");

  const coachU: U = { id: coach.id, role: "OWNER" };
  const a1U: U = { id: assistant1.id, role: "ASSISTANT", allClientsAccess: assistant1.allClientsAccess };
  const a2U: U = { id: assistant2.id, role: "ASSISTANT", allClientsAccess: assistant2.allClientsAccess };

  console.log("Head coach (owner):");
  check("coach sees ALL athletes", (await accessibleAthleteIds(coachU)) === "ALL");
  check("coach sees ALL teams", (await accessibleTeamIds(coachU)) === "ALL");
  check("coach can access Tyler", await canAccessAthlete(coachU, tyler.id));

  console.log("Assistant coach 1 (assigned: Varsity only):");
  const a1Ids = (await accessibleAthleteIds(a1U)) as string[];
  check("assistant 1 sees exactly 11 athletes (the Varsity roster)", a1Ids.length === 11);
  check("assistant 1 CAN access Ava (rostered on Varsity)", await canAccessAthlete(a1U, ava.id));
  check("assistant 1 CAN access Noor (rostered on Varsity + JV)", await canAccessAthlete(a1U, noor.id));
  check("assistant 1 CANNOT access Caleb (JV only — the 2-hop IDOR surface)", !(await canAccessAthlete(a1U, caleb.id)));
  check("assistant 1 CANNOT access Tyler (JV only)", !(await canAccessAthlete(a1U, tyler.id)));
  check("assistant 1 CAN access Varsity", await canAccessTeam(a1U, varsity.id));
  check("assistant 1 CANNOT access JV", !(await canAccessTeam(a1U, jv.id)));

  console.log("Assistant coach 2 (assigned: JV only):");
  check("assistant 2 CAN access Tyler", await canAccessAthlete(a2U, tyler.id));
  check("assistant 2 CAN access Noor (overlap athlete)", await canAccessAthlete(a2U, noor.id));
  check("assistant 2 CANNOT access Ava (Varsity only)", !(await canAccessAthlete(a2U, ava.id)));
  check("assistant 2 CANNOT access Liam (Varsity only)", !(await canAccessAthlete(a2U, liam.id)));

  console.log("Athlete portal users:");
  const avaLogin = ava.linkedUser!;
  const avaU: U = { id: avaLogin.id, role: "CLIENT", athleteId: ava.id };
  check("Ava's login sees ONLY Ava", JSON.stringify(await accessibleAthleteIds(avaU)) === JSON.stringify([ava.id]));
  check("Ava's login CANNOT access Liam", !(await canAccessAthlete(avaU, liam.id)));
  check("Ava's login CAN access Varsity (her own roster spot)", await canAccessTeam(avaU, varsity.id));
  check("Ava's login CANNOT access JV (not rostered)", !(await canAccessTeam(avaU, jv.id)));

  console.log(`\n${failures === 0 ? "✅ All isolation checks passed." : `❌ ${failures} check(s) FAILED.`}`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
