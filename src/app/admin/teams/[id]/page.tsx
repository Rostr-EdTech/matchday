import Link from "next/link";
import { notFound } from "next/navigation";
import { LayoutGrid, CalendarDays } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { canAccessTeam, athleteIdScopeWhere } from "@/lib/access";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TeamFields } from "@/components/teams/team-form";
import { RosterManager } from "@/components/teams/roster-manager";
import { AssistantCoachAssigner } from "@/components/teams/assistant-coach-assigner";
import { setTeamArchived } from "@/actions/teams";

export default async function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  const { id } = await params;
  if (!(await canAccessTeam(user, id))) notFound();

  const team = await prisma.team.findUnique({
    where: { id },
    include: {
      rosterSpots: {
        where: { status: "ACTIVE" },
        include: { athlete: { select: { id: true, displayName: true, jerseyNumber: true, primaryPosition: true, injuryStatus: true } } },
      },
      assistantCoaches: { include: { assistantCoach: { select: { id: true, name: true, email: true } } } },
    },
  });
  if (!team) notFound();

  // The picker offers my own assistant coaches (the common case), plus —
  // so an already-assigned cross-workspace assistant (an explicit grant to a
  // colleague's account) still shows up as assigned rather than silently
  // vanishing from this list — anyone already on this team's
  // TeamAssistantCoach.
  const alreadyAssignedIds = team.assistantCoaches.map((c) => c.assistantCoachUserId);
  const [allAssistantCoaches, allAthletes] = await Promise.all([
    prisma.user.findMany({
      where: { role: "ASSISTANT", active: true, OR: [{ ownerId: user.id }, { id: { in: alreadyAssignedIds } }] },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.athlete.findMany({ where: { ...(await athleteIdScopeWhere(user)), status: "ACTIVE" }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }),
  ]);

  const rosteredIds = new Set(team.rosterSpots.map((r) => r.athleteId));
  const assignedAssistantIds = new Set(team.assistantCoaches.map((c) => c.assistantCoachUserId));
  const unrosteredAthletes = allAthletes.filter((a) => !rosteredIds.has(a.id));

  const initial = { name: team.name, ageGroup: team.ageGroup, season: team.season };

  async function toggleArchive() {
    "use server";
    await setTeamArchived(id, !team!.archived);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={team.name}
        subtitle={[team.ageGroup, team.season].filter(Boolean).join(" · ") || "No details set"}
        actions={
          <>
            <Link href={`/teams/board?team=${team.id}`}><Button variant="outline"><LayoutGrid className="h-4 w-4" /> Tactical board</Button></Link>
            <Link href={`/teams/matches?team=${team.id}`}><Button variant="outline"><CalendarDays className="h-4 w-4" /> Matches</Button></Link>
            <form action={toggleArchive}>
              <Button type="submit" variant="outline">{team.archived ? "Restore" : "Archive"}</Button>
            </form>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Team details</CardTitle></CardHeader>
            <CardContent>
              <TeamFields mode="edit" teamId={team.id} initial={initial} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Roster</CardTitle></CardHeader>
            <CardContent>
              <RosterManager
                teamId={team.id}
                rostered={team.rosterSpots.map((r) => r.athlete)}
                unrosteredAthletes={unrosteredAthletes}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Assistant coaches</CardTitle></CardHeader>
            <CardContent>
              <AssistantCoachAssigner
                teamId={team.id}
                allAssistantCoaches={allAssistantCoaches}
                assignedIds={[...assignedAssistantIds]}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
