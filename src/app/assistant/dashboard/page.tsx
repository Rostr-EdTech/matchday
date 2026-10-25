import { Contact, ArrowRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { accessibleAthleteIds } from "@/lib/access";
import { athletesNeedingAttention } from "@/lib/dashboard";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AttentionList } from "@/components/dashboard/attention-list";

export default async function AssistantDashboard() {
  const user = await requireRole("ASSISTANT");

  const athleteIds = await accessibleAthleteIds(user);

  const [myAthletes, attention, openTasks, doneTasks] = await Promise.all([
    prisma.athlete.findMany({
      where: athleteIds === "ALL" ? {} : { id: { in: athleteIds } },
      orderBy: [{ status: "asc" }, { displayName: "asc" }],
      select: { id: true, displayName: true, primaryPosition: true },
    }),
    athletesNeedingAttention(user),
    prisma.task.count({ where: { assignedToId: user.id, archived: false, completed: false } }),
    prisma.task.count({ where: { assignedToId: user.id, archived: false, completed: true } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome, ${user.name.split(" ")[0]}`} subtitle={formatDate(new Date())} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Tasks remaining" value={openTasks} accent={openTasks ? "text-amber-600" : ""} href="/assistant/tasks" />
        <StatCard label="Tasks completed" value={doneTasks} accent="text-green-600" />
        <StatCard label="Athletes" value={myAthletes.length} />
      </div>

      <Card>
        <CardHeader><CardTitle>Athletes needing attention</CardTitle></CardHeader>
        <CardContent><AttentionList athletes={attention} /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Contact className="h-4 w-4" /> Your athletes</CardTitle></CardHeader>
        <CardContent>
          {myAthletes.length === 0 ? (
            <p className="text-sm text-muted-foreground">You have no assigned athletes yet — ask the head coach to assign you to a team.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {myAthletes.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{a.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">{a.primaryPosition ?? "—"}</p>
                  </div>
                  <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
