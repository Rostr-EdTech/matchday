import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { resolveCurrentTeamId } from "@/lib/teams";
import { listPracticesForTeam } from "@/actions/attendance";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { AddPracticeButton } from "@/components/attendance/practice-form";
import { formatDateTime } from "@/lib/utils";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ team?: string }> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const teamId = await resolveCurrentTeamId(user, sp.team);

  if (!teamId) {
    return (
      <div className="space-y-4">
        <PageHeader title="Attendance" />
        <EmptyState title="No team yet" message="Create a team first." icon={<ClipboardCheck className="h-8 w-8" />} />
      </div>
    );
  }

  const practices = await listPracticesForTeam(teamId);

  return (
    <div className="space-y-4">
      <PageHeader title="Attendance" subtitle={`${practices.length} practice${practices.length === 1 ? "" : "s"} logged`} actions={<AddPracticeButton teamId={teamId} />} />

      {practices.length === 0 ? (
        <EmptyState
          title="No practices logged yet"
          message="Start a practice and take a quick roll call — every active roster athlete defaults to present, so you only tap the exceptions."
          icon={<ClipboardCheck className="h-8 w-8" />}
          action={<AddPracticeButton teamId={teamId} />}
        />
      ) : (
        <div className="space-y-2">
          {practices.map((p) => (
            <Link key={p.id} href={`/teams/attendance/${p.id}`}>
              <Card className="transition-colors hover:border-primary/40">
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{formatDateTime(p.date)}</p>
                    {p.notes && <p className="truncate text-xs text-muted-foreground">{p.notes}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge color="bg-emerald-100 text-emerald-800 border-emerald-200">{p.counts.present} present</Badge>
                    {p.counts.late > 0 && <Badge color="bg-amber-100 text-amber-800 border-amber-200">{p.counts.late} late</Badge>}
                    {p.counts.absent > 0 && <Badge color="bg-red-100 text-red-800 border-red-200">{p.counts.absent} absent</Badge>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
