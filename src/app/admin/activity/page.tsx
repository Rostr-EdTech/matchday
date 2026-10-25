import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { athleteIdScopeWhere } from "@/lib/access";
import { activityScopeWhere } from "@/lib/activity-log";
import { formatDateTime, titleCaseFromEnum } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/misc";
import { ActivityFilters } from "@/components/activity/activity-filters";
import { Activity } from "lucide-react";
import type { Prisma } from "@prisma/client";

const PER_PAGE = 40;

export default async function ActivityLogPage({ searchParams }: { searchParams: Promise<{ page?: string; athlete?: string; user?: string }> }) {
  const admin = await requireOwner();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const filters: Prisma.ActivityLogWhereInput = {};
  if (sp.athlete) filters.athleteId = sp.athlete;
  if (sp.user) filters.userId = sp.user;
  const where: Prisma.ActivityLogWhereInput = { AND: [await activityScopeWhere(admin), filters] };
  const myWorkspaceUsers: Prisma.UserWhereInput = { OR: [{ id: admin.id }, { ownerId: admin.id }], role: { in: ["OWNER", "ASSISTANT"] } };

  const [total, logs, athletes, users] = await Promise.all([
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        user: { select: { name: true } },
        athlete: { select: { displayName: true } },
      },
    }),
    prisma.athlete.findMany({ where: await athleteIdScopeWhere(admin), orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }),
    prisma.user.findMany({ where: myWorkspaceUsers, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Activity log" subtitle={`${total} recorded action${total === 1 ? "" : "s"}`} />

      <ActivityFilters athletes={athletes} users={users} currentAthlete={sp.athlete ?? ""} currentUser={sp.user ?? ""} />

      {logs.length === 0 ? (
        <EmptyState title="No activity" message="No actions match the current filters." icon={<Activity className="h-8 w-8" />} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <THead>
                <tr>
                  <TH>When</TH>
                  <TH>User</TH>
                  <TH>Athlete</TH>
                  <TH>Action</TH>
                  <TH>Change</TH>
                </tr>
              </THead>
              <tbody>
                {logs.map((a) => (
                  <TR key={a.id}>
                    <TD className="text-xs text-muted-foreground">{formatDateTime(a.createdAt)}</TD>
                    <TD className="font-medium">{a.user.name}</TD>
                    <TD className="text-xs text-muted-foreground">{a.athlete?.displayName ?? <span className="text-muted-foreground">—</span>}</TD>
                    <TD><Badge color="bg-muted text-muted-foreground border-border">{titleCaseFromEnum(a.actionType)}</Badge></TD>
                    <TD className="max-w-xs truncate text-xs text-muted-foreground">
                      {a.fieldChanged && (a.oldValue || a.newValue) ? `${a.oldValue ?? "∅"} → ${a.newValue ?? "∅"}` : (a.description ?? "—")}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
          <Pagination page={page} perPage={PER_PAGE} total={total} />
        </>
      )}
    </div>
  );
}
