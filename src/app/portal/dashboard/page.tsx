import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth";
import { feedbackForAthlete } from "@/lib/feedback";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FEEDBACK_VISIBILITY, BADGE_COLORS, labelOf, INJURY_STATUSES } from "@/lib/enums";

// The athlete portal overview: own info, teams, and recent feedback shared
// by a coach. Own data only — no roster comparison against teammates (see
// CONTEXT.md).
export default async function PortalDashboard() {
  const user = await requireClient();

  const [athlete, rosterSpots] = await Promise.all([
    prisma.athlete.findUnique({
      where: { id: user.athleteId },
      select: { displayName: true, jerseyNumber: true, primaryPosition: true, injuryStatus: true },
    }),
    prisma.rosterSpot.findMany({
      where: { athleteId: user.athleteId, status: "ACTIVE" },
      include: { team: { select: { id: true, name: true, ageGroup: true, season: true } } },
      orderBy: { team: { name: "asc" } },
    }),
  ]);

  const recentFeedback = await feedbackForAthlete(user.athleteId, false, 5);
  const sharedLineups = rosterSpots.length
    ? await prisma.lineup.findMany({
        where: { teamId: { in: rosterSpots.map((r) => r.team.id) }, sharedAt: { not: null } },
        orderBy: { sharedAt: "desc" },
        select: { id: true, name: true, shareToken: true, sharedAt: true, team: { select: { name: true } } },
      })
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome${athlete ? `, ${athlete.displayName.split(" ")[0]}` : ""}`}
        subtitle={athlete?.primaryPosition ? `${athlete.primaryPosition}${athlete.jerseyNumber != null ? ` · #${athlete.jerseyNumber}` : ""}` : "Your teams and recent feedback."}
      />

      {athlete && athlete.injuryStatus !== "HEALTHY" && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="py-3 text-sm text-amber-800">
            Your status is currently marked <strong>{labelOf(INJURY_STATUSES, athlete.injuryStatus)}</strong>. Talk to your coach if this looks out of date.
          </CardContent>
        </Card>
      )}

      {rosterSpots.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">You&apos;re not on any team roster yet.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rosterSpots.map((r) => (
            <Card key={r.team.id}>
              <CardContent className="pt-5">
                <p className="text-sm font-semibold text-foreground">{r.team.name}</p>
                <p className="text-xs text-muted-foreground">{[r.team.ageGroup, r.team.season].filter(Boolean).join(" · ") || "—"}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sharedLineups.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Game plan</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {sharedLineups.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{l.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{l.team.name}</span>
                  </span>
                  <Link href={`/share/lineup/${l.shareToken}`}>
                    <Button size="sm" variant="outline"><LayoutGrid className="h-3.5 w-3.5" /> View</Button>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Recent feedback</CardTitle></CardHeader>
        <CardContent>
          {recentFeedback.length === 0 ? (
            <p className="text-sm text-muted-foreground">No feedback has been shared with you yet.</p>
          ) : (
            <ul className="space-y-3">
              {recentFeedback.map((f) => (
                <li key={f.id} className="rounded-md border border-border p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">{f.authorName}</span>
                    <Badge color={BADGE_COLORS[f.visibility]}>{labelOf(FEEDBACK_VISIBILITY, f.visibility)}</Badge>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{f.message}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{f.createdAt.toLocaleDateString()}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
