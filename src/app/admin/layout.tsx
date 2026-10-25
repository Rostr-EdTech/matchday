import { requireRole, enforcePasswordReset } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";
import { listAccessibleTeams, resolveCurrentTeamId } from "@/lib/teams";
import { APP_NAME } from "@/lib/app-config";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("OWNER");
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
