import "server-only";
import { prisma } from "./prisma";
import { accessibleAthleteIds } from "./access";
import type { SessionUser } from "./auth";

export type AttentionAthlete = {
  id: string;
  displayName: string;
  teamName: string | null;
  reason: string;
};

// A computed, non-authoritative "who should I check on" list — every
// accessible athlete currently flagged QUESTIONABLE or OUT. Never hides or
// overrides a coach's own judgment; just surfaces it prominently on the
// dashboard. Simpler than class_copilot's trend-suggestion equivalent (no
// mastery/engagement history to reason about here) — injuryStatus already IS
// the signal, set directly by a coach/trainer.
export async function athletesNeedingAttention(
  user: Pick<SessionUser, "id" | "role" | "athleteId" | "allClientsAccess" | "ownerId">,
): Promise<AttentionAthlete[]> {
  const ids = await accessibleAthleteIds(user);
  if (ids !== "ALL" && ids.length === 0) return [];

  const athletes = await prisma.athlete.findMany({
    where: {
      ...(ids === "ALL" ? {} : { id: { in: ids } }),
      injuryStatus: { in: ["QUESTIONABLE", "OUT"] },
      status: "ACTIVE",
    },
    orderBy: { injuryUpdatedAt: "desc" },
    select: {
      id: true,
      displayName: true,
      injuryStatus: true,
      injuryNote: true,
      rosterSpots: { where: { status: "ACTIVE" }, take: 1, select: { team: { select: { name: true } } } },
    },
  });

  return athletes.map((a) => ({
    id: a.id,
    displayName: a.displayName,
    teamName: a.rosterSpots[0]?.team.name ?? null,
    reason: a.injuryStatus === "OUT" ? (a.injuryNote ? `Out — ${a.injuryNote}` : "Out") : (a.injuryNote ? `Questionable — ${a.injuryNote}` : "Questionable"),
  }));
}
