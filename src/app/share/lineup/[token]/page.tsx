import { notFound } from "next/navigation";
import { Trophy } from "lucide-react";
import { getSharedLineup } from "@/actions/lineups";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SharedBoardView } from "@/components/board/shared-board-view";
import { APP_NAME } from "@/lib/app-config";

// Public, unauthenticated page — a coach shares this link directly with
// their team (text/email/group chat), no athlete portal login required.
// See actions/lineups.ts::getSharedLineup for why an unshared/invalid token
// can never resolve here.
export default async function SharedLineupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lineup = await getSharedLineup(token);
  if (!lineup) notFound();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 p-4">
      <div className="mx-auto max-w-3xl space-y-4 py-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{APP_NAME}</p>
            <p className="text-xs text-muted-foreground">{lineup.team.name}{lineup.team.season ? ` · ${lineup.team.season}` : ""}</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{lineup.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {lineup.notes && (
              <p className="whitespace-pre-wrap rounded-md border border-border bg-muted p-3 text-sm text-foreground">{lineup.notes}</p>
            )}
            <SharedBoardView
              slots={lineup.slots}
              arrows={lineup.arrows.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }))}
              ball={lineup.ballX != null && lineup.ballY != null ? { x: lineup.ballX, y: lineup.ballY } : null}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
