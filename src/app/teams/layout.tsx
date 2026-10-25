import { requireStaff, enforcePasswordReset } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";
import { listAccessibleTeams, resolveCurrentTeamId } from "@/lib/teams";
import { APP_NAME } from "@/lib/app-config";

// Shared staff workspace routes (the tactical board, the match planner) —
// reachable by both the Head Coach (OWNER) and any Assistant Coach
// (ASSISTANT), unlike /admin and /assistant which are role-specific. A
// CLIENT (Athlete) portal user must never reach these; requireStaff()
// enforces that.
export default async function TeamsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  enforcePasswordReset(user);
  const [teams, currentTeamId] = await Promise.all([
    listAccessibleTeams(user),
    resolveCurrentTeamId(user),
  ]);
  return (
    <AppShell user={user} teams={teams} currentTeamId={currentTeamId} brandName={APP_NAME}>
      {children}
    </AppShell>
  );
}
