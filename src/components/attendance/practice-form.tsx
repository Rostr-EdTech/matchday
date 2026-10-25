"use client";

import { useState, useTransition } from "react";
import { Plus, Save } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createPractice } from "@/actions/attendance";

function toLocalDateInputValue(d: Date): string {
  const tzOffsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

export function AddPracticeButton({ teamId }: { teamId: string }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => toLocalDateInputValue(new Date()));
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();
  const { toast } = useToast();

  function submit() {
    start(async () => {
      const res = await createPractice(teamId, date, notes);
      // A successful create redirects server-side and never returns here.
      if (res && !res.ok) toast(res.error ?? "Couldn't start attendance.", "error");
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Take attendance
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New practice" className="max-w-md">
        <div className="space-y-4">
          <Field label="Date & time" required>
            <Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} required autoFocus />
          </Field>
          <Field label="Notes" hint="Optional — e.g. what the session covered.">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" disabled={pending} onClick={submit}>
              <Save className="h-4 w-4" /> {pending ? "Starting…" : "Start"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
