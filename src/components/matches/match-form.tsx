"use client";

import { useState, useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Save } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createMatch, updateMatch } from "@/actions/matches";
import type { ActionResult } from "@/actions/types";

export type MatchFormValues = {
  opponent: string;
  date: string; // datetime-local value
  isHome: boolean;
  periodCount: number;
  periodMinutes: number;
  notes: string | null;
};

export function AddMatchButton({ teamId }: { teamId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Schedule match</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Schedule a match" className="max-w-lg">
        <MatchFields mode="create" teamId={teamId} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function SubmitBtn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}><Save className="h-4 w-4" /> {pending ? "Saving…" : label}</Button>;
}

export function MatchFields({
  mode,
  teamId,
  matchId,
  initial,
  onDone,
}: {
  mode: "create" | "edit";
  teamId?: string;
  matchId?: string;
  initial?: MatchFormValues;
  onDone?: () => void;
}) {
  const action = mode === "create" ? createMatch : updateMatch.bind(null, matchId!);
  const [state, formAction] = useActionState<ActionResult, FormData>(action, { ok: false });
  const { toast } = useToast();

  useEffect(() => {
    if (state.ok && mode === "edit") toast("Match saved.");
    else if (state.error) toast(state.error, "error");
    if (state.ok && mode === "edit") onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      {teamId && <input type="hidden" name="teamId" value={teamId} />}
      <Field label="Opponent" required error={state.fieldErrors?.opponent}>
        <Input name="opponent" defaultValue={initial?.opponent ?? ""} placeholder="Riverdale High" required autoFocus />
      </Field>
      <Field label="Date & time" required error={state.fieldErrors?.date}>
        <Input name="date" type="datetime-local" defaultValue={initial?.date ?? ""} required />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Home/Away">
          <label className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" name="isHome" defaultChecked={initial?.isHome ?? true} /> Home game
          </label>
        </Field>
        <Field label="Periods">
          <Input name="periodCount" type="number" min={1} max={8} defaultValue={initial?.periodCount ?? 2} />
        </Field>
        <Field label="Minutes/period">
          <Input name="periodMinutes" type="number" min={1} max={90} defaultValue={initial?.periodMinutes ?? 40} />
        </Field>
      </div>
      <Field label="Notes">
        <Textarea name="notes" rows={2} defaultValue={initial?.notes ?? ""} />
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        {onDone && <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>}
        <SubmitBtn label={mode === "create" ? "Schedule match" : "Save changes"} />
      </div>
    </form>
  );
}
