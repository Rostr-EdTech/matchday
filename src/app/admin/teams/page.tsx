import Link from "next/link";
import { Shield, Users, UserCog } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { teamScopeWhere } from "@/lib/access";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { AddTeamButton } from "@/components/teams/team-form";

export default async function TeamsPage() {
  const user = await requireOwner();

  const teams = await prisma.team.findMany({
    where: await teamScopeWhere(user),
    orderBy: [{ archived: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { assistantCoaches: true, rosterSpots: { where: { status: "ACTIVE" } } } },
    },
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Teams"
        subtitle={`${teams.length} team${teams.length === 1 ? "" : "s"}`}
        actions={<AddTeamButton />}
      />

      {teams.length === 0 ? (
        <EmptyState
          title="No teams yet"
          message="Add your first team to start building a roster, formations, and match plans."
          icon={<Shield className="h-8 w-8" />}
          action={<AddTeamButton />}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <Link key={t.id} href={`/admin/teams/${t.id}`}>
              <Card className={`h-full transition-colors hover:border-primary/40 ${t.archived ? "opacity-60" : ""}`}>
                <CardContent className="space-y-2 pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">{t.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{t.ageGroup ?? "—"}{t.season ? ` · ${t.season}` : ""}</p>
                    </div>
                    {t.archived && <Badge color="bg-muted text-muted-foreground border-border">Archived</Badge>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {t._count.rosterSpots} athletes</span>
                    <span className="flex items-center gap-1"><UserCog className="h-3.5 w-3.5" /> {t._count.assistantCoaches} assistant coach{t._count.assistantCoaches === 1 ? "" : "es"}</span>
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
