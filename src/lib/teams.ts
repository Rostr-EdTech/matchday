import "server-only";
import { prisma } from "./prisma";
import type { SessionUser } from "./auth";
import { accessibleTeamIds } from "./access";

export const CURRENT_TEAM_KEY = "currentTeamId";

export type TeamOption = {
  id: string;
  name: string;
  ageGroup: string | null;
  archived: boolean;
};

// The teams a staff user may switch between (head coach -> all; assistant
// coach -> assigned or all). Active first, then by name. Athletes don't
// switch.
export async function listAccessibleTeams(user: SessionUser): Promise<TeamOption[]> {
  const ids = await accessibleTeamIds(user);
  const where = ids === "ALL" ? {} : { id: { in: ids } };
  const teams = await prisma.team.findMany({
    where,
    orderBy: [{ archived: "asc" }, { name: "asc" }],
    select: { id: true, name: true, ageGroup: true, archived: true },
  });
  return teams;
}

// Resolve the "current team" a staff user is working on:
//   1. an explicit ?team= / preference id they may access, else
//   2. their last-selected team (UserPreference), else
//   3. the first accessible team.
// Returns null when the user has no accessible teams yet.
export async function resolveCurrentTeamId(
  user: SessionUser,
  explicitId?: string | null,
): Promise<string | null> {
  const ids = await accessibleTeamIds(user);
  const canSee = (id: string) => ids === "ALL" || ids.includes(id);

  if (explicitId && canSee(explicitId)) return explicitId;

  const pref = await prisma.userPreference.findUnique({
    where: { userId_key: { userId: user.id, key: CURRENT_TEAM_KEY } },
    select: { value: true },
  });
  if (pref?.value && canSee(pref.value)) {
    // Confirm it still exists (could have been deleted).
    const exists = await prisma.team.findUnique({ where: { id: pref.value }, select: { id: true } });
    if (exists) return pref.value;
  }

  const first = await prisma.team.findFirst({
    where: ids === "ALL" ? {} : { id: { in: ids } },
    orderBy: [{ archived: "asc" }, { name: "asc" }],
    select: { id: true },
  });
  return first?.id ?? null;
}

// Persist the current team for a staff user (used by the header switcher).
export async function setCurrentTeamId(userId: string, teamId: string): Promise<void> {
  await prisma.userPreference.upsert({
    where: { userId_key: { userId, key: CURRENT_TEAM_KEY } },
    update: { value: teamId },
    create: { userId, key: CURRENT_TEAM_KEY, value: teamId },
  });
}
