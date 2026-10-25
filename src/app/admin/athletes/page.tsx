import Link from "next/link";
import { Contact } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { athleteIdScopeWhere } from "@/lib/access";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { AddAthleteButton } from "@/components/athletes/athlete-form";
import { BADGE_COLORS, labelOf, ATHLETE_STATUSES, INJURY_STATUSES } from "@/lib/enums";

export default async function AthletesPage() {
  const user = await requireOwner();

  const athletes = await prisma.athlete.findMany({
    where: await athleteIdScopeWhere(user),
    orderBy: [{ status: "asc" }, { displayName: "asc" }],
    include: {
      linkedUser: { select: { id: true, active: true } },
    },
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Athletes"
        subtitle={`${athletes.length} athlete${athletes.length === 1 ? "" : "s"}`}
        actions={<AddAthleteButton />}
      />

      {athletes.length === 0 ? (
        <EmptyState
          title="No athletes yet"
          message="Add your first athlete, or create a team and import a roster."
          icon={<Contact className="h-8 w-8" />}
          action={<AddAthleteButton />}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {athletes.map((a) => (
            <Link key={a.id} href={`/admin/athletes/${a.id}`}>
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardContent className="space-y-2 pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">
                        {a.jerseyNumber != null && <span className="mr-1.5 text-muted-foreground">#{a.jerseyNumber}</span>}
                        {a.displayName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{a.primaryPosition ?? "No position set"}</p>
                    </div>
                    <Badge color={BADGE_COLORS[a.status]}>{labelOf(ATHLETE_STATUSES, a.status)}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {a.injuryStatus !== "HEALTHY" && (
                      <Badge color={BADGE_COLORS[a.injuryStatus]}>{labelOf(INJURY_STATUSES, a.injuryStatus)}</Badge>
                    )}
                    {a.linkedUser && (
                      <Badge color={a.linkedUser.active ? "bg-violet-100 text-violet-700 border-violet-200" : "bg-muted text-muted-foreground border-border"}>
                        {a.linkedUser.active ? "Portal on" : "Portal off"}
                      </Badge>
                    )}
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
