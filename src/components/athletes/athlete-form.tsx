"use client";

import { useState, useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Save } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea, Select, EnumSelect } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createAthlete, updateAthlete } from "@/actions/athletes";
import { SOCCER_POSITIONS, DOMINANT_FOOT, INJURY_STATUSES } from "@/lib/enums";
import type { ActionResult } from "@/actions/types";

export type AthleteFormValues = {
  displayName: string;
  dateOfBirth: string | null; // YYYY-MM-DD
  jerseyNumber: number | null;
  primaryPosition: string | null;
  secondaryPositions: string[]; // decoded from the JSON column
  dominantFoot: string | null;
  status: string;
  injuryStatus: string;
  injuryNote: string | null;
  notes: string | null;
  email: string | null;
};

// Owner-only "Add athlete" button that opens the create modal.
export function AddAthleteButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add athlete</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add an athlete" className="max-w-2xl">
        <AthleteFields mode="create" onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function SubmitBtn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}><Save className="h-4 w-4" /> {pending ? "Saving…" : label}</Button>;
}

// The shared field set, used by both the create modal and the edit page.
export function AthleteFields({
  mode,
  athleteId,
  initial,
  onDone,
}: {
  mode: "create" | "edit";
  athleteId?: string;
  initial?: AthleteFormValues;
  onDone?: () => void;
}) {
  const action = mode === "create" ? createAthlete : updateAthlete.bind(null, athleteId!);
  const [state, formAction] = useActionState<ActionResult, FormData>(action, { ok: false });
  const { toast } = useToast();
  const [secondary, setSecondary] = useState<string[]>(initial?.secondaryPositions ?? []);

  useEffect(() => {
    if (state.ok && mode === "edit") toast("Athlete saved.");
    else if (state.error) toast(state.error, "error");
    if (state.ok) onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function toggleSecondary(value: string) {
    setSecondary((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="secondaryPositions" value={JSON.stringify(secondary)} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Athlete name" required error={state.fieldErrors?.displayName}>
          <Input name="displayName" defaultValue={initial?.displayName ?? ""} required autoFocus />
        </Field>
        <Field label="Jersey #">
          <Input name="jerseyNumber" type="number" min={0} max={999} defaultValue={initial?.jerseyNumber ?? ""} placeholder="7" />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Date of birth">
          <Input name="dateOfBirth" type="date" defaultValue={initial?.dateOfBirth ?? ""} />
        </Field>
        <Field label="Primary position">
          <EnumSelect name="primaryPosition" options={SOCCER_POSITIONS} includeBlank defaultValue={initial?.primaryPosition ?? ""} />
        </Field>
        <Field label="Dominant foot">
          <EnumSelect name="dominantFoot" options={DOMINANT_FOOT} includeBlank defaultValue={initial?.dominantFoot ?? ""} />
        </Field>
      </div>

      <Field label="Secondary positions" hint="Other positions this athlete can cover.">
        <div className="flex flex-wrap gap-1.5">
          {SOCCER_POSITIONS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => toggleSecondary(p.value)}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                secondary.includes(p.value)
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-border"
              }`}
            >
              {p.value}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Roster status">
          <Select name="status" defaultValue={initial?.status ?? "ACTIVE"}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ARCHIVED">Archived</option>
          </Select>
        </Field>
        <Field label="Email" hint="Used for roster-import dedupe and portal invites." error={state.fieldErrors?.email}>
          <Input name="email" type="email" defaultValue={initial?.email ?? ""} placeholder="athlete@example.com" />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Injury status">
          <EnumSelect name="injuryStatus" options={INJURY_STATUSES} defaultValue={initial?.injuryStatus ?? "HEALTHY"} />
        </Field>
        <Field label="Injury note">
          <Input name="injuryNote" defaultValue={initial?.injuryNote ?? ""} placeholder="e.g. Ankle — expected back in 2 weeks" />
        </Field>
      </div>

      <Field label="Coach notes (private)" hint="Only staff see these.">
        <Textarea name="notes" rows={2} defaultValue={initial?.notes ?? ""} />
      </Field>

      <div className="flex justify-end gap-2 pt-1">
        {onDone && <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>}
        <SubmitBtn label={mode === "create" ? "Create athlete" : "Save changes"} />
      </div>
    </form>
  );
}
