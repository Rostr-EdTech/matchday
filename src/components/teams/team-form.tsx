"use client";

import { useState, useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Save } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createTeam, updateTeam } from "@/actions/teams";
import type { ActionResult } from "@/actions/types";

export type TeamFormValues = {
  name: string;
  ageGroup: string | null;
  season: string | null;
};

// Owner-only "Add team" button that opens the create modal.
export function AddTeamButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add team</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add a team" className="max-w-lg">
        <TeamFields mode="create" onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function SubmitBtn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}><Save className="h-4 w-4" /> {pending ? "Saving…" : label}</Button>;
}

export function TeamFields({
  mode,
  teamId,
  initial,
  onDone,
}: {
  mode: "create" | "edit";
  teamId?: string;
  initial?: TeamFormValues;
  onDone?: () => void;
}) {
  const action = mode === "create" ? createTeam : updateTeam.bind(null, teamId!);
  const [state, formAction] = useActionState<ActionResult, FormData>(action, { ok: false });
  const { toast } = useToast();

  useEffect(() => {
    if (state.ok && mode === "edit") toast("Team saved.");
    else if (state.error) toast(state.error, "error");
    if (state.ok) onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Team name" required error={state.fieldErrors?.name}>
        <Input name="name" defaultValue={initial?.name ?? ""} placeholder="Varsity Boys" required autoFocus />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Age group">
          <Input name="ageGroup" defaultValue={initial?.ageGroup ?? ""} placeholder="U16" />
        </Field>
        <Field label="Season">
          <Input name="season" defaultValue={initial?.season ?? ""} placeholder="2026 Fall" />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        {onDone && <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>}
        <SubmitBtn label={mode === "create" ? "Create team" : "Save changes"} />
      </div>
    </form>
  );
}
