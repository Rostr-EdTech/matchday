"use client";

import { useState, useTransition } from "react";
import { UserPlus, X } from "lucide-react";
import { Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { assignAssistantCoach, unassignAssistantCoach } from "@/actions/teams";

type AssistantCoach = { id: string; name: string; email: string };

export function AssistantCoachAssigner({
  teamId,
  allAssistantCoaches,
  assignedIds,
}: {
  teamId: string;
  allAssistantCoaches: AssistantCoach[];
  assignedIds: string[];
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [pick, setPick] = useState("");
  const assigned = allAssistantCoaches.filter((a) => assignedIds.includes(a.id));
  const available = allAssistantCoaches.filter((a) => !assignedIds.includes(a.id));

  function add() {
    if (!pick) return;
    start(async () => {
      const res = await assignAssistantCoach(teamId, pick);
      if (res.ok) { toast("Assistant coach assigned."); setPick(""); }
      else toast(res.error ?? "Failed.", "error");
    });
  }
  function remove(id: string) {
    start(async () => {
      const res = await unassignAssistantCoach(teamId, id);
      if (!res.ok) toast(res.error ?? "Failed.", "error");
    });
  }

  return (
    <div className="space-y-3">
      {assigned.length === 0 ? (
        <p className="text-sm text-muted-foreground">No assistant coaches assigned yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {assigned.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5">
              <span className="min-w-0">
                <span className="block truncate text-sm text-foreground">{a.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{a.email}</span>
              </span>
              <button onClick={() => remove(a.id)} disabled={pending} className="text-muted-foreground hover:text-red-600" title="Unassign">
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 && (
        <div className="flex items-center gap-2">
          <Select value={pick} onChange={(e) => setPick(e.target.value)} className="h-9">
            <option value="">Add assistant coach…</option>
            {available.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
          <Button size="sm" onClick={add} disabled={pending || !pick}><UserPlus className="h-4 w-4" /> Add</Button>
        </div>
      )}
    </div>
  );
}
