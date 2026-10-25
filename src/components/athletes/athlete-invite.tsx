"use client";

import { useState, useTransition } from "react";
import { Link2, Copy, Check, ShieldOff, ShieldCheck, RefreshCw, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  generateAthleteInviteLink, cancelAthleteInvite, revokeAthleteLogin, reinstateAthleteLogin,
  resetAthleteLogin, sendAthleteInviteEmail,
} from "@/actions/athletes";

type LinkedUser = { id: string; name: string; email: string; active: boolean } | null;
type PendingInvite = { token: string; expiresAt: string } | null;

function inviteUrl(token: string): string {
  return typeof window === "undefined" ? `/invite/${token}` : `${window.location.origin}/invite/${token}`;
}

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

export function AthleteInvite({
  athleteId,
  athleteEmail,
  linkedUser,
  pendingInvite,
}: {
  athleteId: string;
  athleteEmail: string | null;
  linkedUser: LinkedUser;
  pendingInvite: PendingInvite;
}) {
  const { toast } = useToast();
  const [invite, setInvite] = useState(pendingInvite);
  // Locally tracks a resetAthleteLogin() success — the old login is
  // detached server-side, but `linkedUser` is still the prop from before
  // that happened until the page next revalidates, so this makes the UI
  // fall through to the invite-pending view immediately instead of waiting.
  const [reset, setReset] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pending, start] = useTransition();

  function sendEmail() {
    start(async () => {
      const res = await sendAthleteInviteEmail(athleteId);
      if (res.ok) toast("Invite emailed.");
      else toast(res.error ?? "Couldn't send the invite email.", "error");
    });
  }

  function generate() {
    start(async () => {
      const res = await generateAthleteInviteLink(athleteId);
      if (res.ok) {
        setInvite({ token: res.token, expiresAt: res.expiresAt });
        setCopied(false);
      } else {
        toast(res.error, "error");
      }
    });
  }

  function cancel() {
    start(async () => {
      const res = await cancelAthleteInvite(athleteId);
      if (res.ok) setInvite(null);
      else toast(res.error ?? "Failed.", "error");
    });
  }

  function revoke() {
    setConfirmRevoke(false);
    start(async () => {
      const res = await revokeAthleteLogin(athleteId);
      if (res.ok) toast("Portal login revoked.");
      else toast(res.error ?? "Failed.", "error");
    });
  }

  function reinstate() {
    start(async () => {
      const res = await reinstateAthleteLogin(athleteId);
      if (res.ok) toast("Portal login reinstated.");
      else toast(res.error ?? "Failed.", "error");
    });
  }

  function doReset() {
    setConfirmReset(false);
    start(async () => {
      const res = await resetAthleteLogin(athleteId);
      if (res.ok) {
        setReset(true);
        setInvite({ token: res.token, expiresAt: res.expiresAt });
        toast("Old login detached — a new invite link is ready.");
      } else {
        toast(res.error, "error");
      }
    });
  }

  function copy(token: string) {
    navigator.clipboard.writeText(inviteUrl(token));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (linkedUser && !reset) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-border p-2.5">
          <p className="truncate text-sm text-foreground">{linkedUser.name}</p>
          <p className="truncate text-xs text-muted-foreground">{linkedUser.email}</p>
          <p className="mt-1 text-xs">{linkedUser.active ? <span className="text-green-700">Portal active</span> : <span className="text-muted-foreground">Portal revoked</span>}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {linkedUser.active ? (
            <Button variant="outline" size="sm" onClick={() => setConfirmRevoke(true)} disabled={pending}>
              <ShieldOff className="h-4 w-4" /> Revoke access
            </Button>
          ) : (
            <>
              <Button size="sm" onClick={reinstate} disabled={pending} title="Let them sign back in with the same email/password">
                <ShieldCheck className="h-4 w-4" /> {pending ? "Reinstating…" : "Reinstate access"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmReset(true)} disabled={pending} title="Detach the old login for good and send a fresh invite link instead">
                <RefreshCw className="h-4 w-4" /> Send new invite
              </Button>
            </>
          )}
        </div>
        <ConfirmModal
          open={confirmRevoke}
          onClose={() => setConfirmRevoke(false)}
          onConfirm={revoke}
          title="Revoke portal access?"
          message="The athlete will be logged out and can no longer sign in. Their data is kept."
          confirmLabel="Revoke"
          danger
        />
        <ConfirmModal
          open={confirmReset}
          onClose={() => setConfirmReset(false)}
          onConfirm={doReset}
          title="Send a new invite instead?"
          message="This permanently detaches their old login (it can never be reinstated after this) and generates a fresh invite link so they set up a brand new email and password."
          confirmLabel="Detach & send new invite"
          danger
        />
      </div>
    );
  }

  if (invite) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Share this link with the athlete — they&apos;ll set their own email and password. Expires in{" "}
          {daysUntil(invite.expiresAt)} day{daysUntil(invite.expiresAt) === 1 ? "" : "s"}.
        </p>
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted p-2">
          <code className="flex-1 truncate select-all text-sm">{inviteUrl(invite.token)}</code>
          <button onClick={() => copy(invite.token)} className="text-muted-foreground hover:text-foreground" title="Copy link">
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={sendEmail} disabled={pending || !athleteEmail} title={athleteEmail ? "Email this link to the athlete" : "Add an email address for this athlete first"}>
            <Send className="h-3.5 w-3.5" /> {pending ? "Sending…" : "Email invite"}
          </Button>
          <Button variant="outline" size="sm" onClick={generate} disabled={pending}>
            <RefreshCw className="h-3.5 w-3.5" /> Regenerate
          </Button>
          <Button variant="outline" size="sm" onClick={cancel} disabled={pending}>
            <X className="h-3.5 w-3.5" /> Cancel invite
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Give this athlete access to a limited portal to see their own info.</p>
      <Button onClick={generate} disabled={pending}>
        <Link2 className="h-4 w-4" /> {pending ? "Generating…" : "Generate invite link"}
      </Button>
    </div>
  );
}
