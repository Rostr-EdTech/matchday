import { requireStaff } from "@/lib/auth";
import { resolveCurrentTeamId } from "@/lib/teams";
import { listFormations, listLineupsForTeam, getLineupBoard, createLineup } from "@/actions/lineups";
import { EmptyState } from "@/components/ui/misc";
import { LayoutGrid } from "lucide-react";
import { FormationBoard } from "@/components/board/formation-board";

export default async function FormationBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string; lineup?: string }>;
}) {
  const user = await requireStaff();
  const sp = await searchParams;
  const teamId = await resolveCurrentTeamId(user, sp.team);

  if (!teamId) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tactical Board</h1>
        <EmptyState title="No team yet" message="Create a team and roster some athletes first." icon={<LayoutGrid className="h-8 w-8" />} />
      </div>
    );
  }

  const [formations, lineups] = await Promise.all([listFormations(), listLineupsForTeam(teamId)]);
  let activeLineupId = sp.lineup && lineups.some((l) => l.id === sp.lineup) ? sp.lineup : lineups[0]?.id;

  // The board is always shown, never gated behind picking a formation first
  // — a team's very first visit here gets a blank board created for them on
  // the spot, ready to drag athletes onto immediately.
  if (!activeLineupId) {
    const created = await createLineup(teamId);
    if (!created.ok || !created.id) {
      return (
        <div className="space-y-4">
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tactical Board</h1>
          <EmptyState title="Couldn't load the board" message={created.error} icon={<LayoutGrid className="h-8 w-8" />} />
        </div>
      );
    }
    activeLineupId = created.id;
    lineups.unshift({ id: created.id, name: "New board", updatedAt: new Date(), sharedAt: null, formation: null, matchId: null });
  }

  const lineup = await getLineupBoard(activeLineupId);
  if (!lineup) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tactical Board</h1>
        <EmptyState title="Board not found" icon={<LayoutGrid className="h-8 w-8" />} />
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-slate-900 p-4 shadow-lg sm:p-6">
      <div className="mb-4">
        <h1 className="text-balance text-xl font-bold text-white sm:text-2xl">Tactical Board</h1>
        <p className="mt-0.5 text-sm text-slate-400">Drag athletes onto the pitch — freely, or start from a formation.</p>
      </div>
      <FormationBoard
        lineup={{
          ...lineup,
          sharedAt: lineup.sharedAt ? lineup.sharedAt.toISOString() : null,
          arrows: lineup.arrows.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
        }}
        lineups={lineups.map((l) => ({ id: l.id, name: l.name, sharedAt: l.sharedAt ? l.sharedAt.toISOString() : null }))}
        formations={formations.map((f) => ({ id: f.id, name: f.name }))}
      />
    </div>
  );
}
