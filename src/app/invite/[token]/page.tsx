import Link from "next/link";
import { Trophy } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getInviteInfo } from "@/actions/invite";
import { APP_NAME } from "@/lib/app-config";
import { InviteAcceptForm } from "./invite-accept-form";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // A signed-in user visiting an invite link is almost certainly the coach
  // testing the link, or an athlete already logged in elsewhere — either
  // way, don't let it silently attach to their current session.
  const currentUser = await getSessionUser();

  const info = await getInviteInfo(token);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
            <Trophy className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {info.valid ? `Set up ${info.athleteName}'s portal login` : "Portal invite"}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          {!info.valid ? (
            <p className="text-sm text-muted-foreground">{info.reason}</p>
          ) : currentUser ? (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                You&apos;re currently signed in as <span className="font-medium">{currentUser.email}</span>. Log out
                first, then reopen this link to set up {info.athleteName}&apos;s login.
              </p>
              <Link href="/login" className="text-primary hover:underline">
                Go to login
              </Link>
            </div>
          ) : (
            <InviteAcceptForm token={token} athleteName={info.athleteName} />
          )}
        </div>
      </div>
    </div>
  );
}
