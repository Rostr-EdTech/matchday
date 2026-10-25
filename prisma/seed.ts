import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { FORMATION_PRESETS } from "../src/lib/formations";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding matchday demo data...");

  const pw = (s: string) => bcrypt.hash(s, 10);

  // --- People ------------------------------------------------------------------
  const coach = await prisma.user.upsert({
    where: { email: "coach@matchday.test" },
    update: { role: "OWNER" },
    create: { name: "Coach Rivera", email: "coach@matchday.test", passwordHash: await pw("ChangeMe123!"), role: "OWNER" },
  });

  const assistant1 = await prisma.user.upsert({
    where: { email: "assistant1@matchday.test" },
    update: { role: "ASSISTANT", ownerId: coach.id },
    create: { name: "Coach Chen", email: "assistant1@matchday.test", passwordHash: await pw("ChangeMe123!"), role: "ASSISTANT", ownerId: coach.id },
  });
  const assistant2 = await prisma.user.upsert({
    where: { email: "assistant2@matchday.test" },
    update: { role: "ASSISTANT", ownerId: coach.id },
    create: { name: "Coach Patel", email: "assistant2@matchday.test", passwordHash: await pw("ChangeMe123!"), role: "ASSISTANT", ownerId: coach.id },
  });
  console.log("  - Head coach + 2 assistant coaches");

  // --- Teams ---------------------------------------------------------------
  const teamDefs = [
    { name: "Varsity Boys", ageGroup: "Varsity", season: "2026 Fall", assistant: assistant1 },
    { name: "JV Boys", ageGroup: "JV", season: "2026 Fall", assistant: assistant2 },
  ];
  const teams: Record<string, Awaited<ReturnType<typeof prisma.team.create>>> = {};
  for (const def of teamDefs) {
    let team = await prisma.team.findFirst({ where: { name: def.name, coachId: coach.id } });
    if (!team) {
      team = await prisma.team.create({
        data: { name: def.name, ageGroup: def.ageGroup, season: def.season, coachId: coach.id },
      });
    }
    await prisma.teamAssistantCoach.upsert({
      where: { teamId_assistantCoachUserId: { teamId: team.id, assistantCoachUserId: def.assistant.id } },
      update: {},
      create: { teamId: team.id, assistantCoachUserId: def.assistant.id },
    });
    teams[def.name] = team;
  }
  console.log(`  - ${teamDefs.length} teams, each with an assistant coach assigned`);

  // --- Formation presets (global reference data) ----------------------------
  for (const preset of FORMATION_PRESETS) {
    await prisma.formation.upsert({
      where: { name: preset.name },
      update: { slotsJson: JSON.stringify(preset.slots) },
      create: { name: preset.name, sport: "SOCCER", slotsJson: JSON.stringify(preset.slots) },
    });
  }
  console.log(`  - ${FORMATION_PRESETS.length} formation presets`);

  // --- Athletes, rostered onto one or both teams ------------------------------
  // Reyes is rostered on BOTH teams so the 2-hop assistant-coach access model
  // has a real overlap case to exercise (see scripts/isolation-test.mts).
  const athleteDefs: {
    displayName: string; jerseyNumber: number; primaryPosition: string; dominantFoot: string;
    injuryStatus?: "QUESTIONABLE" | "OUT"; injuryNote?: string;
    login?: { email: string }; teams: string[];
  }[] = [
    { displayName: "Ava Thompson", jerseyNumber: 1, primaryPosition: "GK", dominantFoot: "RIGHT", login: { email: "ava@athlete.test" }, teams: ["Varsity Boys"] },
    { displayName: "Liam Garcia", jerseyNumber: 2, primaryPosition: "RB", dominantFoot: "RIGHT", login: { email: "liam@athlete.test" }, teams: ["Varsity Boys"] },
    { displayName: "Noor Reyes", jerseyNumber: 3, primaryPosition: "CB", dominantFoot: "LEFT", login: { email: "noor@athlete.test" }, teams: ["Varsity Boys", "JV Boys"] },
    { displayName: "Ethan Brooks", jerseyNumber: 4, primaryPosition: "CB", dominantFoot: "RIGHT", teams: ["Varsity Boys"] },
    { displayName: "Maya Chen", jerseyNumber: 5, primaryPosition: "LB", dominantFoot: "LEFT", teams: ["Varsity Boys"] },
    { displayName: "Jordan Lee", jerseyNumber: 6, primaryPosition: "CDM", dominantFoot: "RIGHT", teams: ["Varsity Boys"] },
    { displayName: "Diego Fernandez", jerseyNumber: 7, primaryPosition: "RM", dominantFoot: "RIGHT", injuryStatus: "QUESTIONABLE", injuryNote: "Sore hamstring — monitoring", teams: ["Varsity Boys"] },
    { displayName: "Owen Walsh", jerseyNumber: 8, primaryPosition: "CM", dominantFoot: "RIGHT", teams: ["Varsity Boys"] },
    { displayName: "Marcus Bell", jerseyNumber: 9, primaryPosition: "ST", dominantFoot: "RIGHT", teams: ["Varsity Boys"] },
    { displayName: "Priya Nair", jerseyNumber: 10, primaryPosition: "CAM", dominantFoot: "LEFT", teams: ["Varsity Boys"] },
    { displayName: "Sofia Rossi", jerseyNumber: 11, primaryPosition: "LM", dominantFoot: "LEFT", injuryStatus: "OUT", injuryNote: "ACL — out for the season", teams: ["Varsity Boys"] },
    { displayName: "Caleb Young", jerseyNumber: 12, primaryPosition: "GK", dominantFoot: "RIGHT", login: { email: "caleb@athlete.test" }, teams: ["JV Boys"] },
    { displayName: "Tyler Osei", jerseyNumber: 13, primaryPosition: "RB", dominantFoot: "RIGHT", teams: ["JV Boys"] },
    { displayName: "Hassan Ali", jerseyNumber: 14, primaryPosition: "CB", dominantFoot: "RIGHT", teams: ["JV Boys"] },
    { displayName: "Ben Turner", jerseyNumber: 15, primaryPosition: "LB", dominantFoot: "LEFT", teams: ["JV Boys"] },
    { displayName: "Wyatt Kim", jerseyNumber: 16, primaryPosition: "CM", dominantFoot: "RIGHT", teams: ["JV Boys"] },
    { displayName: "Leo Martins", jerseyNumber: 17, primaryPosition: "RW", dominantFoot: "LEFT", teams: ["JV Boys"] },
    { displayName: "Nico Alvarez", jerseyNumber: 18, primaryPosition: "ST", dominantFoot: "RIGHT", teams: ["JV Boys"] },
  ];

  for (const def of athleteDefs) {
    let linkedUserId: string | null = null;
    if (def.login) {
      const au = await prisma.user.upsert({
        where: { email: def.login.email },
        update: { role: "CLIENT" },
        create: { name: def.displayName, email: def.login.email, passwordHash: await pw("ChangeMe123!"), role: "CLIENT" },
      });
      linkedUserId = au.id;
    }

    let athlete = await prisma.athlete.findFirst({ where: { displayName: def.displayName } });
    if (!athlete) {
      athlete = await prisma.athlete.create({
        data: {
          displayName: def.displayName,
          jerseyNumber: def.jerseyNumber,
          primaryPosition: def.primaryPosition,
          dominantFoot: def.dominantFoot,
          status: "ACTIVE",
          injuryStatus: def.injuryStatus ?? "HEALTHY",
          injuryNote: def.injuryNote ?? null,
          injuryUpdatedAt: def.injuryStatus ? new Date() : null,
          linkedUserId,
          email: def.login?.email ?? null,
          createdByUserId: coach.id,
        },
      });
    }

    for (const teamName of def.teams) {
      const team = teams[teamName];
      await prisma.rosterSpot.upsert({
        where: { athleteId_teamId: { athleteId: athlete.id, teamId: team.id } },
        update: {},
        create: { athleteId: athlete.id, teamId: team.id },
      });
    }

    console.log(`  - Athlete "${def.displayName}" (#${def.jerseyNumber}, ${def.primaryPosition}) on ${def.teams.join(", ")}${linkedUserId ? " (portal login)" : ""}`);
  }

  // --- A couple of general recurring tasks ------------------------------------
  const taskCount = await prisma.task.count();
  if (taskCount === 0) {
    await prisma.task.create({ data: { title: "Order new training jerseys", recurring: false, assignedToId: assistant1.id, createdById: coach.id } });
    await prisma.task.create({ data: { title: "Confirm field bookings for next week", recurring: true, assignedToId: assistant2.id, createdById: coach.id } });
    console.log("  - Seeded a couple of tasks");
  }

  console.log("\nSeed complete. Logins (all password: ChangeMe123!):");
  console.log("   Head coach       -> coach@matchday.test");
  console.log("   Assistant coach  -> assistant1@matchday.test (Varsity) / assistant2@matchday.test (JV)");
  console.log("   Athlete          -> ava@athlete.test / liam@athlete.test / noor@athlete.test");
  console.log("   Change these before real use.\n");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
