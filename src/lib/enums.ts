// Centralised "enum" values. Because SQLite doesn't support Prisma enums, the
// database stores these as plain strings; this file is the single source of
// truth for the allowed values, their display labels, and badge colours.

export type Option = { value: string; label: string };

function opts(pairs: [string, string][]): Option[] {
  return pairs.map(([value, label]) => ({ value, label }));
}

// OWNER = Head Coach, ASSISTANT = Assistant Coach, CLIENT = Athlete. Role
// values kept literal per the fork convention (see CONTEXT.md); only labels
// change.
export const ROLES = ["OWNER", "ASSISTANT", "CLIENT"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<string, string> = {
  OWNER: "Head Coach",
  ADMIN: "Head Coach", // legacy alias
  ASSISTANT: "Assistant Coach",
  CLIENT: "Athlete",
};

// Athlete roster-membership lifecycle status.
export const ATHLETE_STATUSES = opts([
  ["ACTIVE", "Active"],
  ["INACTIVE", "Inactive"],
  ["ARCHIVED", "Archived"],
]);

// Athlete availability — manually set/cleared by a coach or trainer,
// separate from `status` (roster membership). This is the roster's
// at-a-glance signal, replacing class_copilot's generic Student.flag with
// something coaching-specific.
export const INJURY_STATUSES = opts([
  ["HEALTHY", "Healthy"],
  ["QUESTIONABLE", "Questionable"],
  ["OUT", "Out"],
]);

export const DOMINANT_FOOT = opts([
  ["LEFT", "Left"],
  ["RIGHT", "Right"],
  ["BOTH", "Both"],
]);

// Soccer position vocabulary — Athlete.primaryPosition and the JSON-encoded
// Athlete.secondaryPositions both draw from this list, as does a Formation
// slot's positionLabel. Grouped loosely back-to-front for picker UIs.
export const SOCCER_POSITIONS = opts([
  ["GK", "Goalkeeper"],
  ["CB", "Center Back"],
  ["LB", "Left Back"],
  ["RB", "Right Back"],
  ["LWB", "Left Wing Back"],
  ["RWB", "Right Wing Back"],
  ["CDM", "Defensive Mid"],
  ["CM", "Center Mid"],
  ["CAM", "Attacking Mid"],
  ["LM", "Left Mid"],
  ["RM", "Right Mid"],
  ["LW", "Left Wing"],
  ["RW", "Right Wing"],
  ["ST", "Striker"],
  ["CF", "Center Forward"],
]);

// Used by Task.priority — a generic priority scale.
export const PRIORITIES = opts([
  ["HIGH", "High"],
  ["MEDIUM", "Medium"],
  ["LOW", "Low"],
]);

// Feedback.visibility — COACH_ONLY (the default; staff only) or
// ATHLETE_VISIBLE (explicitly shown to the athlete in their portal).
export const FEEDBACK_VISIBILITY = opts([
  ["COACH_ONLY", "Coach only"],
  ["ATHLETE_VISIBLE", "Visible to athlete"],
]);

// RosterSpot.status — an athlete's membership on one particular team.
export const ROSTER_SPOT_STATUSES = opts([
  ["ACTIVE", "Active"],
  ["INACTIVE", "Inactive"],
]);

// Match.status.
export const MATCH_STATUSES = opts([
  ["SCHEDULED", "Scheduled"],
  ["COMPLETED", "Completed"],
  ["CANCELLED", "Cancelled"],
]);

// PracticeAttendance.status — cycles PRESENT -> LATE -> ABSENT -> PRESENT
// on each click of the quick attendance toggle (see attendance-list.tsx).
export const ATTENDANCE_STATUSES = opts([
  ["PRESENT", "Present"],
  ["LATE", "Late"],
  ["ABSENT", "Absent"],
]);

export function nextAttendanceStatus(status: string): string {
  const order = values(ATTENDANCE_STATUSES);
  const i = order.indexOf(status);
  return order[(i + 1) % order.length] ?? "PRESENT";
}

// The head coach's default onboarding checklist.
export const DEFAULT_CHECKLIST: { key: string; label: string }[] = [
  { key: "review_teams", label: "Review your teams" },
  { key: "check_injuries", label: "Check in on flagged athletes" },
];

// Colour classes for badges. Keyed by value; falls back to a neutral style.
export const BADGE_COLORS: Record<string, string> = {
  // Priority
  HIGH: "bg-red-100 text-red-800 border-red-200",
  MEDIUM: "bg-amber-100 text-amber-800 border-amber-200",
  LOW: "bg-slate-100 text-slate-700 border-slate-200",
  // Athlete / roster-spot status
  ACTIVE: "bg-green-100 text-green-800 border-green-200",
  INACTIVE: "bg-amber-100 text-amber-800 border-amber-200",
  ARCHIVED: "bg-slate-100 text-slate-500 border-slate-200",
  // Injury status
  HEALTHY: "bg-emerald-100 text-emerald-800 border-emerald-200",
  QUESTIONABLE: "bg-amber-100 text-amber-800 border-amber-200",
  OUT: "bg-red-100 text-red-800 border-red-200",
  // Feedback visibility
  COACH_ONLY: "bg-slate-100 text-slate-600 border-slate-200",
  ATHLETE_VISIBLE: "bg-violet-100 text-violet-800 border-violet-200",
  // Match status
  SCHEDULED: "bg-sky-100 text-sky-800 border-sky-200",
  COMPLETED: "bg-green-100 text-green-800 border-green-200",
  CANCELLED: "bg-slate-100 text-slate-500 border-slate-200",
  // Attendance status
  PRESENT: "bg-emerald-100 text-emerald-800 border-emerald-200",
  LATE: "bg-amber-100 text-amber-800 border-amber-200",
  ABSENT: "bg-red-100 text-red-800 border-red-200",
};

// Helper: turn a raw enum value into its human label using the given option set.
export function labelOf(options: Option[], value?: string | null): string {
  if (!value) return "—";
  return options.find((o) => o.value === value)?.label ?? value;
}

// Flat lists of valid values, handy for Zod enum validation.
export const values = (o: Option[]) => o.map((x) => x.value) as [string, ...string[]];
