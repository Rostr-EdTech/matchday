"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, XCircle, RotateCcw, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/field";
import { ConfirmModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { BADGE_COLORS, labelOf, INJURY_STATUSES, nextAttendanceStatus } from "@/lib/enums";
import { setAttendanceStatus, markAllPresent, updatePracticeNotes, deletePractice } from "@/actions/attendance";

type Athlete = { id: string; displayName: string; jerseyNumber: number | null; primaryPosition: string | null; injuryStatus: string };
type Row = { athlete: Athlete; status: string };

const STATUS_STYLE: Record<string, { icon: typeof CheckCircle2; classes: string; label: string }> = {
  PRESENT: { icon: CheckCircle2, classes: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20", label: "Present" },
  LATE: { icon: Clock, classes: "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20", label: "Late" },
  ABSENT: { icon: XCircle, classes: "border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20", label: "Absent" },
};

export function AttendanceList({ practiceId, notes, rows }: { practiceId: string; notes: string | null; rows: Row[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [localRows, setLocalRows] = useState(rows);
  const [notesValue, setNotesValue] = useState(notes ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const counts = useMemo(() => {
    const c = { present: 0, late: 0, absent: 0 };
    for (const r of localRows) {
      if (r.status === "PRESENT") c.present++;
      else if (r.status === "LATE") c.late++;
      else if (r.status === "ABSENT") c.absent++;
    }
    return c;
  }, [localRows]);

  function toggle(athleteId: string, currentStatus: string) {
    const next = nextAttendanceStatus(currentStatus);
    // Optimistic: flip immediately, revert on failure.
    setLocalRows((prev) => prev.map((r) => (r.athlete.id === athleteId ? { ...r, status: next } : r)));
    start(async () => {
      const res = await setAttendanceStatus(practiceId, athleteId, next);
      if (!res.ok) {
        setLocalRows((prev) => prev.map((r) => (r.athlete.id === athleteId ? { ...r, status: currentStatus } : r)));
        toast(res.error ?? "Couldn't update attendance.", "error");
      }
    });
  }

  function resetAllPresent() {
    setLocalRows((prev) => prev.map((r) => ({ ...r, status: "PRESENT" })));
    start(async () => {
      const res = await markAllPresent(practiceId);
      if (!res.ok) toast(res.error ?? "Couldn't reset attendance.", "error");
    });
  }

  function saveNotes() {
    start(async () => {
      const res = await updatePracticeNotes(practiceId, notesValue);
      if (!res.ok) toast(res.error ?? "Couldn't save notes.", "error");
    });
  }

  function confirmDeletePractice() {
    start(async () => {
      const res = await deletePractice(practiceId);
      if (!res.ok) toast(res.error ?? "Couldn't delete practice.", "error");
      else router.push("/teams/attendance");
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-2">
            <Badge color={BADGE_COLORS.PRESENT}>{counts.present} present</Badge>
            <Badge color={BADGE_COLORS.LATE}>{counts.late} late</Badge>
            <Badge color={BADGE_COLORS.ABSENT}>{counts.absent} absent</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={resetAllPresent}>
              <RotateCcw className="h-3.5 w-3.5" /> Mark all present
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="divide-y divide-border py-0">
          {localRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No active roster athletes on this team yet.</p>
          ) : (
            localRows.map((r) => {
              const style = STATUS_STYLE[r.status] ?? STATUS_STYLE.PRESENT;
              const Icon = style.icon;
              return (
                <div key={r.athlete.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                      {r.athlete.jerseyNumber ?? "–"}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{r.athlete.displayName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.athlete.primaryPosition ?? "—"}
                        {r.athlete.injuryStatus !== "HEALTHY" && (
                          <span className="ml-1.5">
                            <Badge color={BADGE_COLORS[r.athlete.injuryStatus]}>{labelOf(INJURY_STATUSES, r.athlete.injuryStatus)}</Badge>
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => toggle(r.athlete.id, r.status)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-60 ${style.classes}`}
                    title="Click to cycle: Present → Late → Absent"
                  >
                    <Icon className="h-3.5 w-3.5" /> {style.label}
                  </button>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
          <Textarea
            rows={2}
            value={notesValue}
            onChange={(e) => setNotesValue(e.target.value)}
            onBlur={saveNotes}
            placeholder="What did this session cover?"
          />
        </CardContent>
      </Card>

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          confirmDeletePractice();
        }}
        title="Delete this practice?"
        message="This removes the practice and all of its attendance records. This can't be undone."
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
