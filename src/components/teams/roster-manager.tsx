"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { UserPlus, X, Upload, Send } from "lucide-react";
import { Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { addToRoster, removeFromRoster, sendTeamInvites } from "@/actions/teams";
import { BADGE_COLORS, labelOf, INJURY_STATUSES } from "@/lib/enums";

type Rostered = { id: string; displayName: string; jerseyNumber: number | null; primaryPosition: string | null; injuryStatus: string };
type AthleteOpt = { id: string; displayName: string };

export function RosterManager({
  teamId,
  rostered,
  unrosteredAthletes,
}: {
  teamId: string;
  rostered: Rostered[];
  unrosteredAthletes: AthleteOpt[];
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [pick, setPick] = useState("");

  function add() {
    if (!pick) return;
    start(async () => {
      const res = await addToRoster(teamId, pick);
      if (res.ok) { toast("Athlete added to roster."); setPick(""); }
      else toast(res.error ?? "Failed.", "error");
    });
  }
  function remove(id: string) {
    start(async () => {
      const res = await removeFromRoster(teamId, id);
      if (!res.ok) toast(res.error ?? "Failed.", "error");
    });
  }
  function sendInvites() {
    start(async () => {
      const res = await sendTeamInvites(teamId);
      if (!res.ok) { toast(res.error, "error"); return; }
      const parts: string[] = [];
      if (res.sent) parts.push(`Sent ${res.sent} invite${res.sent === 1 ? "" : "s"}`);
      if (res.skippedAlreadyLinked) parts.push(`${res.skippedAlreadyLinked} already had a login`);
      if (res.skippedNoEmail) parts.push(`${res.skippedNoEmail} had no email on file`);
      if (res.failed) parts.push(`${res.failed} failed to send${res.firstError ? ` (${res.firstError})` : ""}`);
      toast(parts.length ? parts.join(" · ") : "No athletes needed an invite.", res.failed ? "error" : "success");
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{rostered.length} athlete{rostered.length === 1 ? "" : "s"}</p>
        <div className="flex items-center gap-2">
          {rostered.length > 0 && (
            <Button variant="outline" size="sm" onClick={sendInvites} disabled={pending} title="Emails a portal invite link to every rostered athlete with an email on file who doesn't already have a login">
              <Send className="h-3.5 w-3.5" /> {pending ? "Sending…" : "Send invite links to all"}
            </Button>
          )}
          <Link href={`/admin/teams/${teamId}/roster/import`}>
            <Button variant="outline" size="sm"><Upload className="h-3.5 w-3.5" /> Import roster</Button>
          </Link>
        </div>
      </div>

      {rostered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No athletes rostered yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {rostered.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                {a.jerseyNumber != null && <span className="w-5 shrink-0 text-center text-xs font-semibold text-muted-foreground">{a.jerseyNumber}</span>}
                <span className="truncate text-sm text-foreground">{a.displayName}</span>
                {a.primaryPosition && <Badge color="bg-muted text-foreground border-border">{a.primaryPosition}</Badge>}
                {a.injuryStatus !== "HEALTHY" && (
                  <Badge color={BADGE_COLORS[a.injuryStatus]}>{labelOf(INJURY_STATUSES, a.injuryStatus)}</Badge>
                )}
              </span>
              <button onClick={() => remove(a.id)} disabled={pending} className="text-muted-foreground hover:text-red-600" title="Remove from roster">
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {unrosteredAthletes.length > 0 && (
        <div className="flex items-center gap-2">
          <Select value={pick} onChange={(e) => setPick(e.target.value)} className="h-9">
            <option value="">Add existing athlete…</option>
            {unrosteredAthletes.map((a) => <option key={a.id} value={a.id}>{a.displayName}</option>)}
          </Select>
          <Button size="sm" onClick={add} disabled={pending || !pick}><UserPlus className="h-4 w-4" /> Add</Button>
        </div>
      )}
    </div>
  );
}
