// Scripted test for the Feedback model — a general coach note to an athlete,
// COACH_ONLY or ATHLETE_VISIBLE. Run:
// node --env-file=.env --import tsx scripts/feedback-test.mts
//
// src/lib/feedback.ts and src/actions/feedback.ts both import "server-only",
// so their query/action shapes are re-implemented inline against a
// self-contained fixture.
import { PrismaClient } from "@prisma/client";
import { FEEDBACK_VISIBILITY, BADGE_COLORS, values } from "../src/lib/enums";

const prisma = new PrismaClient();

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${name}`);
  if (!cond) failures++;
}

// Re-implements feedbackForAthlete's filtering logic against real rows.
async function visibleFeedback(athleteId: string, includeCoachOnly: boolean) {
  return prisma.feedback.findMany({
    where: { athleteId, deletedAt: null, ...(includeCoachOnly ? {} : { visibility: "ATHLETE_VISIBLE" }) },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

async function main() {
  console.log("Enum sanity:");
  check("FEEDBACK_VISIBILITY is exactly the 2-tier COACH_ONLY/ATHLETE_VISIBLE set", JSON.stringify(values(FEEDBACK_VISIBILITY)) === JSON.stringify(["COACH_ONLY", "ATHLETE_VISIBLE"]));
  check("both visibility values have a badge color", !!BADGE_COLORS.COACH_ONLY && !!BADGE_COLORS.ATHLETE_VISIBLE);

  console.log("\nReal-DB fixture — general Feedback on an Athlete:");
  const coach = await prisma.user.findFirstOrThrow({ where: { email: "coach@matchday.test" } });
  const athlete = await prisma.athlete.upsert({
    where: { id: "test-feedback-athlete" }, update: {},
    create: { id: "test-feedback-athlete", displayName: "[test fixture] Athlete", createdByUserId: coach.id },
  });
  await prisma.feedback.deleteMany({ where: { athleteId: athlete.id } });

  await prisma.feedback.create({ data: { athleteId: athlete.id, userId: coach.id, message: "Internal note re: today's session.", visibility: "COACH_ONLY" } });
  await prisma.feedback.create({ data: { athleteId: athlete.id, userId: coach.id, message: "Great work at practice today!", visibility: "ATHLETE_VISIBLE" } });

  const staffView = await visibleFeedback(athlete.id, true);
  const athleteView = await visibleFeedback(athlete.id, false);
  check("staff view sees both pieces of feedback", staffView.length === 2);
  check("athlete view sees only the ATHLETE_VISIBLE one", athleteView.length === 1 && athleteView[0].visibility === "ATHLETE_VISIBLE");
  check("athlete-visible feedback carries the author's name", athleteView[0].user.name === coach.name);

  // Edit.
  await prisma.feedback.update({ where: { id: athleteView[0].id }, data: { message: "Great work — keep it up!", editedAt: new Date() } });
  const afterEdit = await prisma.feedback.findUniqueOrThrow({ where: { id: athleteView[0].id } });
  check("editing feedback updates the message and sets editedAt", afterEdit.message === "Great work — keep it up!" && !!afterEdit.editedAt);

  // Soft delete.
  const toDelete = staffView[0];
  await prisma.feedback.update({ where: { id: toDelete.id }, data: { deletedAt: new Date(), deletedById: coach.id } });
  const afterDelete = await visibleFeedback(athlete.id, true);
  check("a soft-deleted feedback row is excluded from visible queries", afterDelete.length === 1);
  const stillInDb = await prisma.feedback.findUnique({ where: { id: toDelete.id } });
  check("a soft-deleted feedback row is NOT actually removed from the database (audit trail kept)", !!stillInDb && !!stillInDb.deletedAt);

  // Cascade delete via the schema's onDelete: Cascade on Athlete -> Feedback.
  await prisma.athlete.delete({ where: { id: athlete.id } });
  const orphanFeedback = await prisma.feedback.findMany({ where: { athleteId: athlete.id } });
  check("deleting an Athlete cascades away its Feedback (schema onDelete: Cascade)", orphanFeedback.length === 0);

  console.log(`\n${failures === 0 ? "✅ All feedback checks passed." : `❌ ${failures} check(s) FAILED.`}`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
