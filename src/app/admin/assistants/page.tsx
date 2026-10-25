import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { teamScopeWhere } from "@/lib/access";
import { PageHeader } from "@/components/layout/page-header";
import { AssistantManager } from "@/components/users/assistant-manager";

export default async function AssistantsPage() {
  const me = await requireOwner();

  const assistants = await prisma.user.findMany({
    where: { role: "ASSISTANT", ownerId: me.id },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true, name: true, email: true, active: true, allClientsAccess: true, mustChangePassword: true,
      assistantInvite: { select: { token: true, expiresAt: true } },
      _count: { select: { assistantCoachAssignments: true } },
    },
  });

  const teams = await prisma.team.findMany({
    where: await teamScopeWhere(me),
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // Which teams each assistant coach is assigned to (for the per-row chips)
  // — scoped to my own assistants (a cross-workspace grant, if any, still
  // shows as a teamId chip even though we don't have that team's name to show).
  const assignments = await prisma.teamAssistantCoach.findMany({
    where: { assistantCoachUserId: { in: assistants.map((a) => a.id) } },
    select: { teamId: true, assistantCoachUserId: true },
  });
  const byAssistant = new Map<string, string[]>();
  for (const a of assignments) {
    const arr = byAssistant.get(a.assistantCoachUserId) ?? [];
    arr.push(a.teamId);
    byAssistant.set(a.assistantCoachUserId, arr);
  }

  const rows = assistants.map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    active: a.active,
    allClientsAccess: a.allClientsAccess,
    pendingReset: a.mustChangePassword,
    teamIds: byAssistant.get(a.id) ?? [],
    pendingInvite: a.assistantInvite ? { token: a.assistantInvite.token, expiresAt: a.assistantInvite.expiresAt.toISOString() } : null,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Assistant Coaches"
        subtitle="Staff who help manage rosters and lineups. Assign each to one or more teams."
      />
      <AssistantManager assistants={rows} teams={teams} currentUserId={me.id} />
    </div>
  );
}
