// Pure playing-time math over MatchAppearance rows — no server-only imports,
// so it's independently testable (see scripts/roster-import-test.mts's
// precedent for a pure-function test). An appearance with endMinute===null
// means "still on through the end of that period" — clamped to
// periodMinutes here, not stored that way, so a coach never has to go back
// and manually close out a period that went as planned.

export type Appearance = { athleteId: string; periodIndex: number; startMinute: number; endMinute: number | null };

export function appearanceLength(a: Appearance, periodMinutes: number): number {
  const end = a.endMinute ?? periodMinutes;
  return Math.max(0, end - a.startMinute);
}

// Total minutes played per athlete across every period of a match.
export function totalMinutesByAthlete(appearances: Appearance[], periodMinutes: number): Map<string, number> {
  const totals = new Map<string, number>();
  for (const a of appearances) {
    totals.set(a.athleteId, (totals.get(a.athleteId) ?? 0) + appearanceLength(a, periodMinutes));
  }
  return totals;
}

// Athletes currently "on" at a given minute within a period — i.e. an open
// appearance (endMinute null) or one that hasn't ended yet by that minute.
export function onFieldAt(appearances: Appearance[], periodIndex: number, minute: number): Set<string> {
  const ids = new Set<string>();
  for (const a of appearances) {
    if (a.periodIndex !== periodIndex) continue;
    if (a.startMinute > minute) continue;
    if (a.endMinute !== null && a.endMinute <= minute) continue;
    ids.add(a.athleteId);
  }
  return ids;
}

// Athletes with an open (endMinute === null) appearance in a period — the
// "currently on" set the substitution form offers as "player off" options.
export function openAppearancesFor(appearances: Appearance[], periodIndex: number): Appearance[] {
  return appearances.filter((a) => a.periodIndex === periodIndex && a.endMinute === null);
}
