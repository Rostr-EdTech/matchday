import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { AttentionAthlete } from "@/lib/dashboard";

// A computed, non-authoritative "who should I check on" list — see
// src/lib/dashboard.ts::athletesNeedingAttention for how an athlete lands
// here. Never hides or overrides the coach's own judgment; just surfaces it
// prominently.
export function AttentionList({ athletes }: { athletes: AttentionAthlete[] }) {
  if (athletes.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing flagged right now.</p>;
  }
  return (
    <ul className="space-y-2">
      {athletes.map((a) => (
        <li key={a.id}>
          <Link
            href={`/admin/athletes/${a.id}`}
            className="flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 hover:bg-amber-50"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">{a.displayName} {a.teamName && <span className="font-normal text-muted-foreground">· {a.teamName}</span>}</span>
              <span className="block text-xs text-muted-foreground">{a.reason}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
