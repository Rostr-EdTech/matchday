"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Trash2, Copy } from "lucide-react";
import { Select, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { totalMinutesByAthlete, openAppearancesFor, type Appearance } from "@/lib/minutes";
import {
  seedPeriodFromLineup, carryOverPeriod, clearPeriod, makeSubstitution, removeAppearance,
} from "@/actions/matches";

type Athlete = { id: string; displayName: string; jerseyNumber: number | null; primaryPosition: string | null };
type MatchAppearanceRow = Appearance & { id: string; slotKey: string | null };
type LineupOpt = { id: string; name: string; formation: { name: string } | null };

function periodLabel(count: number, index: number): string {
  if (count === 2) return index === 0 ? "1st Half" : "2nd Half";
  if (count === 4) return `Q${index + 1}`;
  return `Period ${index + 1}`;
}

export function Planner({
  matchId,
  periodCount,
  periodMinutes,
  roster,
  appearances,
  lineups,
}: {
  matchId: string;
  periodCount: number;
  periodMinutes: number;
  roster: Athlete[];
  appearances: MatchAppearanceRow[];
  lineups: LineupOpt[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [period, setPeriod] = useState(0);
  const [offId, setOffId] = useState("");
  const [onId, setOnId] = useState("");
  const [minute, setMinute] = useState(0);
  const [seedLineupId, setSeedLineupId] = useState(lineups[0]?.id ?? "");

  const athleteById = useMemo(() => new Map(roster.map((a) => [a.id, a])), [roster]);
  const periodAppearances = appearances.filter((a) => a.periodIndex === period);
  const onField = openAppearancesFor(periodAppearances, period);
  const onFieldIds = new Set(onField.map((a) => a.athleteId));
  const bench = roster.filter((a) => !onFieldIds.has(a.id));

  function refresh() { router.refresh(); }

  function seed() {
    if (!seedLineupId) return;
    start(async () => {
      const res = await seedPeriodFromLineup(matchId, period, seedLineupId);
      if (!res.ok) toast(res.error ?? "Failed.", "error");
      refresh();
    });
  }
  function carryOver() {
    start(async () => {
      const res = await carryOverPeriod(matchId, period - 1, period);
      if (!res.ok) toast(res.error ?? "Failed.", "error");
      refresh();
    });
  }
  function clear() {
    start(async () => {
      await clearPeriod(matchId, period);
      refresh();
    });
  }
  function submitSub() {
    if (!onId) return;
    start(async () => {
      const res = await makeSubstitution(matchId, period, minute, offId || null, onId);
      if (res.ok) { setOffId(""); setOnId(""); toast("Substitution added."); }
      else toast(res.error ?? "Failed.", "error");
      refresh();
    });
  }
  function remove(id: string) {
    start(async () => {
      await removeAppearance(id);
      refresh();
    });
  }

  const totals = totalMinutesByAthlete(appearances, periodMinutes);
  const totalsSorted = roster
    .map((a) => ({ athlete: a, minutes: totals.get(a.id) ?? 0 }))
    .sort((a, b) => a.minutes - b.minutes);
  const matchMinutes = periodCount * periodMinutes;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: periodCount }).map((_, i) => (
          <button
            key={i}
            onClick={() => setPeriod(i)}
            className={`rounded-md border px-3 py-1.5 text-sm ${i === period ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"}`}
          >
            {periodLabel(periodCount, i)}
          </button>
        ))}
      </div>

      {periodAppearances.length === 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-4">
          <span className="text-sm text-muted-foreground">Start {periodLabel(periodCount, period)} from:</span>
          {lineups.length > 0 && (
            <>
              <Select value={seedLineupId} onChange={(e) => setSeedLineupId(e.target.value)} className="h-9 w-auto">
                {lineups.map((l) => <option key={l.id} value={l.id}>{l.name}{l.formation ? ` (${l.formation.name})` : ""}</option>)}
              </Select>
              <Button size="sm" onClick={seed} disabled={pending}>Use this lineup</Button>
            </>
          )}
          {period > 0 && <Button size="sm" variant="outline" onClick={carryOver} disabled={pending}><Copy className="h-3.5 w-3.5" /> Same as previous period</Button>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{onField.length} on the field, {bench.length} on the bench</p>
            <Button size="sm" variant="ghost" onClick={clear} disabled={pending}><Trash2 className="h-3.5 w-3.5 text-red-500" /> Clear period</Button>
          </div>

          {/* Substitution form */}
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Player off</label>
              <Select value={offId} onChange={(e) => setOffId(e.target.value)} className="h-9 w-40">
                <option value="">— none —</option>
                {onField.map((a) => <option key={a.athleteId} value={a.athleteId}>{athleteById.get(a.athleteId)?.displayName ?? "?"}</option>)}
              </Select>
            </div>
            <ArrowRightLeft className="mb-2 h-4 w-4 text-muted-foreground" />
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Player on</label>
              <Select value={onId} onChange={(e) => setOnId(e.target.value)} className="h-9 w-40">
                <option value="">Pick athlete…</option>
                {bench.map((a) => <option key={a.id} value={a.id}>{a.displayName}</option>)}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Minute</label>
              <Input type="number" min={0} max={periodMinutes} value={minute} onChange={(e) => setMinute(Number(e.target.value))} className="h-9 w-20" />
            </div>
            <Button size="sm" onClick={submitSub} disabled={pending || !onId}>Make substitution</Button>
          </div>

          {/* Timeline */}
          <div className="space-y-1.5">
            {[...new Set(periodAppearances.map((a) => a.athleteId))].map((athleteId) => {
              const athlete = athleteById.get(athleteId);
              const rows = periodAppearances.filter((a) => a.athleteId === athleteId);
              return (
                <div key={athleteId} className="flex items-center gap-2">
                  <span className="w-32 shrink-0 truncate text-xs text-muted-foreground">{athlete?.displayName ?? "?"}</span>
                  <div className="relative h-4 flex-1 overflow-hidden rounded bg-muted">
                    {rows.map((r) => {
                      const end = r.endMinute ?? periodMinutes;
                      const left = (r.startMinute / periodMinutes) * 100;
                      const width = ((end - r.startMinute) / periodMinutes) * 100;
                      return (
                        <div
                          key={r.id}
                          className="absolute top-0 h-full bg-primary/70"
                          style={{ left: `${left}%`, width: `${width}%` }}
                          title={`${r.startMinute}–${r.endMinute ?? periodMinutes} min`}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Chronological log */}
          <ul className="space-y-1 text-xs text-muted-foreground">
            {periodAppearances.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded border border-border/60 px-2 py-1">
                <span>{athleteById.get(a.athleteId)?.displayName ?? "?"} — {a.startMinute}–{a.endMinute ?? periodMinutes} min{a.slotKey ? ` (${a.slotKey.toUpperCase()})` : ""}</span>
                <button onClick={() => remove(a.id)} className="text-muted-foreground hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Totals */}
      <div className="rounded-lg border border-border p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total minutes ({matchMinutes} available)</p>
        <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {totalsSorted.map(({ athlete, minutes }) => (
            <li key={athlete.id} className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-xs ${minutes === 0 ? "bg-amber-50 text-amber-700" : "text-muted-foreground"}`}>
              <span className="truncate">{athlete.displayName}</span>
              <span className="font-medium">{minutes}&apos;</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
