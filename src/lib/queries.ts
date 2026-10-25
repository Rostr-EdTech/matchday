import "server-only";

// An athlete-scope constraint for dashboard/report aggregates. Pass "ALL"
// (owner / whole roster) or a list of athlete ids (an assistant coach's
// accessible athletes). An empty list yields a match-nothing filter, never
// "all" — the same shape `accessibleAthleteIds()` (src/lib/access.ts) returns.
export type StatScope = "ALL" | string[];
