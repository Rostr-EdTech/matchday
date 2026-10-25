"use client";

import { useState, useTransition } from "react";
import { Link2, Copy, Check, RefreshCw, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { generateAssistantInviteLink, cancelAssistantInviteLink, sendAssistantInvite } from "@/actions/users";

type PendingInvite = { token: string; expiresAt: string } | null;

function inviteUrl(token: string): string {
  return typeof window === "undefined" ? `/invite/assistant/${token}` : `${window.location.origin}/invite/assistant/${token}`;
}

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

// Mirrors src/components/athletes/athlete-invite.tsx's shape, but for an
// assistant coach's account — which already exists (with a coach-issued
// temp password) rather than being created by accepting the invite. See
// AssistantInvite in prisma/schema.prisma.
export function AssistantInvite({
  userId,
  mustChangePassword,
  pendingInvite,
}: {
  userId: string;
  mustChangePassword: boolean;
  pendingInvite: PendingInvite;
}) {
  const { toast } = useToast();
  const [invite, setInvite] = useState(pendingInvite);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  function generate() {
    start(async () => {
      const res = await generateAssistantInviteLink(userId);
      if (res.ok) { setInvite({ token: res.token, expiresAt: res.expiresAt }); setCopied(false); }
      else toast(res.error, "error");
    });
  }
  function cancel() {
    start(async () => {
      const res = await cancelAssistantInviteLink(userId);
      if (res.ok) setInvite(null);
      else toast(res.error ?? "Failed.", "error");
    });
  }
  function sendEmail() {
    start(async () => {
      const res = await sendAssistantInvite(userId);
      if (res.ok) toast("Invite emailed.");
      else toast(res.error ?? "Couldn't send the invite email.", "error");
    });
  }
  function copy(token: string) {
    navigator.clipboard.writeText(inviteUrl(token));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!mustChangePassword) {
    return <p className="text-sm text-muted-foreground">This assistant has already set up their own password.</p>;
  }

  if (invite) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Share this link, or email it below — they&apos;ll set their own password. Expires in{" "}
          {daysUntil(invite.expiresAt)} day{daysUntil(invite.expiresAt) === 1 ? "" : "s"}.
        </p>
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted p-2">
          <code className="flex-1 truncate select-all text-sm">{inviteUrl(invite.token)}</code>
          <button onClick={() => copy(invite.token)} className="text-muted-foreground hover:text-foreground" title="Copy link">
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={sendEmail} disabled={pending}>
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
      <p className="text-sm text-muted-foreground">
        They can also just use the temp password shown when this account was created — this is an
        alternate way in that skips that step.
      </p>
      <Button onClick={generate} disabled={pending}>
        <Link2 className="h-4 w-4" /> {pending ? "Generating…" : "Generate invite link"}
      </Button>
    </div>
  );
}
