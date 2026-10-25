"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { assertCanAccessTeam } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";
import { values, ATTENDANCE_STATUSES } from "@/lib/enums";
import type { ActionResult } from "./types";

const STATUS_VALUES = values(ATTENDANCE_STATUSES);

export async function listPracticesForTeam(teamId: string) {
  const user = await requireStaff();
  await assertCanAccessTeam(user, teamId);
  const practices = await prisma.practice.findMany({
    where: { teamId },
    orderBy: { date: "desc" },
    include: { attendance: { select: { status: true } } },
  });
  return practices.map((p) => ({
    id: p.id,
    date: p.date,
    notes: p.notes,
    counts: {
      present: p.attendance.filter((a) => a.status === "PRESENT").length,
      late: p.attendance.filter((a) => a.status === "LATE").length,
      absent: p.attendance.filter((a) => a.status === "ABSENT").length,
    },
  }));
}

// Creates a Practice and seeds one PresentAttendance row per ACTIVE roster
// athlete (assume everyone showed up; the coach taps to mark exceptions).
export async function createPractice(teamId: string, dateStr?: string, notes?: string): Promise<ActionResult> {
  const user = await requireStaff();
  await assertCanAccessTeam(user, teamId);

  const date = dateStr ? new Date(dateStr) : new Date();
  if (Number.isNaN(date.getTime())) return { ok: false, error: "A valid date is required." };

  const roster = await prisma.rosterSpot.findMany({ where: { teamId, status: "ACTIVE" }, select: { athleteId: true } });

  const practice = await prisma.practice.create({
    data: {
      teamId,
      date,
      notes: notes?.trim() || null,
      createdById: user.id,
      attendance: { create: roster.map((r) => ({ athleteId: r.athleteId, status: "PRESENT" })) },
    },
  });
  await logActivity({ userId: user.id, actionType: "PRACTICE_CREATED", description: "Started taking attendance for a practice" });
  revalidatePath("/teams/attendance");
  redirect(`/teams/attendance/${practice.id}`);
}

// Fetches a practice's roster + attendance, reconciling in any athlete added
// to the team's active roster since the practice was created (defaulting
// them to PRESENT) so the list always reflects who's on the roster today —
// same reasoning as the tactical board's bench always showing everyone.
export async function getPracticeDetail(practiceId: string) {
  const user = await requireStaff();
  const practice = await prisma.practice.findUnique({ where: { id: practiceId } });
  if (!practice) return null;
  await assertCanAccessTeam(user, practice.teamId);

  const roster = await prisma.rosterSpot.findMany({
    where: { teamId: practice.teamId, status: "ACTIVE" },
    include: { athlete: { select: { id: true, displayName: true, jerseyNumber: true, primaryPosition: true, injuryStatus: true } } },
    orderBy: { athlete: { jerseyNumber: "asc" } },
  });

  const existing = await prisma.practiceAttendance.findMany({ where: { practiceId } });
  const existingIds = new Set(existing.map((a) => a.athleteId));
  const missing = roster.filter((r) => !existingIds.has(r.athleteId));
  if (missing.length > 0) {
    // SQLite's createMany has no skipDuplicates — safe without it anyway
    // since `missing` was just computed from the current existing rows.
    await prisma.practiceAttendance.createMany({
      data: missing.map((r) => ({ practiceId, athleteId: r.athleteId, status: "PRESENT" })),
    });
  }

  const statusByAthleteId = new Map(existing.map((a) => [a.athleteId, a.status]));

  return {
    id: practice.id,
    teamId: practice.teamId,
    date: practice.date,
    notes: practice.notes,
    rows: roster.map((r) => ({ athlete: r.athlete, status: statusByAthleteId.get(r.athleteId) ?? "PRESENT" })),
  };
}

export async function setAttendanceStatus(practiceId: string, athleteId: string, status: string): Promise<ActionResult> {
  const user = await requireStaff();
  if (!STATUS_VALUES.includes(status)) return { ok: false, error: "Invalid status." };
  const practice = await prisma.practice.findUnique({ where: { id: practiceId }, select: { teamId: true } });
  if (!practice) return { ok: false, error: "Practice not found." };
  await assertCanAccessTeam(user, practice.teamId);

  const onRoster = await prisma.rosterSpot.findUnique({ where: { athleteId_teamId: { athleteId, teamId: practice.teamId } } });
  if (!onRoster || onRoster.status !== "ACTIVE") return { ok: false, error: "That athlete isn't on this team's active roster." };

  await prisma.practiceAttendance.upsert({
    where: { practiceId_athleteId: { practiceId, athleteId } },
    update: { status },
    create: { practiceId, athleteId, status },
  });
  revalidatePath(`/teams/attendance/${practiceId}`);
  revalidatePath("/teams/attendance");
  return { ok: true };
}

export async function markAllPresent(practiceId: string): Promise<ActionResult> {
  const user = await requireStaff();
  const practice = await prisma.practice.findUnique({ where: { id: practiceId }, select: { teamId: true } });
  if (!practice) return { ok: false, error: "Practice not found." };
  await assertCanAccessTeam(user, practice.teamId);
  await prisma.practiceAttendance.updateMany({ where: { practiceId }, data: { status: "PRESENT" } });
  revalidatePath(`/teams/attendance/${practiceId}`);
  revalidatePath("/teams/attendance");
  return { ok: true };
}

export async function updatePracticeNotes(practiceId: string, notes: string): Promise<ActionResult> {
  const user = await requireStaff();
  const practice = await prisma.practice.findUnique({ where: { id: practiceId }, select: { teamId: true } });
  if (!practice) return { ok: false, error: "Practice not found." };
  await assertCanAccessTeam(user, practice.teamId);
  await prisma.practice.update({ where: { id: practiceId }, data: { notes: notes.trim() || null } });
  revalidatePath(`/teams/attendance/${practiceId}`);
  return { ok: true };
}

export async function deletePractice(practiceId: string): Promise<ActionResult> {
  const user = await requireStaff();
  const practice = await prisma.practice.findUnique({ where: { id: practiceId }, select: { teamId: true } });
  if (!practice) return { ok: false, error: "Practice not found." };
  await assertCanAccessTeam(user, practice.teamId);
  await prisma.practice.delete({ where: { id: practiceId } });
  revalidatePath("/teams/attendance");
  return { ok: true };
}
