import Link from "next/link";
import { Users, Shield, Activity as ActivityIcon, ListChecks } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { athleteIdScopeWhere } from "@/lib/access";
import { activityScopeWhere } from "@/lib/activity-log";
import { athletesNeedingAttention } from "@/lib/dashboard";
import { relativeTime, titleCaseFromEnum } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Onboarding } from "@/components/dashboard/onboarding";
import { AttentionList } from "@/components/dashboard/attention-list";

export default async function AdminDashboard() {
  const user = await requireOwner();

  const athleteWhere = await athleteIdScopeWhere(user);
  const activityWhere = await activityScopeWhere(user);
  const [teamCount, totalAthletes, activeAthletes, assistantCount, athletePortalLogins, recentActivity, attention] =
    await Promise.all([
      prisma.team.count({ where: { coachId: user.id, archived: false } }),
      prisma.athlete.count({ where: athleteWhere }),
      prisma.athlete.count({ where: { ...athleteWhere, status: "ACTIVE" } }),
      prisma.teamAssistantCoach.count({ where: { team: { coachId: user.id } } }),
      prisma.athlete.count({ where: { ...athleteWhere, linkedUserId: { not: null } } }),
      prisma.activityLog.findMany({ where: activityWhere, orderBy: { createdAt: "desc" }, take: 8, include: { user: { select: { name: true } } } }),
      athletesNeedingAttention(user),
    ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Overview across your teams."
        actions={<Link href="/admin/athletes"><Button>Manage athletes</Button></Link>}
      />

      <Onboarding
        hasTeam={teamCount > 0}
        hasAthlete={totalAthletes > 0}
        hasAssistant={assistantCount > 0}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Teams" value={teamCount} href="/admin/teams" icon={<Shield className="h-5 w-5" />} />
        <StatCard label="Athletes" value={totalAthletes} href="/admin/athletes" icon={<Users className="h-5 w-5" />} />
        <StatCard label="Active" value={activeAthletes} accent="text-green-600" icon={<Users className="h-5 w-5" />} />
        <StatCard label="Portal logins" value={athletePortalLogins} icon={<Users className="h-5 w-5" />} />
      </div>

      <Card>
        <CardHeader><CardTitle>Athletes needing attention</CardTitle></CardHeader>
        <CardContent><AttentionList athletes={attention} /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {recentActivity.map((a) => (
                <li key={a.id} className="flex items-start gap-2 text-sm">
                  <ActivityIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">{a.user.name}</span>{" "}
                    {a.description ?? titleCaseFromEnum(a.actionType)}
                    <span className="ml-1 text-xs text-muted-foreground">{relativeTime(a.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Quick actions</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link href="/admin/tasks"><Button variant="outline"><ListChecks className="h-4 w-4" /> Manage tasks</Button></Link>
          <Link href="/admin/activity"><Button variant="outline"><ActivityIcon className="h-4 w-4" /> Activity log</Button></Link>
        </CardContent>
      </Card>
    </div>
  );
}
