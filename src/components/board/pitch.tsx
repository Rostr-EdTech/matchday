// Shared presentational pieces for the tactical board — the coordinate
// transforms, pitch markings, and player-token visuals used by both the
// interactive board (src/components/board/formation-board.tsx) and the
// read-only shared view (src/app/share/lineup/[token]). Kept dependency-
// and drag-handler-free so both can wrap the same visuals however they need.
//
// The stored (x, y) on a LineupSlot is always in one canonical space: a
// full pitch, x 0-100 left-to-right, y 0 (own goal line) to 100 (opponent's
// goal line). Every view below is purely a presentational transform of that
// same data — never a different coordinate system stored in the database.

import { labelOf, INJURY_STATUSES } from "@/lib/enums";

export type BoardView = "horizontal" | "vertical" | "attack" | "defend";

export const BOARD_VIEWS: { value: BoardView; label: string }[] = [
  { value: "horizontal", label: "Full (Wide)" },
  { value: "vertical", label: "Full (Tall)" },
  { value: "attack", label: "Attacking Half" },
  { value: "defend", label: "Defending Half" },
];

// width/height for the CSS `aspect-ratio` property.
export function aspectRatioFor(view: BoardView): string {
  if (view === "horizontal") return "3 / 2";
  if (view === "vertical") return "2 / 3";
  return "4 / 3"; // half-pitch views: a half is wider than it is long
}

// Convert a canonical (x, y) into { left, top } percentages for the given
// view. Attack/defend crop to EXACTLY one half of the pitch (y 50-100 /
// 0-50), rescaled to fill the whole view — same vertical (goal-to-goal-is-
// up-down) convention as the full "Tall" view, just zoomed. The crop here
// must match `visibleInView` exactly: a mismatch (e.g. showing a wider y
// range than the transform maps into [0,100]) pushes some tokens off the
// top/bottom edge, clipped by the container's overflow-hidden — which is
// exactly the "only the box shows up" bug this pairing fixes.
export function toScreen(x: number, y: number, view: BoardView): { left: number; top: number } {
  if (view === "horizontal") return { left: y, top: x };
  if (view === "vertical") return { left: x, top: 100 - y };
  if (view === "attack") return { left: x, top: 100 - ((y - 50) / 50) * 100 };
  // defend
  return { left: x, top: 100 - (y / 50) * 100 };
}

// Whether a slot at canonical y falls within this view's crop. Full views
// always show everyone; half views show exactly that half (y >= 50 /
// y <= 50) — matching `toScreen`'s assumed range exactly, see above.
export function visibleInView(y: number, view: BoardView): boolean {
  if (view === "attack") return y >= 50;
  if (view === "defend") return y <= 50;
  return true;
}

// Invert `toScreen` — given a drop point as { left, top } percentages of
// the pitch container, recover the canonical (x, y) it corresponds to for
// the current view.
export function fromScreen(left: number, top: number, view: BoardView): { x: number; y: number } {
  if (view === "horizontal") return { x: top, y: left };
  if (view === "vertical") return { x: left, y: 100 - top };
  if (view === "attack") return { x: left, y: 50 + (100 - top) / 2 };
  return { x: left, y: (100 - top) / 2 }; // defend
}

// Nearest OTHER slot (by canonical straight-line distance) within `radius`
// units — used to turn a fluid, approximate drop point into a precise
// "swap with this player" / "claim this empty spot" action without
// requiring pixel-perfect targeting.
export function nearestSlot<T extends { id: string; x: number; y: number }>(
  slots: T[],
  x: number,
  y: number,
  excludeId: string | null,
  radius = 7,
): T | null {
  let best: T | null = null;
  let bestDist = radius;
  for (const s of slots) {
    if (s.id === excludeId) continue;
    const d = Math.hypot(s.x - x, s.y - y);
    if (d <= bestDist) { best = s; bestDist = d; }
  }
  return best;
}

const GRASS_A = "#2f8f4e";
const GRASS_B = "#33954f";
const LINE = "white";
const LINE_W = 0.4;

function stripes(count: number, horizontal: boolean) {
  return Array.from({ length: count }).map((_, i) =>
    horizontal ? (
      <rect key={i} x={(i * 100) / count} y="0" width={100 / count} height="100" fill={i % 2 === 0 ? GRASS_A : GRASS_B} />
    ) : (
      <rect key={i} x="0" y={(i * 100) / count} width="100" height={100 / count} fill={i % 2 === 0 ? GRASS_A : GRASS_B} />
    ),
  );
}

// Full pitch, goal lines top+bottom (used by the "Tall" vertical view).
function FullVerticalMarkings() {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
      {stripes(10, false)}
      <rect x="1" y="1" width="98" height="98" fill="none" stroke={LINE} strokeWidth={LINE_W} />
      <line x1="1" y1="50" x2="99" y2="50" stroke={LINE} strokeWidth={LINE_W} />
      <circle cx="50" cy="50" r="9" fill="none" stroke={LINE} strokeWidth={LINE_W} />
      <circle cx="50" cy="50" r="0.6" fill={LINE} />
      <rect x="22" y="1" width="56" height="16" fill="none" stroke={LINE} strokeWidth={LINE_W} />
      <rect x="38" y="1" width="24" height="6" fill="none" stroke={LINE} strokeWidth={LINE_W} />
      <rect x="22" y="83" width="56" height="16" fill="none" stroke={LINE} strokeWidth={LINE_W} />
      <rect x="38" y="93" width="24" height="6" fill="none" stroke={LINE} strokeWidth={LINE_W} />
    </svg>
  );
}

// Full pitch, goal lines left+right (the default "Wide" view).
function FullHorizontalMarkings() {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
      {stripes(10, true)}
      <rect x="1" y="1" width="98" height="98" fill="none" stroke={LINE} strokeWidth={LINE_W} />
      <line x1="50" y1="1" x2="50" y2="99" stroke={LINE} strokeWidth={LINE_W} />
      <circle cx="50" cy="50" r="9" fill="none" stroke={LINE} strokeWidth={LINE_W} />
      <circle cx="50" cy="50" r="0.6" fill={LINE} />
      <rect x="1" y="22" width="16" height="56" fill="none" stroke={LINE} strokeWidth={LINE_W} />
      <rect x="1" y="38" width="6" height="24" fill="none" stroke={LINE} strokeWidth={LINE_W} />
      <rect x="83" y="22" width="16" height="56" fill="none" stroke={LINE} strokeWidth={LINE_W} />
      <rect x="93" y="38" width="6" height="24" fill="none" stroke={LINE} strokeWidth={LINE_W} />
    </svg>
  );
}

// One half of the pitch, vertical convention, stretched to fill the whole
// view (so the boxes are proportionally BIGGER than in the full-pitch
// markings — a half is half the length, and this view fills the same
// screen space with it, so the 18-yard box now occupies roughly a third of
// the visible length instead of a sixth). `end` says which goal is shown:
// "attack" puts the opponent's goal at the top (attacking upward, same as
// the full Tall view's top-of-screen); "defend" puts the team's own goal
// at the bottom.
function HalfMarkings({ end }: { end: "attack" | "defend" }) {
  const goalAtTop = end === "attack";
  const goalY = goalAtTop ? 1 : 67;
  const smallGoalY = goalAtTop ? 1 : 89;
  const halfwayY = goalAtTop ? 99 : 1;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
      {stripes(6, false)}
      <rect x="1" y="1" width="98" height="98" fill="none" stroke={LINE} strokeWidth={LINE_W} />
      <line x1="1" y1={halfwayY} x2="99" y2={halfwayY} stroke={LINE} strokeWidth={LINE_W} />
      <path
        d={goalAtTop ? "M 38 99 A 12 12 0 0 0 62 99" : "M 38 1 A 12 12 0 0 1 62 1"}
        fill="none" stroke={LINE} strokeWidth={LINE_W}
      />
      <rect x="22" y={goalY} width="56" height="32" fill="none" stroke={LINE} strokeWidth={LINE_W} />
      <rect x="38" y={smallGoalY} width="24" height="10" fill="none" stroke={LINE} strokeWidth={LINE_W} />
      <circle cx="50" cy={goalAtTop ? 21 : 79} r="0.6" fill={LINE} />
    </svg>
  );
}

export function PitchMarkings({ view }: { view: BoardView }) {
  if (view === "horizontal") return <FullHorizontalMarkings />;
  if (view === "vertical") return <FullVerticalMarkings />;
  return <HalfMarkings end={view} />;
}

type TokenAthlete = { id: string; displayName: string; jerseyNumber: number | null; injuryStatus?: string };

// The visual token for a placed athlete — just the numbered circle (home
// team: blue) plus a name label with a drop-shadow for legibility over the
// grass, no boxed background. Shared by the interactive board and the
// read-only shared view.
export function PlayerBadge({ athlete, showName }: { athlete: TokenAthlete; showName: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white shadow-md ring-2 ring-white/90">
        {athlete.jerseyNumber ?? "?"}
      </span>
      {showName && <span className="max-w-[76px] truncate text-[11px] font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{athlete.displayName}</span>}
      {athlete.injuryStatus && athlete.injuryStatus !== "HEALTHY" && (
        <span className="text-[9px] font-bold text-red-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{labelOf(INJURY_STATUSES, athlete.injuryStatus)}</span>
      )}
    </div>
  );
}

// A generic opponent marker — not tied to any roster, so just a position
// label in a visually distinct (red) circle, no boxed background either.
export function OpponentBadge({ positionLabel }: { positionLabel: string | null }) {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-[11px] font-bold text-white shadow-md ring-2 ring-white/90">
      {positionLabel ?? "?"}
    </div>
  );
}

export function EmptySlotMarker({ positionLabel }: { positionLabel: string | null }) {
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-white/60 bg-white/30 text-[10px] font-medium text-white">
      {positionLabel ?? ""}
    </div>
  );
}

// The ball — draggable the same way a player token is.
export function BallToken({ size = 28 }: { size?: number }) {
  return (
    <div
      className="rounded-full border-2 border-slate-800 bg-white shadow-md"
      style={{
        width: size,
        height: size,
        backgroundImage:
          "radial-gradient(circle at 30% 30%, rgba(0,0,0,0.08), transparent 60%), conic-gradient(#0f172a 0 15%, transparent 0 100%)",
        backgroundSize: "100% 100%, 55% 55%",
        backgroundPosition: "center, center",
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}

// One drawn arrow (a pass or a player run) as an SVG line, in the SAME
// screen-percentage space as the pitch's own viewBox — draw it inside an
// `<svg viewBox="0 0 100 100" preserveAspectRatio="none">` overlay sized to
// match the pitch container exactly.
export function ArrowLine({ x1, y1, x2, y2, kind }: { x1: number; y1: number; x2: number; y2: number; kind: string }) {
  const id = `arrowhead-${kind}-${x1}-${y1}-${x2}-${y2}`.replace(/\./g, "_");
  const color = kind === "RUN" ? "#facc15" : "#ffffff";
  return (
    <>
      <defs>
        <marker id={id} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L6,3 L0,6 Z" fill={color} />
        </marker>
      </defs>
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color}
        strokeWidth={0.6}
        strokeDasharray={kind === "RUN" ? "2.2,1.6" : undefined}
        markerEnd={`url(#${id})`}
      />
    </>
  );
}
