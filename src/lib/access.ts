import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { SessionUser } from "./auth";

// ---------------------------------------------------------------------------
// The athlete-scoping security spine.
//
// EVERY athlete-scoped server action, API route and query calls into here so
// data isolation is enforced in ONE place:
//   - OWNER      (Head Coach)      → teams they coach (Team.coachId) or are
//                                    an explicit TeamAssistantCoach on, plus
//                                    athletes they created or who are on the
//                                    roster of those teams. Each OWNER is an
//                                    independent workspace root — NOT "every
//                                    team/athlete in the database".
//   - ASSISTANT  (Assistant Coach) → athletes rostered on teams they're
//                                    assigned to (TeamAssistantCoach ->
//                                    RosterSpot, a 2-hop lookup), OR every
//                                    team coached by their OWNING head coach
//                                    if `allClientsAccess` is set (their
//                                    workspace, not the whole platform).
//   - CLIENT     (Athlete)         → only their own linked athleteId
//
// The 2-hop assistant lookup mirrors class_copilot's ClassCoTeacher pattern —
// an assistant coach is assigned to a whole Team, not to individual athletes
// piecemeal (see CONTEXT.md).
// ---------------------------------------------------------------------------

export class AccessError extends Error {
  constructor(message = "You don't have access to this athlete's data.") {
    super(message);
    this.name = "AccessError";
  }
}

type AccessUser = Pick<SessionUser, "id" | "role" | "athleteId" | "allClientsAccess" | "ownerId">;

// The OWNER whose workspace this account belongs to: an OWNER is their own
// workspace root; an ASSISTANT belongs to whoever created them.
function workspaceOwnerId(user: AccessUser): string {
  return user.role === "OWNER" ? user.id : (user.ownerId ?? user.id);
}

// The set of team ids a user may see.
export async function accessibleTeamIds(user: AccessUser): Promise<"ALL" | string[]> {
  if (user.role === "OWNER") {
    const rows = await prisma.team.findMany({
      where: { OR: [{ coachId: user.id }, { assistantCoaches: { some: { assistantCoachUserId: user.id } } }] },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
  if (user.role === "CLIENT") {
    if (!user.athleteId) return [];
    const rows = await prisma.rosterSpot.findMany({
      where: { athleteId: user.athleteId, status: "ACTIVE" },
      select: { teamId: true },
    });
    return rows.map((r) => r.teamId);
  }
  // ASSISTANT (assistant coach)
  if (user.allClientsAccess) {
    const rows = await prisma.team.findMany({ where: { coachId: workspaceOwnerId(user) }, select: { id: true } });
    return rows.map((r) => r.id);
  }
  const rows = await prisma.teamAssistantCoach.findMany({
    where: { assistantCoachUserId: user.id },
    select: { teamId: true },
  });
  return rows.map((r) => r.teamId);
}

// The set of athlete ids a user may see. An empty list means "no athletes" —
// callers must treat that as "match nothing", never "match everything".
export async function accessibleAthleteIds(user: AccessUser): Promise<"ALL" | string[]> {
  if (user.role === "CLIENT") return user.athleteId ? [user.athleteId] : [];
  if (user.role === "OWNER" || user.allClientsAccess) {
    const teamIds = await accessibleTeamIds(user);
    const rosterRows =
      teamIds === "ALL" || teamIds.length === 0
        ? []
        : await prisma.rosterSpot.findMany({ where: { teamId: { in: teamIds }, status: "ACTIVE" }, select: { athleteId: true } });
    const ids = new Set(rosterRows.map((r) => r.athleteId));
    if (user.role === "OWNER") {
      const ownRows = await prisma.athlete.findMany({ where: { createdByUserId: user.id }, select: { id: true } });
      for (const r of ownRows) ids.add(r.id);
    }
    return [...ids];
  }
  // ASSISTANT (assistant coach), no all-access
  const teamRows = await prisma.teamAssistantCoach.findMany({
    where: { assistantCoachUserId: user.id },
    select: { teamId: true },
  });
  const teamIds = teamRows.map((r) => r.teamId);
  if (teamIds.length === 0) return [];
  const rosterRows = await prisma.rosterSpot.findMany({
    where: { teamId: { in: teamIds }, status: "ACTIVE" },
    select: { athleteId: true },
  });
  return [...new Set(rosterRows.map((r) => r.athleteId))];
}

// A Prisma `where` fragment scoping an athleteId column to what the user may see.
// Spread into any query over an athlete-scoped model:
//   where: { ...(await athleteScopeWhere(user)), archived: false }
export async function athleteScopeWhere(
  user: AccessUser,
): Promise<{ athleteId?: { in: string[] } }> {
  const ids = await accessibleAthleteIds(user);
  if (ids === "ALL") return {};
  return { athleteId: { in: ids } };
}

// A Prisma `where` fragment scoping a Team's own `id` to what the user may see.
export async function teamScopeWhere(user: AccessUser): Promise<{ id?: { in: string[] } }> {
  const ids = await accessibleTeamIds(user);
  if (ids === "ALL") return {};
  return { id: { in: ids } };
}

// A Prisma `where` fragment scoping the Athlete model's own `id` (NOT an
// `athleteId` foreign key column on some other model — use athleteScopeWhere
// for those instead). For queries against `prisma.athlete.*` directly.
export async function athleteIdScopeWhere(user: AccessUser): Promise<{ id?: { in: string[] } }> {
  const ids = await accessibleAthleteIds(user);
  if (ids === "ALL") return {};
  return { id: { in: ids } };
}

// A Prisma `where` fragment scoping Task rows to what this OWNER may see:
// created by them, assigned to them or one of their own assistants, or tied
// to a team/athlete they can access. Mirrors src/actions/tasks.ts's
// taskInOwnerWorkspace, as a filter instead of a per-record check.
export async function taskScopeWhere(user: AccessUser): Promise<Prisma.TaskWhereInput> {
  const [teamIds, athleteIds] = await Promise.all([accessibleTeamIds(user), accessibleAthleteIds(user)]);
  const workspaceOwner = workspaceOwnerId(user);
  return {
    OR: [
      { createdById: user.id },
      { assignedToId: user.id },
      { assignedTo: { ownerId: workspaceOwner } },
      ...(teamIds === "ALL" ? [{ teamId: { not: null } }] : teamIds.length ? [{ teamId: { in: teamIds } }] : []),
      ...(athleteIds === "ALL" ? [{ athleteId: { not: null } }] : athleteIds.length ? [{ athleteId: { in: athleteIds } }] : []),
    ],
  };
}

// True if the user may access this specific athlete.
export async function canAccessAthlete(user: AccessUser, athleteId: string): Promise<boolean> {
  if (!athleteId) return false;
  if (user.role === "CLIENT") return user.athleteId === athleteId;
  if (user.role === "OWNER") {
    const athlete = await prisma.athlete.findUnique({ where: { id: athleteId }, select: { createdByUserId: true } });
    if (!athlete) return false;
    if (athlete.createdByUserId === user.id) return true;
    const spot = await prisma.rosterSpot.findFirst({
      where: { athleteId, status: "ACTIVE", team: { OR: [{ coachId: user.id }, { assistantCoaches: { some: { assistantCoachUserId: user.id } } }] } },
      select: { id: true },
    });
    return !!spot;
  }
  // ASSISTANT (assistant coach)
  if (user.allClientsAccess) {
    const spot = await prisma.rosterSpot.findFirst({
      where: { athleteId, status: "ACTIVE", team: { coachId: workspaceOwnerId(user) } },
      select: { id: true },
    });
    return !!spot;
  }
  const teamRows = await prisma.teamAssistantCoach.findMany({
    where: { assistantCoachUserId: user.id },
    select: { teamId: true },
  });
  const teamIds = teamRows.map((r) => r.teamId);
  if (teamIds.length === 0) return false;
  const spot = await prisma.rosterSpot.findFirst({
    where: { athleteId, teamId: { in: teamIds }, status: "ACTIVE" },
    select: { id: true },
  });
  return !!spot;
}

// True if the user may access this specific team.
export async function canAccessTeam(user: AccessUser, teamId: string): Promise<boolean> {
  if (!teamId) return false;
  if (user.role === "OWNER") {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { coachId: true, assistantCoaches: { where: { assistantCoachUserId: user.id }, select: { id: true } } },
    });
    if (!team) return false;
    return team.coachId === user.id || team.assistantCoaches.length > 0;
  }
  if (user.role === "CLIENT") {
    if (!user.athleteId) return false;
    const spot = await prisma.rosterSpot.findFirst({
      where: { athleteId: user.athleteId, teamId, status: "ACTIVE" },
      select: { id: true },
    });
    return !!spot;
  }
  // ASSISTANT (assistant coach)
  if (user.allClientsAccess) {
    const team = await prisma.team.findUnique({ where: { id: teamId }, select: { coachId: true } });
    return team?.coachId === workspaceOwnerId(user);
  }
  const row = await prisma.teamAssistantCoach.findUnique({
    where: { teamId_assistantCoachUserId: { teamId, assistantCoachUserId: user.id } },
    select: { id: true },
  });
  return !!row;
}

// Throw AccessError unless the user may access this athlete. Use in every
// athlete-scoped write/read of a specific record.
export async function assertCanAccessAthlete(user: AccessUser, athleteId: string): Promise<void> {
  if (!(await canAccessAthlete(user, athleteId))) throw new AccessError();
}

// Throw AccessError unless the user may access this team. Use in every
// team-scoped write/read of a specific record.
export async function assertCanAccessTeam(user: AccessUser, teamId: string): Promise<void> {
  if (!(await canAccessTeam(user, teamId))) {
    throw new AccessError("You don't have access to this team's data.");
  }
}

// Whether a user may WRITE (add/edit athletes, manage teams, give feedback,
// plan lineups/matches). CLIENT portal users are read-only — they can see
// COACH_ONLY/ATHLETE_VISIBLE feedback on their own record but never write
// anything. Staff can write.
export function canWriteForAthletes(user: Pick<SessionUser, "role">): boolean {
  return user.role === "OWNER" || user.role === "ASSISTANT";
}
