import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getMatchPlan } from "@/actions/matches";
import { PageHeader } from "@/components/layout/page-header";
import { Planner } from "@/components/matches/planner";
import { formatDateTime } from "@/lib/utils";

export default async function MatchPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const match = await getMatchPlan(id);
  if (!match) notFound();

  return (
    <div className="space-y-4">
      <Link href="/teams/matches" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-3.5 w-3.5" /> All matches
      </Link>
      <PageHeader
        title={`${match.isHome ? "vs" : "@"} ${match.opponent}`}
        subtitle={`${formatDateTime(match.date)} · ${match.periodCount}×${match.periodMinutes} min`}
      />

      <Planner
        matchId={match.id}
        periodCount={match.periodCount}
        periodMinutes={match.periodMinutes}
        roster={match.team.rosterSpots.map((r) => r.athlete)}
        appearances={match.appearances}
        lineups={match.lineups}
      />
    </div>
  );
}
