"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Check, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { switchTeam } from "@/actions/teams";

export type SwitcherTeam = { id: string; name: string; ageGroup: string | null; archived: boolean };

// Header control for staff to pick the "current team" they're working on.
// Persisted per user.
export function TeamSwitcher({
  teams,
  currentTeamId,
}: {
  teams: SwitcherTeam[];
  currentTeamId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const current = teams.find((t) => t.id === currentTeamId) ?? teams[0];

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function pick(id: string) {
    setOpen(false);
    if (id === currentTeamId) return;
    start(() => { void switchTeam(id, pathname); });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className="flex max-w-[220px] items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm hover:bg-accent disabled:opacity-60"
        title="Switch team"
      >
        <Shield className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium text-foreground">{current?.name ?? "Pick team"}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 top-11 z-50 max-h-[60vh] w-64 overflow-auto rounded-xl border border-border bg-card py-1 shadow-lg">
          <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Working on</p>
          {teams.map((t) => (
            <button
              key={t.id}
              onClick={() => pick(t.id)}
              className={cn(
                "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent",
                t.id === currentTeamId ? "text-primary" : "text-foreground",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{t.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {t.ageGroup ?? "—"}{t.archived ? " · archived" : ""}
                </span>
              </span>
              {t.id === currentTeamId && <Check className="h-4 w-4 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
