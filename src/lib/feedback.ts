import "server-only";
import { prisma } from "./prisma";

export type FeedbackRow = {
  id: string;
  message: string;
  visibility: string;
  authorName: string;
  createdAt: Date;
  editedAt: Date | null;
};

type RawFeedback = { id: string; message: string; visibility: string; user: { name: string }; createdAt: Date; editedAt: Date | null };
function toRow(f: RawFeedback): FeedbackRow {
  return { id: f.id, message: f.message, visibility: f.visibility, authorName: f.user.name, createdAt: f.createdAt, editedAt: f.editedAt };
}

// No auth inside this module. `includeCoachOnly` is the caller's job to
// decide: true for a staff view (sees everything), false for an athlete's
// own portal view (ATHLETE_VISIBLE only). Soft-deleted rows are always
// excluded.

// Every piece of feedback for one athlete — the athlete detail page's
// history and the portal dashboard's "recent feedback" feed.
export async function feedbackForAthlete(athleteId: string, includeCoachOnly: boolean, take?: number): Promise<FeedbackRow[]> {
  const rows = await prisma.feedback.findMany({
    where: { athleteId, deletedAt: null, ...(includeCoachOnly ? {} : { visibility: "ATHLETE_VISIBLE" }) },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.map(toRow);
}
