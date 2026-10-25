"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/field";

// Owner-only filters for the activity log: by athlete and by user. Updates
// the URL search params (server re-queries).
export function ActivityFilters({
  athletes,
  users,
  currentAthlete,
  currentUser,
}: {
  athletes: { id: string; displayName: string }[];
  users: { id: string; name: string }[];
  currentAthlete: string;
  currentUser: string;
}) {
  const router = useRouter();

  function update(next: { athlete?: string; user?: string }) {
    const p = new URLSearchParams();
    const athlete = next.athlete ?? currentAthlete;
    const user = next.user ?? currentUser;
    if (athlete) p.set("athlete", athlete);
    if (user) p.set("user", user);
    router.push(`/admin/activity${p.toString() ? `?${p}` : ""}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Athlete</span>
        <Select value={currentAthlete} onChange={(e) => update({ athlete: e.target.value })} className="h-9 w-auto">
          <option value="">All athletes</option>
          {athletes.map((a) => <option key={a.id} value={a.id}>{a.displayName}</option>)}
        </Select>
      </label>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>User</span>
        <Select value={currentUser} onChange={(e) => update({ user: e.target.value })} className="h-9 w-auto">
          <option value="">Everyone</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
      </label>
      {(currentAthlete || currentUser) && (
        <button onClick={() => router.push("/admin/activity")} className="text-xs text-primary hover:underline">Clear filters</button>
      )}
    </div>
  );
}
