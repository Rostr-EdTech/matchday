import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { resolveCurrentTeamId } from "@/lib/teams";
import { listMatchesForTeam } from "@/actions/matches";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { AddMatchButton } from "@/components/matches/match-form";
import { BADGE_COLORS, labelOf, MATCH_STATUSES } from "@/lib/enums";
import { formatDateTime } from "@/lib/utils";

export default async function MatchesPage({ searchParams }: { searchParams: Promise<{ team?: string }> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const teamId = await resolveCurrentTeamId(user, sp.team);

  if (!teamId) {
    return (
      <div className="space-y-4">
        <PageHeader title="Matches" />
        <EmptyState title="No team yet" message="Create a team first." icon={<CalendarDays className="h-8 w-8" />} />
      </div>
    );
  }

  const matches = await listMatchesForTeam(teamId);

  return (
    <div className="space-y-4">
      <PageHeader title="Matches" subtitle={`${matches.length} scheduled/played`} actions={<AddMatchButton teamId={teamId} />} />

      {matches.length === 0 ? (
        <EmptyState
          title="No matches yet"
          message="Schedule a match, then use the planner to set your starting XI and substitutions."
          icon={<CalendarDays className="h-8 w-8" />}
          action={<AddMatchButton teamId={teamId} />}
        />
      ) : (
        <div className="space-y-2">
          {matches.map((m) => (
            <Link key={m.id} href={`/teams/matches/${m.id}/plan`}>
              <Card className="transition-colors hover:border-primary/40">
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{m.isHome ? "vs" : "@"} {m.opponent}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(m.date)} · {m.periodCount}×{m.periodMinutes} min</p>
                  </div>
                  <Badge color={BADGE_COLORS[m.status]}>{labelOf(MATCH_STATUSES, m.status)}</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
