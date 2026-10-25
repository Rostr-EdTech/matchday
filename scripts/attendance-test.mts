// Scripted test for practice attendance (Practice/PracticeAttendance) — the
// quick present/late/absent roll-call list. Run:
// node --env-file=.env --import tsx scripts/attendance-test.mts
//
// src/actions/attendance.ts imports "server-only" (and calls requireStaff(),
// which needs a real request's cookies), so its query/mutation shapes are
// re-implemented inline against a self-contained fixture, same approach as
// scripts/feedback-test.mts.
import { PrismaClient } from "@prisma/client";
import { ATTENDANCE_STATUSES, nextAttendanceStatus, values } from "../src/lib/enums";

const prisma = new PrismaClient();

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${name}`);
  if (!cond) failures++;
}

async function main() {
  console.log("Enum sanity:");
  check("ATTENDANCE_STATUSES is exactly PRESENT/LATE/ABSENT, in that order", JSON.stringify(values(ATTENDANCE_STATUSES)) === JSON.stringify(["PRESENT", "LATE", "ABSENT"]));
  check("cycle wraps PRESENT -> LATE -> ABSENT -> PRESENT", nextAttendanceStatus("PRESENT") === "LATE" && nextAttendanceStatus("LATE") === "ABSENT" && nextAttendanceStatus("ABSENT") === "PRESENT");
  check("cycle recovers from an unrecognized status by starting over at PRESENT", nextAttendanceStatus("") === "PRESENT");

  console.log("\nReal-DB fixture — a practice for the seeded Varsity roster:");
  const coach = await prisma.user.findFirstOrThrow({ where: { email: "coach@matchday.test" } });
  const team = await prisma.team.findFirstOrThrow({ where: { name: "Varsity Boys", coachId: coach.id } });
  await prisma.practice.deleteMany({ where: { teamId: team.id, notes: "[test fixture]" } });

  const activeRoster = await prisma.rosterSpot.findMany({ where: { teamId: team.id, status: "ACTIVE" } });
  check("the seeded Varsity roster is non-empty", activeRoster.length > 0);

  // createPractice's logic: one Practice + one PRESENT row per active roster athlete.
  const practice = await prisma.practice.create({
    data: {
      teamId: team.id,
      notes: "[test fixture]",
      createdById: coach.id,
      attendance: { create: activeRoster.map((r) => ({ athleteId: r.athleteId, status: "PRESENT" })) },
    },
    include: { attendance: true },
  });
  check("attendance is seeded 1:1 with the active roster", practice.attendance.length === activeRoster.length);
  check("every seeded row defaults to PRESENT", practice.attendance.every((a) => a.status === "PRESENT"));

  // setAttendanceStatus's logic: upsert on the (practiceId, athleteId) unique key.
  const someone = activeRoster[0].athleteId;
  await prisma.practiceAttendance.upsert({
    where: { practiceId_athleteId: { practiceId: practice.id, athleteId: someone } },
    update: { status: "ABSENT" },
    create: { practiceId: practice.id, athleteId: someone, status: "ABSENT" },
  });
  const marked = await prisma.practiceAttendance.findUniqueOrThrow({ where: { practiceId_athleteId: { practiceId: practice.id, athleteId: someone } } });
  check("marking one athlete absent only changes that row", marked.status === "ABSENT");
  const stillPresentCount = await prisma.practiceAttendance.count({ where: { practiceId: practice.id, status: "PRESENT" } });
  check("everyone else stays PRESENT", stillPresentCount === activeRoster.length - 1);

  // getPracticeDetail's reconciliation logic: an athlete added to the roster
  // AFTER the practice was created should get a PRESENT row on next read, not
  // be silently missing from the list.
  const lateAddAthlete = await prisma.athlete.create({
    data: { id: "test-attendance-late-add", displayName: "[test fixture] Late Add", createdByUserId: coach.id },
  });
  await prisma.rosterSpot.create({ data: { athleteId: lateAddAthlete.id, teamId: team.id, status: "ACTIVE" } });
  const rosterNow = await prisma.rosterSpot.findMany({ where: { teamId: team.id, status: "ACTIVE" } });
  const existingAttendance = await prisma.practiceAttendance.findMany({ where: { practiceId: practice.id } });
  const existingIds = new Set(existingAttendance.map((a) => a.athleteId));
  const missing = rosterNow.filter((r) => !existingIds.has(r.athleteId));
  check("the newly-rostered athlete is detected as missing from this practice's attendance", missing.length === 1 && missing[0].athleteId === lateAddAthlete.id);
  await prisma.practiceAttendance.createMany({ data: missing.map((r) => ({ practiceId: practice.id, athleteId: r.athleteId, status: "PRESENT" })) });
  const reconciled = await prisma.practiceAttendance.count({ where: { practiceId: practice.id } });
  check("reconciliation brings attendance back to 1:1 with the current roster", reconciled === rosterNow.length);

  // Cascade delete via the schema's onDelete: Cascade on Practice -> PracticeAttendance.
  await prisma.practice.delete({ where: { id: practice.id } });
  const orphanAttendance = await prisma.practiceAttendance.findMany({ where: { practiceId: practice.id } });
  check("deleting a Practice cascades away its attendance rows (schema onDelete: Cascade)", orphanAttendance.length === 0);

  // Cleanup the fixture athlete/roster-spot.
  await prisma.athlete.delete({ where: { id: lateAddAthlete.id } });

  console.log(`\n${failures === 0 ? "✅ All attendance checks passed." : `❌ ${failures} check(s) FAILED.`}`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
