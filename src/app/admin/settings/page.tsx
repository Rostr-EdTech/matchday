import { Settings as SettingsIcon, ShieldCheck } from "lucide-react";
import { requireOwner } from "@/lib/auth";
import { getKeyStatuses } from "@/lib/settings";
import { allowedEmailDomain } from "@/lib/allowed-email";
import { listAllowedEmails } from "@/actions/allowed-emails";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiKeysForm } from "@/components/settings/api-keys-form";
import { RosterAllowlistForm } from "@/components/settings/roster-allowlist-form";

export default async function AdminSettingsPage() {
  await requireOwner();
  const [statuses, allowedEmails] = await Promise.all([getKeyStatuses(), listAllowedEmails()]);

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" subtitle="Approved sign-up roster and invite-email credentials." />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Approved sign-up roster
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Who's allowed to create a head-coach account or claim an athlete portal invite.
          </p>
        </CardHeader>
        <CardContent>
          <RosterAllowlistForm rows={allowedEmails} domain={allowedEmailDomain()} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SettingsIcon className="h-4 w-4" /> Invite email
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Gmail credentials used to send bulk athlete-invite emails from the team roster page.
          </p>
        </CardHeader>
        <CardContent>
          <ApiKeysForm statuses={statuses} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 text-sm text-muted-foreground">
          <p className="mb-2 flex items-center gap-2 font-medium text-foreground">
            <ShieldCheck className="h-4 w-4 text-green-600" /> How this works
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>A credential saved here is <strong>encrypted</strong> and stored in the database, then used for every invite — for you and your assistant coaches (they never see it).</li>
            <li>A value set here <strong>overrides</strong> the matching environment variable; clear it to fall back to the env var.</li>
            <li>Values are <strong>masked</strong> — the full value is never shown again after saving.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
