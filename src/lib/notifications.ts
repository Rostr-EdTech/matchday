import "server-only";
import { prisma } from "./prisma";

type NotifyArgs = {
  userId: string;
  title: string;
  message: string;
  athleteId?: string | null;
};

export async function notify(args: NotifyArgs): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: args.userId,
        title: args.title,
        message: args.message,
        athleteId: args.athleteId ?? null,
      },
    });
  } catch (e) {
    console.error("[notifications] failed to create", e);
  }
}

// Notify only the assistant coaches who can see a given athlete: those
// assigned (via TeamAssistantCoach) to a team the athlete is actively
// rostered on, plus any with all-access WITHIN THE OWNING HEAD COACH'S
// WORKSPACE (not every all-access assistant platform-wide — two unrelated
// head coaches' all-access assistants must never both get pinged about an
// athlete neither of them coaches). Never fans out to every assistant coach.
// This is the 2-hop lookup — see src/lib/access.ts's accessibleAthleteIds
// for the same logic used for read-scoping.
export async function notifyAssistantCoachesForAthlete(
  athleteId: string,
  args: Omit<NotifyArgs, "userId" | "athleteId">,
): Promise<void> {
  const rosterSpots = await prisma.rosterSpot.findMany({
    where: { athleteId, status: "ACTIVE" },
    select: { teamId: true, team: { select: { coachId: true } } },
  });
  const teamIds = rosterSpots.map((r) => r.teamId);
  const coachIds = [...new Set(rosterSpots.map((r) => r.team.coachId))];

  const assistants = await prisma.user.findMany({
    where: {
      role: "ASSISTANT",
      active: true,
      OR: [
        ...(coachIds.length ? [{ allClientsAccess: true, ownerId: { in: coachIds } }] : []),
        ...(teamIds.length ? [{ assistantCoachAssignments: { some: { teamId: { in: teamIds } } } }] : []),
      ],
    },
    select: { id: true },
  });
  await Promise.all(assistants.map((a) => notify({ ...args, userId: a.id, athleteId })));
}

// Notify the athlete's own portal user (if they have one and it's active).
export async function notifyAthleteUser(
  athleteId: string,
  args: Omit<NotifyArgs, "userId" | "athleteId">,
): Promise<void> {
  const athlete = await prisma.athlete.findUnique({
    where: { id: athleteId },
    select: { linkedUser: { select: { id: true, active: true } } },
  });
  const u = athlete?.linkedUser;
  if (u && u.active) await notify({ ...args, userId: u.id, athleteId });
}
