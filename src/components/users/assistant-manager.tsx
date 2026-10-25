"use client";

import { useState, useActionState, useEffect, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { UserPlus, Copy, Check, Globe, Power, Link2, Send } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { createUser, setAllClientsAccess, setUserActive, sendAssistantInvites, type CreateUserResult } from "@/actions/users";
import { AssistantInvite } from "@/components/users/assistant-invite";

type AssistantRow = {
  id: string; name: string; email: string; active: boolean;
  allClientsAccess: boolean; pendingReset: boolean; teamIds: string[];
  pendingInvite: { token: string; expiresAt: string } | null;
};
type TeamOpt = { id: string; name: string };

export function AssistantManager({
  assistants,
  teams,
}: {
  assistants: AssistantRow[];
  teams: TeamOpt[];
  currentUserId: string;
}) {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [inviteFor, setInviteFor] = useState<AssistantRow | null>(null);
  const [pending, start] = useTransition();
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const pendingCount = assistants.filter((a) => a.pendingReset && a.active).length;

  function toggleAllAccess(id: string, value: boolean) {
    start(async () => {
      const res = await setAllClientsAccess(id, value);
      if (!res.ok) toast(res.error ?? "Failed.", "error");
    });
  }
  function toggleActive(id: string, value: boolean) {
    start(async () => {
      const res = await setUserActive(id, value);
      if (!res.ok) toast(res.error ?? "Failed.", "error");
    });
  }
  function sendAllInvites() {
    start(async () => {
      const res = await sendAssistantInvites();
      if (!res.ok) { toast(res.error, "error"); return; }
      const parts: string[] = [];
      if (res.sent) parts.push(`Sent ${res.sent} invite${res.sent === 1 ? "" : "s"}`);
      if (res.skippedAlreadySetUp) parts.push(`${res.skippedAlreadySetUp} already set up`);
      if (res.failed) parts.push(`${res.failed} failed to send${res.firstError ? ` (${res.firstError})` : ""}`);
      toast(parts.length ? parts.join(" · ") : "No assistants needed an invite.", res.failed ? "error" : "success");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        {pendingCount > 0 && (
          <Button variant="outline" onClick={sendAllInvites} disabled={pending} title="Emails a self-service invite link to every active assistant who hasn't set up their own password yet">
            <Send className="h-4 w-4" /> {pending ? "Sending…" : "Send invite links to all pending"}
          </Button>
        )}
        <Button onClick={() => setAddOpen(true)}><UserPlus className="h-4 w-4" /> Add assistant</Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Teams</TH>
              <TH>All-team access</TH>
              <TH>Status</TH>
              <TH></TH>
            </tr>
          </THead>
          <tbody>
            {assistants.map((a) => (
              <TR key={a.id}>
                <TD>
                  <div className="font-medium text-foreground">{a.name}</div>
                  <div className="text-xs text-muted-foreground">{a.email}{a.pendingReset ? " · pending first login" : ""}</div>
                </TD>
                <TD>
                  {a.allClientsAccess ? (
                    <span className="text-xs text-muted-foreground">All teams</span>
                  ) : a.teamIds.length === 0 ? (
                    <span className="text-xs text-amber-600">None assigned</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {a.teamIds.slice(0, 3).map((tid) => (
                        <Badge key={tid} color="bg-muted text-muted-foreground border-border">{teamName.get(tid) ?? "?"}</Badge>
                      ))}
                      {a.teamIds.length > 3 && <span className="text-xs text-muted-foreground">+{a.teamIds.length - 3}</span>}
                    </div>
                  )}
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Team assignment management is coming soon.
                  </div>
                </TD>
                <TD>
                  <button
                    onClick={() => toggleAllAccess(a.id, !a.allClientsAccess)}
                    disabled={pending}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${a.allClientsAccess ? "border-teal-200 bg-teal-50 text-teal-700" : "border-border text-muted-foreground hover:bg-accent"}`}
                    title="Grant/revoke access to every team"
                  >
                    <Globe className="h-3.5 w-3.5" /> {a.allClientsAccess ? "On" : "Off"}
                  </button>
                </TD>
                <TD>
                  <button
                    onClick={() => toggleActive(a.id, !a.active)}
                    disabled={pending}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${a.active ? "border-green-200 bg-green-50 text-green-700" : "border-border bg-muted text-muted-foreground"}`}
                  >
                    <Power className="h-3.5 w-3.5" /> {a.active ? "Active" : "Inactive"}
                  </button>
                </TD>
                <TD>
                  {a.pendingReset && (
                    <button
                      onClick={() => setInviteFor(a)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                      title="Get a self-service invite link for this assistant"
                    >
                      <Link2 className="h-3.5 w-3.5" /> Invite
                    </button>
                  )}
                </TD>
              </TR>
            ))}
            {assistants.length === 0 && (
              <TR><TD className="py-6 text-center text-sm text-muted-foreground" >No assistants yet. Add one to get started.</TD></TR>
            )}
          </tbody>
        </Table>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add an assistant">
        <AddAssistantForm onDone={() => setAddOpen(false)} />
      </Modal>

      <Modal open={!!inviteFor} onClose={() => setInviteFor(null)} title={inviteFor ? `Invite ${inviteFor.name}` : "Invite"}>
        {inviteFor && (
          <AssistantInvite userId={inviteFor.id} mustChangePassword={inviteFor.pendingReset} pendingInvite={inviteFor.pendingInvite} />
        )}
      </Modal>
    </div>
  );
}

function SubmitBtn() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}><UserPlus className="h-4 w-4" /> {pending ? "Creating…" : "Create assistant"}</Button>;
}

function AddAssistantForm({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [state, formAction] = useActionState<CreateUserResult, FormData>(createUser, { ok: false });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (state.error) toast(state.error, "error");
  }, [state, toast]);

  if (state.ok && state.tempPassword) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Assistant created. Share this one-time password with them:</p>
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted p-2">
          <code className="flex-1 select-all text-sm">{state.tempPassword}</code>
          <button onClick={() => { navigator.clipboard.writeText(state.tempPassword!); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="text-muted-foreground hover:text-foreground">
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Team assignment management is coming soon.</p>
        <div className="flex justify-end pt-1"><Button onClick={onDone}>Done</Button></div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="role" value="ASSISTANT" />
      <Field label="Name" required error={state.fieldErrors?.name}>
        <Input name="name" required autoFocus />
      </Field>
      <Field label="Email (login)" required error={state.fieldErrors?.email}>
        <Input name="email" type="email" required />
      </Field>
      <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
        A one-time password is generated on screen. They&apos;ll set their own on first login.
      </p>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <SubmitBtn />
      </div>
    </form>
  );
}
