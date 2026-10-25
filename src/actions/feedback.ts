"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { assertCanAccessAthlete } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";
import { feedbackSchema, feedbackEditSchema } from "@/lib/validations";
import type { ActionResult } from "./types";

// A general note to an athlete — coach-only or shared to their portal.
// class_copilot's Feedback could also attach to a specific MasteryEvent/
// DailyCheck; there's no coaching equivalent, so this app's Feedback is
// always general (see prisma/schema.prisma).
export async function addFeedback(
  athleteId: string,
  message: string,
  visibility: string,
): Promise<ActionResult> {
  const user = await requireStaff();
  try {
    await assertCanAccessAthlete(user, athleteId);
  } catch {
    return { ok: false, error: "You don't have access to that athlete." };
  }
  const parsed = feedbackSchema.safeParse({ message, visibility });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  await prisma.feedback.create({
    data: { athleteId, userId: user.id, message: parsed.data.message, visibility: parsed.data.visibility },
  });
  await logActivity({ userId: user.id, athleteId, actionType: "FEEDBACK_ADDED", description: `Added feedback (${parsed.data.visibility})` });

  revalidatePath(`/admin/athletes/${athleteId}`);
  return { ok: true };
}

export async function editFeedback(id: string, message: string): Promise<ActionResult> {
  const user = await requireStaff();
  const row = await prisma.feedback.findUnique({ where: { id }, select: { athleteId: true, deletedAt: true } });
  if (!row || row.deletedAt) return { ok: false, error: "Feedback not found." };
  try {
    await assertCanAccessAthlete(user, row.athleteId);
  } catch {
    return { ok: false, error: "You don't have access to that athlete." };
  }
  const parsed = feedbackEditSchema.safeParse({ message });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  await prisma.feedback.update({ where: { id }, data: { message: parsed.data.message, editedAt: new Date() } });
  revalidatePath(`/admin/athletes/${row.athleteId}`);
  return { ok: true };
}

// Soft-delete — kept (not removed) so staff retain visibility of what was
// said and by whom.
export async function deleteFeedback(id: string): Promise<ActionResult> {
  const user = await requireStaff();
  const row = await prisma.feedback.findUnique({ where: { id }, select: { athleteId: true } });
  if (!row) return { ok: false, error: "Feedback not found." };
  try {
    await assertCanAccessAthlete(user, row.athleteId);
  } catch {
    return { ok: false, error: "You don't have access to that athlete." };
  }
  await prisma.feedback.update({ where: { id }, data: { deletedAt: new Date(), deletedById: user.id } });
  revalidatePath(`/admin/athletes/${row.athleteId}`);
  return { ok: true };
}
