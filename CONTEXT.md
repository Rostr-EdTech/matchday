# Context

> **Status lives in TODO.md only — this file is not updated per-milestone.**
> It's revisited only for a genuinely new architectural decision, not for "we finished milestone X."

## What this is

A soccer team-management platform for a coach (Jordi): roster management (positions, jersey
numbers, injury status), a drag-and-drop formation/lineup board with common presets, and a
substitution/playing-time planner for matches. Requested as an independent sibling to
`class_copilot` (K-12 classroom tracker) and `Rostr` (student check-in) — same architectural
lineage, entirely separate codebase/database/deployment.

## Where this came from

Forked from `../class_copilot`, itself forked from the recruitment-agency CRM scaffold at
`../crm`. This is a **deliberate deviation** from the house convention (`class_copilot` and
`college-counseling` both fork the CRM root directly, never a sibling vertical) — recorded here
since it's the kind of non-obvious call this file exists to capture:

**Why class_copilot, not the CRM root.** The explicit requirement was "multi-team from day one" —
any coach signs up and gets their own isolated workspace. The CRM root is single-tenant (one
agency owner, no `/signup`, no per-owner workspace concept at all) — it would need that machinery
built from scratch. class_copilot already has it (`User.ownerId` as workspace root, `/signup`,
`/invite/[token]`, `AllowedEmail` roster-gate, `sessionVersion` revocation), proven out over its own
build. Forking class_copilot and stripping its K-12-specific subsystems (Standards, Mastery,
Grading, Assignments, Practice Mode, the whole AI dispatch layer) was less net work than
re-deriving multi-tenancy, and reuses the hardest, most security-sensitive part
(`src/lib/access.ts`'s IDOR guards) verbatim in structure.

## Domain mapping

| class_copilot concept | This app | Notes |
|---|---|---|
| `User` (OWNER\|ASSISTANT\|CLIENT), `ownerId`, `allClientsAccess`, `sessionVersion` | same, unchanged | Relabeled Head Coach / Assistant Coach / Athlete in `ROLE_LABELS` only — role strings kept literal, same reasoning class_copilot used for Teacher/Co-Teacher/Student |
| `AllowedEmail` (STAFF\|STUDENT) | kept, `STUDENT`→`ATHLETE` | Roster-allowlist signup gate |
| `Class`, `teacherId` | `Team`, `coachId` ✅ | A squad/roster (e.g. "Varsity Boys — 2026 Fall") |
| `Student` | `Athlete` ✅ | Drops `gradeLevel`/`flag`; gains `primaryPosition`, `secondaryPositions` (JSON array string, same trick as the source CRM's `Client.targetTitles`), `jerseyNumber`, `dateOfBirth`, `dominantFoot`, `injuryStatus`/`injuryNote`/`injuryUpdatedAt` (the new at-a-glance signal, replacing `flag`) |
| `Enrollment` | `RosterSpot` ✅ | Athlete↔Team join |
| `ClassCoTeacher` | `TeamAssistantCoach` ✅ | Assistant-coach→team assignment, same 2-hop access-lookup shape |
| `StudentInvite` | `AthleteInvite` ✅ | One-time athlete portal invite link |
| `Task`, `ActivityLog`, `Notification`, `UserPreference` | kept, FK names relabeled (`classId`→`teamId`, `studentId`→`athleteId`) | Generic infra, no domain rework needed |
| `Feedback` (attached to `MasteryEvent`/`DailyCheck`) | `Feedback`, **always general** ✅ | No coaching equivalent of mastery-evidence/daily-check attachment — simplified to a plain athlete note, `COACH_ONLY`/`ATHLETE_VISIBLE` |
| `Setting`/`src/lib/settings.ts` (9 AI/Canvas/Google-OAuth keys) | trimmed to 2 keys ✅ | Only `GMAIL_SMTP_USER`/`GMAIL_SMTP_APP_PASSWORD` remain, powering bulk athlete-invite emails (`src/lib/email.ts`). Nothing in this domain needs AI, Canvas, or Google Sign-In. |
| `Standard*`, `MasteryEvent`, `DailyStandardFocus`, `DailyCheck`, `GradingPolicy`, `Assignment*`, `PracticeAttempt*`, `GuestUser*`, `ChecklistCompletion`, `StandardCategory`, `src/lib/ai/*`, `src/lib/practice/*`, `src/lib/comments/*`, `src/lib/assignments/*`, `src/lib/mastery*`, `src/lib/grading*`, `src/lib/canvas/*`, `src/lib/standards-import/*`, `src/lib/guest-auth.ts`, `src/lib/google-oauth.ts`, `src/lib/storage.ts`, `src/lib/reports.ts`, `src/components/ui/mention-textarea.tsx`, `src/lib/mentions.ts` | **dropped entirely** | No coaching equivalent — academic mastery/engagement/AI subsystems, Google Sign-In, file uploads, @-mentions |
| — | `Formation` ✅ | **New.** Global seed data (like the source's `StandardCategory`): `name` (e.g. "4-3-3"), `slotsJson` (formation slots: `{slotKey, positionLabel, x, y}` on a normalized 0–100 pitch). 6 presets ship in `prisma/seed.ts` (via `src/lib/formations.ts::FORMATION_PRESETS`): 4-4-2, 4-3-3, 4-2-3-1, 3-5-2, 3-4-3, 5-3-2. No in-app formation editor — a deliberate v1 scope cut. |
| — | `Lineup` / `LineupSlot` ✅ | **New.** A saved board state for a Team (optionally tied to a Match): `formationId` + per-slot athlete assignment. Unassigned roster athletes are implicitly "on the bench" — no separate bench model, no separate join table beyond the slots themselves. |
| — | `Match` ✅ | **New.** `teamId`, `opponent`, `date`, `isHome`, `periodCount`/`periodMinutes` (e.g. 2×40 or 4×20), `status`. |
| — | `MatchAppearance` ✅ | **New — the substitution/minutes model.** Interval-based, not paired sub-events: `matchId`, `athleteId`, `periodIndex`, `startMinute`, `endMinute` (null = still on through end of period). A substitution is just two adjacent rows. Total playing time = sum of interval lengths (`src/lib/minutes.ts`). |

### New `src/lib/enums.ts` vocabulary
- `INJURY_STATUSES`: `HEALTHY | QUESTIONABLE | OUT`
- `SOCCER_POSITIONS`: `GK, CB, LB, RB, LWB, RWB, CDM, CM, CAM, LM, RM, LW, RW, ST, CF`
- `DOMINANT_FOOT`: `LEFT | RIGHT | BOTH`
- `ROLE_LABELS`: OWNER→"Head Coach", ASSISTANT→"Assistant Coach", CLIENT→"Athlete"

## Decisions made so far

- **Sport scope is soccer-only for v1** — `Formation.sport` exists as a field (so a second sport
  isn't a schema migration later) but nothing else is genericized preemptively: `SOCCER_POSITIONS`
  is a fixed enum, not a per-sport taxonomy. YAGNI until a second sport is actually requested.
- **Feedback dropped its attachment fields entirely**, rather than keeping
  `masteryEventId`/`dailyCheckId`-shaped optionality with nothing to attach to. class_copilot's
  Feedback could target a specific piece of mastery/engagement evidence; this domain has no
  equivalent "evidence" concept, so Feedback here is always general — simpler model, simpler
  `addFeedback` action (no `AddFeedbackTarget` union), simpler `FeedbackPanel` (no AI-draft-from-note
  button, since there's no private note field it would draft from).
- **The Settings/managed-secrets subsystem survives, radically trimmed** (9 keys → 2). Gmail SMTP
  for bulk invite emails is the one genuinely reusable piece from class_copilot's Settings page;
  everything else (AI provider keys, AI engine toggles, AI temperature, Canvas, Google OAuth) has
  no coaching use and was deleted along with its UI (`src/components/settings/api-keys-form.tsx`
  was rewritten from scratch as a plain "here are 2 fields" form, not adapted from the AI-keys
  version).
- **Athlete positions use a JSON-array-string field for secondary positions**
  (`Athlete.secondaryPositions`), the same SQLite-friendly trick the source CRM used for
  `Client.targetTitles` — a real Prisma relation would be overkill for "which other positions can
  this player cover," and JSON keeps the `athleteSchema` validation and the roster CSV importer
  simple (see `src/lib/import/prepare.ts::resolvePosition`, which best-effort-matches an imported
  position string against `SOCCER_POSITIONS` and drops it silently on a miss rather than erroring
  the whole row — position is a convenience field for import, not a required one).
- **Formation switching resets a Lineup's slots, unassigned — no "map old slot to nearest new
  slot" logic** (`src/actions/lineups.ts::changeLineupFormation`). A deliberate v1 scope cut: for a
  genuine formation change (say 4-4-2 → 3-5-2), a coach is usually rethinking the whole shape
  anyway, and a "best guess" remapping would be more surprising than a clean slate they refill from
  the bench in a few drags.
- **The board's drag-and-drop is native HTML5 DnD (`draggable`/`onDragStart`/`onDrop`), not a
  library, and not hand-rolled pointer-math dragging either** — reconsidered from the original plan
  (which sketched pointer events) once actually building it: native DnD handles cross-container
  drags (bench ↔ pitch ↔ bench) for free with zero pointer-tracking code, at the cost of no touch
  support. Desktop-first is an acceptable v1 trade for a coach planning at a laptop; touch support
  (which would need pointer-event dragging, since HTML5 DnD doesn't fire on touch) is a follow-up if
  it turns out coaches want to do this from a tablet on the sideline.
- **A slot's assignment (`setSlotAthlete`) treats "swap" as: vacate the athlete's old slot in this
  lineup (if any), then overwrite the target slot — the target's previous occupant is displaced,
  landing on the source slot if there was one (a true swap) or becoming bench again if the athlete
  came from the bench (nowhere to send them).** Bench membership is never stored — it's just "any
  active roster athlete not referenced by any `LineupSlot.athleteId` in this lineup," computed
  client-side from the roster minus assigned ids. This means unassigning is just `setSlotAthlete(
  slotKey, null)` and there is no separate "bench roster" table to keep in sync.
- **The substitution planner models a sub as two independent `MatchAppearance` rows (one ended,
  one started), not a `Substitution` join model pairing players-off/on.** Considered a paired model
  first; the interval model won because total-minutes math becomes a one-line sum
  (`src/lib/minutes.ts::totalMinutesByAthlete`) with no pairing logic to get wrong, and it still
  renders as a clean timeline (`Planner`'s per-athlete bar visualization) and a substitution *action*
  (`makeSubstitution`) still reads naturally as "player off, player on, minute" even though the
  underlying rows aren't linked to each other by any FK.
- **The match planner's substitution UI is form-based (player-off/player-on/minute + Submit), not a
  drag-to-resize timeline**, even though the timeline visualization itself is rendered. A true
  drag-resize-with-overlap-prevention interaction was scoped and rejected for v1 as materially
  higher-risk to get right (snapping, collision handling, undo) for the same underlying data a
  three-field form produces correctly by construction. The timeline bars are read-only, computed
  from the appearances the form/carry-over/seed actions create.
- **A period's plan is seeded two ways**: from a saved `Lineup`'s starting XI
  (`seedPeriodFromLineup`), or copied from whoever was still on at the end of the previous period
  (`carryOverPeriod`, the common "same XI into the second half" case). Both refuse to run if the
  period already has appearances (`clearPeriod` first) — never silently duplicates a plan.
- **`endMinute: null` on a `MatchAppearance` means "plays through the end of that period,"
  clamped to `periodMinutes` only at read time** (`src/lib/minutes.ts::appearanceLength`), never
  written back as a concrete number. This is planning software, not a live match clock — a coach
  isn't expected to go back and "close out" a period that went exactly as planned.
- **No file-upload subsystem at all** (`src/lib/storage.ts` deleted, not adapted) — nothing in this
  domain needs one yet (no team logos/photos in v1). class_copilot's local-disk-only version was a
  reasonable base to revive if that changes; starting without it keeps the dependency/surface area
  smaller until there's a real feature that needs it.

## Second pass: freeform board + views + sharing (2026-09-05)

Jordi asked for the board to (a) load blank, no formation click required, (b) support genuinely
free player positioning rather than fixed slots, (c) offer horizontal/vertical/attacking-half/
defending-half views fitted to the screen, (d) show player names on tokens, and (e) let a coach
share a board with the team. This changed `LineupSlot` from "one row per formation-template
position, nullable x/y meaning 'use the template default'" to "one row per placed athlete or empty
placeholder, always a concrete x/y" — a real schema change, not just new UI:

- **`LineupSlot.slotKey` (a formation-template key like `"cb1"`) was removed; `x`/`y` became
  required; `positionLabel` was added, denormalized onto the row itself.** The row's own `id` is
  now the only identity a slot needs. This decouples rendering from `Formation` entirely — a board
  never needs to join back to a formation template to know where anything is, whether it was
  quick-filled from a preset or placed freehand.
- **`Lineup.formationId` became optional and purely informational** ("which preset was last used to
  quick-fill this board's placeholders," for display only) rather than a hard requirement — a brand
  new `Lineup` now always starts with zero slots. `applyFormationTemplate` (renamed from the old
  formation-required `createLineup`) is an opt-in action that only runs on an empty board (refuses
  otherwise, pointing at `clearBoard` first) — never silently layers a second formation's
  placeholders on top of one a coach has already started filling in.
- **`placeAthlete` unifies move/place/swap/displace into one action**, branching only on whether the
  dragged athlete already has a slot in this lineup and whether the drop landed on a specific
  existing slot (an empty placeholder or another athlete's token) vs. open pitch space. This
  replaced the old template-slot-keyed `setSlotAthlete` + `nudgeSlotPosition` pair — one action
  instead of two, because "move" and "assign" are the same operation once slots aren't pinned to a
  template position.
- **The four board views (`src/components/board/pitch.tsx::toScreen`) are a pure presentational
  transform of one canonical coordinate space** (x 0–100 left-right, y 0–100 own-goal-to-opponent-
  goal) — never a different stored representation. Horizontal is the new default (own goal left,
  attacking right); Attacking/Defending Half crop and rescale the same y range rather than
  introducing a second coordinate system. This is why `visibleInView`'s half-view cutoffs (y ≥ 40 /
  y ≤ 60, a deliberately generous overlap past the halfway line) are the only place "which half"
  logic lives — the transform math itself doesn't need to know.
- **Sharing reuses the `AthleteInvite`-style token pattern** (`Lineup.shareToken`/`sharedAt`, a
  `crypto.randomUUID()` token, no expiry) rather than inventing a new mechanism — `getSharedLineup`
  is a public, unauthenticated lookup exactly like `getInviteInfo`, gated only by the token matching
  a currently-shared row. Re-sharing always mints a fresh token (old links go dead immediately) —
  the same "no quietly-still-valid stale credential" posture as `revokeAthleteLogin`. The public
  page and the athlete-portal "Game plan" card both render the same read-only `SharedBoardView` /
  `pitch.tsx` pieces the interactive board uses, so there is exactly one place that knows how to
  draw a pitch and a token, not two implementations to keep in sync.
- **View preference and the names-on/off toggle are `localStorage`-only, not persisted server-side**
  — a per-viewer display convenience (which board orientation you like to look at), not shared team
  state, so there's no `UserPreference` row or migration for it.

## Third pass: pointer-based dragging, opponent formations, half-pitch fix (2026-09-05)

Trying the second pass surfaced three real problems, plus one more feature request:

- **Bug: dragging felt "locked" specifically on formation-quick-filled boards.** Root cause was
  HTML5 drag-and-drop's DOM-hit-testing model, not the placement logic itself: every empty
  placeholder's absolutely-positioned container included its "remove" text link *below* the visual
  circle, so its actual drop-target hit-box was taller than it looked — and a formation quick-fill
  scatters ~11 of these across the pitch. Enough of the pitch's area ended up covered by some
  placeholder's oversized hit-box that a drop nearby would silently land on *that* placeholder's
  fixed template position instead of the coach's actual drop point — reading as "the board won't let
  me move players off their formation spots." A freshly freeform board has zero such placeholders,
  so it never showed the symptom.
- **This motivated dropping native HTML5 drag-and-drop entirely for Pointer Events**
  (`onPointerDown` + `setPointerCapture` + `onPointerMove`/`onPointerUp` on the same captured
  element — no global listeners needed). This fixes the hit-box bug at the root (placement is now
  decided by *distance* to the nearest other slot at the exact drop coordinate — see
  `pitch.tsx::nearestSlot` — not by which DOM element happened to catch the browser's native drop
  event), and separately addresses "clunky": native DnD's default ghost-image-plus-round-trip-before-
  the-token-moves feel is replaced with a `position: fixed` ghost that tracks the pointer every
  frame, plus **optimistic local updates** (`formation-board.tsx`'s `optimisticPlace`/
  `optimisticRemove`/`optimisticMoveOpponent` mirror the server's decision logic against local
  state immediately on drop; the server action fires in the background and `router.refresh()`
  reconciles once it resolves) — a token visibly moves the instant you release it, not once the
  network round-trip completes. Bonus: Pointer Events unify mouse/touch/pen, so this also closes the
  "no touch/tablet support" TODO item that HTML5 DnD could never have supported.
- **New: a "Lock" toggle** (`localStorage`-only, alongside the view/names preferences) freezes all
  board-mutating interactions — dragging, quick-fill, clear, per-slot remove, opponent add/clear —
  while leaving board management (rename/share/switch/new/delete) live. A deliberate "presentation
  mode" for showing the board to the team without an accidental bump reshuffling it; separate from
  *sharing* (which is about a read-only audience), this is about protecting the coach's own edit
  session once the shape is set.
- **Bug: the half-pitch views clipped anyone outside a narrow y-band, reading as "only the 18-yard
  box shows."** `visibleInView`'s filter (a deliberate ±10 "generous overlap" past the halfway line)
  didn't match the range `toScreen`'s attack/defend transforms actually mapped into `[0,100]` — a
  slot just past the boundary produced a screen coordinate outside 0-100 and was clipped by the
  container's `overflow-hidden`, invisible rather than shown at the edge. Fixed by making the filter
  and the transform agree exactly: attack is `y >= 50` mapped straight to the view, defend is
  `y <= 50` — a clean, complete half, no overlap fudge-factor to keep in sync by hand. While fixing
  this, corrected the half-view penalty-box proportions too: a half-view stretches half the pitch's
  *length* to fill the same screen space as a full view, so the box should occupy roughly double the
  proportion of the visible length (~31%, not the full-pitch view's ~16%) — it was previously copied
  verbatim from the full-pitch markings.
- **New: sketching in an opponent's expected formation.** `LineupSlot.side` (`US` | `OPPONENT`,
  default `US`) distinguishes the coach's own placements from generic opponent markers — an
  OPPONENT slot's `athleteId` is always null (never tied to the roster); it's just a labeled dot,
  rendered in red (`OpponentBadge`) to stay visually distinct. `addOpponentFormation` seeds one from
  a preset **mirrored** (`y' = 100 - y`) so it faces the right way on the same pitch as the team's
  own shape. Both sides are otherwise independent: `clearBoard` only touches `US` slots,
  `clearOpponentFormation` only touches `OPPONENT` ones, and quick-filling one side never requires
  the other to be empty first. Opponent markers can still be dragged (via `moveOpponentSlot`, a
  plain position update — no swap/displace logic, since there's no roster identity to swap).

## Fourth pass: ball, arrows, play animation, dark theme, rebrand (2026-09-06)

- **The ball and drawn arrows are new first-class rows, not repurposed `LineupSlot`s.** A ball is
  two nullable floats directly on `Lineup` (`ballX`/`ballY` — there's only ever one, so no separate
  table earns its keep); an arrow is its own `LineupArrow` (`kind: PASS | RUN`, four floats, no
  relation to any athlete/slot — deliberately generic so an arrow can start or end anywhere on the
  pitch, not just at a player's current position). Both reuse the exact same canonical 0-100
  coordinate space as `LineupSlot.x/y`, so `toScreen`/`fromScreen` needed no changes to support them.
- **"Play" is explicitly a client-only visualization that writes nothing back.** `playAthlete`/
  `moveBall`/etc. are never called during playback — `formation-board.tsx::play()` mutates local
  React state only (snapshotting it first) and reverts on a timer. This was the only design that
  keeps "replay the plan" idempotent: a coach can hit Play as many times as they want and always see
  the same choreography from the same starting shape, instead of the shape drifting by one play-through
  each time (which persisting the animated end-state would have caused).
- **A run arrow's mover is found by proximity, not by reference** — `play()` matches each RUN
  arrow's `from` point to the nearest player currently within 8 canonical units, the same
  `nearestSlot`-style distance heuristic the drag system already uses. An arrow doesn't carry an
  athleteId because a coach draws the shape first and populates/reshuffles the roster after; tying
  an arrow to a specific athlete would silently orphan it the moment that player got swapped out.
- **The ball animates through its PASS arrows in `createdAt` order** (a simple waypoint chain,
  starting from the first pass's own `from` point) — the closest thing to a "sequence" without
  building a real ordering/reordering UI (see TODO.md). RUN arrows all animate simultaneously
  instead, since player movement during a passage of play is concurrent, not sequential.
- **Move vs. Draw is a single exclusive mode**, not simultaneous — drawing and dragging both start
  from a `pointerdown` on the pitch, and letting both interpret the same gesture would mean guessing
  intent (drag this player vs. start an arrow from under it). Switching to Draw doesn't clear
  anything; a coach flips back to Move to keep repositioning players.
- **Dark navy theming and the plain-circle player token are scoped to the tactical board's own
  files** (the board page's wrapper panel, `formation-board.tsx`, `shared-board-view.tsx`,
  `pitch.tsx`) — not a global dark-mode toggle for the app. `globals.css` already ships an unused
  `.dark` class from the original template (a violet dark theme, never wired to a toggle); this is
  deliberately independent of that — the board's navy look is a fixed aesthetic choice for this one
  surface, not a user-toggleable theme.

## Fifth pass: chained sequences, workspace-wide bench, global navy theme (2026-09-06)

- **Arrow chaining is inferred from geometry, not an explicit link the coach manages.**
  `src/lib/board-sequence.ts::buildChains` treats two arrows of the same kind as connected when one's
  endpoint sits within `CONNECT_RADIUS` (6 canonical units) of another's start point — the same
  "close enough" heuristic the drag system already uses for swap/claim targeting. Drawing a second
  arrow near the first one's end *snaps* its start to that exact point (`onPitchPointerDown`'s
  same-kind endpoint search), so chains connect exactly, not approximately, once drawn. A run chain
  is one player's whole move; a pass chain is the ball's. Different players' runs never accidentally
  merge because they're spatially far apart — no player identity needs to be attached to an arrow at
  draw time for this to work.
- **Steps, not one flat animation.** `buildSequence` aligns every chain by position — step *i* is
  the *i*-th arrow of every chain that has one — so multiple players can move simultaneously within
  a step while a longer chain keeps going for several more steps after a shorter one has finished.
  This is the direct reason arrows no longer need a `RUN_MS`/`PASS_MS` split: everything in a step
  shares one `STEP_MS` duration, since a step is now the true "these happen together" unit, not "all
  runs vs. all passes."
- **Play/step/reset share one baseline snapshot (`baselineRef`), captured lazily on first use, not
  re-captured per step.** This is what makes "click through steps one at a time to narrate them"
  and "hit Play for the automated run-through" both valid without one interfering with the other's
  idea of "the starting shape" — Reset always returns to the position the board was in before *any*
  playback began this session, however it got animated from there.
- **The tactical board's bench was widened from "this team's official roster" to "every ACTIVE
  athlete this user can access"** (`getLineupBoard` now queries via `accessibleAthleteIds`, the same
  access-control helper `/admin/athletes` itself uses, instead of `Team.rosterSpots`). `placeAthlete`
  changed its authorization to match (`assertCanAccessAthlete` instead of requiring a pre-existing
  `RosterSpot`) and now **upserts** a `RosterSpot` as a side effect of placement — using the board to
  place someone is itself how they join that team's roster, so the two views of "who's on this team"
  can't silently diverge. This makes the board a genuine cross-team sketchpad (borrow a JV player for
  a Varsity drill, try out someone not rostered anywhere yet) rather than being gated by a roster
  step a coach might not have gotten to yet.
- **The navy theme is global, driven entirely by `globals.css`'s `:root` CSS variables** — not a
  second dark-mode toggle alongside the unused `.dark` class already in the file (that one stays a
  separate, still-dormant violet dark theme from the original template). Getting the *whole*
  platform to read as one surface, not just the board page, meant auditing every shared UI primitive
  (`Button`, `Badge`, `Field`/`Input`/`Select`, `Modal`, `Table`, `misc.tsx`'s `StatCard`/
  `EmptyState`, `Tabs`, `Toast`) for hardcoded `bg-white`/`text-slate-*` literals that would have
  stayed light and broken the illusion, plus every page/component built on top of them — done as a
  mechanical token substitution (`text-slate-700`→`text-foreground`, `bg-white`→`bg-card`, etc.)
  since the mapping is unambiguous and low-risk. `BADGE_COLORS` (src/lib/enums.ts) was deliberately
  left as light pastel chips rather than redesigned for dark contrast — they already read as small
  "labels" distinct from the chrome around them, the same way they did on the old light theme, and
  redesigning ~20 status colors for a second palette wasn't worth the risk of getting contrast wrong
  across all of them in one pass.

## Sixth pass: Render/Postgres deployment readiness (2026-09-06)

Jordi confirmed this needs to run as a real webapp on Render with Postgres, alongside — not instead
of — the local-first SQLite dev setup this whole app was built around.

- **Prisma has no per-environment datasource provider switch** (confirmed the hard way in
  class_copilot's own history — see that project's schema.prisma comment). Rather than committing
  `provider = "postgresql"` outright (which would break the zero-setup `npm run dev` flow this app
  was deliberately built around, and everyone's local `.env` pointing at `file:./dev.db`),
  `render.yaml`'s `buildCommand` does a one-line `sed` swap of the datasource provider **inside
  Render's build container only**, before `prisma generate` runs — the committed file on disk (and
  in git) never changes. This was checked to be safe specifically because `src/lib/enums.ts`'s
  "every enum-like field is a plain String" pattern means there is zero SQLite-vs-Postgres type
  drift to worry about, and a repo-wide grep confirmed no query anywhere uses a SQLite-incompatible
  or Postgres-only feature (`mode: "insensitive"`, raw SQL, etc.) — the schema swap really is the
  *only* thing that differs between the two environments.
- **`preDeployCommand: npx prisma db push`, deliberately without `--accept-data-loss`.** On a brand
  new, empty Postgres database (the first deploy) this applies cleanly with no prompts. On a later
  deploy where a schema change would actually drop data, `db push` refuses and exits non-zero —
  which fails that deploy's pre-deploy step rather than silently destroying rows. This is the same
  "an AI agent (or an unattended CI pipeline) must never auto-approve a destructive database action"
  principle that already blocked a `--force-reset` earlier in this project's history, just applied
  at the infrastructure level instead of an interactive one: a genuinely destructive change requires
  a human to run it deliberately, not a green checkmark on a Render deploy log.
- **No `prisma/migrations/` folder — still `db push`, matching every sibling app's actual current
  practice**, not a "proper" tracked-migrations setup. Explicitly flagged as the thing to revisit if
  this grows past being one coach's tool (see TODO.md) rather than solved preemptively — there's no
  live Postgres instance available in this environment to safely generate and verify a first
  Postgres-flavored migration against, so doing that now would be guessing at correctness rather
  than testing it.

## Seventh pass: practice attendance (2026-09-06)

Jordi asked for a way to take attendance during practices — a quick list of athletes that can be
toggled.

- **`Practice` + `PracticeAttendance`, not folded into `Match`/`MatchAppearance`.** A practice has no
  opponent, score, or minute-by-minute substitution timeline — it's a same-day roll call, so it gets
  its own pair of models rather than overloading Match's shape with nullable fields that would only
  ever apply to one of the two cases.
- **Status defaults to PRESENT at creation, not blank/unmarked.** A coach taking attendance is almost
  always marking the exceptions (who's late or missing), not building the roster up from nothing —
  so every ACTIVE roster athlete gets a PRESENT `PracticeAttendance` row the moment a Practice is
  created, and the UI's job is just to flag exceptions with a tap.
- **A 3-state cycle (Present → Late → Absent → Present) on one tap-to-cycle button, not a
  present/absent checkbox plus a separate late/excused dropdown.** Keeps the interaction to the single
  "quick toggle" the request asked for while still capturing the one exception (late) that pure
  present/absent would lose; a coach who doesn't care about late arrivals just never taps twice.
  `nextAttendanceStatus()` in `src/lib/enums.ts` is the one place that cycle order lives.
- **Reconciled on read, same pattern as the tactical board's bench fix (Fifth pass).** An athlete
  added to a team's roster after a practice was already created would otherwise be silently absent
  from that practice's attendance list forever. `getPracticeDetail` fills in a PRESENT row for any
  active roster athlete missing one every time the practice is opened, rather than only at creation
  time.
- **No attendance history/reporting view, and it never reaches the athlete portal** — deliberate v1
  cuts, see TODO.md. Each practice is a standalone record browsable one at a time; nothing rolls
  attendance up into a season-long rate yet.

## Eighth pass: sharing class_copilot's Postgres instance (2026-09-06)

Jordi is already paying for a Render Postgres instance backing class_copilot, and asked about reusing
it for matchday's own web service to save the cost of a second instance.

- **The call: share the server, never the database.** A second logical database on the same Postgres
  instance is a completely separate namespace — matchday's tables and class_copilot's tables can never
  collide or be queried by the wrong app, so the actual data isolation this project's independence
  requirement cares about (Jordi's very first instruction: "keep this project independent from
  student check in or class_copilot") stays fully intact. What's shared is only the server process:
  its uptime, storage budget, and connection ceiling. For two low-traffic, solo-coach tools with no
  other users depending on either one's uptime, that coupling is a reasonable, explicitly-chosen
  trade-off — not a silent compromise of the independence goal.
- **A dedicated Postgres role for matchday, not class_copilot's admin credential.** Costs nothing
  extra and closes the one real risk of sharing a server: a typo'd or malicious `DATABASE_URL` in
  matchday's own environment can, at worst, reach matchday's own database — it has no grant on
  class_copilot's tables at all. See README's "Deploying to Render" for the exact `CREATE ROLE`/
  `GRANT` commands.
- **`render.yaml` dropped its own `databases:` block and switched `DATABASE_URL` from `fromDatabase`
  to `sync: false`.** `fromDatabase` only resolves against a database this same Blueprint provisions;
  since matchday's database now lives on an instance Render already manages for a different service,
  the connection string has to be built by hand (documented in README) and pasted in once, the same
  as any other `sync: false` secret.
- **Backups are per-instance, not per-database** — flagged explicitly in README's "Operational note"
  rather than glossed over, since it's the one place this decision has a real, non-obvious downside:
  Render's automatic backup/restore for that Postgres instance now covers both apps' data together,
  not matchday's in isolation.

## Ninth pass: reversed the shared-instance decision (2026-09-06)

The Eighth pass's shared-Postgres-instance setup was rolled back the same day, back to matchday
provisioning its own dedicated Postgres via `render.yaml`'s `databases:` block — Jordi asked to revert
after walking through a follow-up question that exposed how much sharper the risk was than "shared
uptime/backups." Recorded here rather than just silently deleting the Eighth pass, since the
back-and-forth is itself the useful part for whoever reads this next:

- **What actually forced the reversal wasn't the shared-instance trade-off itself — it was how close
  that setup sits to a much worse one.** The shared-instance design (separate `matchday` database,
  separate `matchday_app` role, on class_copilot's existing server) was and remains data-safe on its
  own terms. But it depends entirely on one manually-typed `DATABASE_URL` in Render's dashboard being
  correct at setup time and staying correct through every future edit — a single copy-paste of
  class_copilot's own connection string instead of matchday's would point both services at the
  *literal same database*. That scenario isn't a lesser version of the same risk — it's categorically
  different and much worse: matchday and class_copilot share real table names (`User`, `AllowedEmail`,
  `Task`, `Feedback`, `ActivityLog`, `Notification`, `Setting`, `UserPreference` — confirmed by
  diffing both `schema.prisma` files directly), so `prisma db push` from either app would reconcile
  those tables to match *its own* schema, dropping the other app's columns (class_copilot's build
  command already runs with `--accept-data-loss`, so that drop wouldn't even pause to ask). A
  same-instance-different-database setup makes that failure mode reachable by a single manual paste
  error; a fully separate instance (Render's own `fromDatabase` wiring) makes it unreachable — there's
  no field to mistype into the wrong value.
- **Verdict: for what this saves (roughly one Postgres instance's cost), removing an entire class of
  manual-config failure is worth more than keeping it.** Sharing infrastructure remains fine in
  principle (see Eighth pass) — this reversal is specifically about the paste-time failure mode being
  too easy to hit for too little saved, not a retraction of "shared server, separate database is
  data-safe."
- `render.yaml` is back to provisioning `matchday-db` itself via `databases:` + `fromDatabase`; README
  is back to the simpler single-Blueprint deploy walkthrough with no manual `CREATE DATABASE`/
  `CREATE ROLE` steps.

## Tenth pass: invite links for athletes AND assistant coaches (2026-09-06)

Jordi asked for invite links to athletes and assistant coaches, individually or in bulk. Athletes
already had individual link-generation (copy-to-clipboard) and bulk email (`sendTeamInvites`); this
pass filled in the two gaps: an individual email-send for athletes, and the entire self-service
invite concept for assistant coaches (who previously only ever got a coach-issued temp password).

- **An assistant coach's `User` row already exists at invite time — unlike an athlete's.**
  `createUser` creates the full account (with a temp password) immediately, since team-assignment and
  every other assistant-coach admin action already needs a real `userId` to point at. So
  `AssistantInvite` (new model, mirroring `AthleteInvite`'s shape) can't "create an account on
  accept" the way the athlete flow does — accepting it just replaces that `User`'s password and
  clears `mustChangePassword`. This also means, unlike an athlete's invite, there's no "choose your
  own email" step: the assistant's email was already set by the coach who created the account.
  `acceptAssistantInvite` (`src/actions/assistant-invite.ts`) is a near-twin of `acceptAthleteInvite`
  with that one structural difference, mirroring `changePassword`'s (`src/actions/account.ts`)
  re-issue-the-session-immediately pattern instead.
- **The invite link is additive, not a replacement for the temp password.** Both paths lead to the
  same place (the assistant ends up with their own password) and both stop applying the moment
  `mustChangePassword` flips to `false` — a coach can hand over the temp password directly, generate
  a link to share some other way, or email it, in any combination, without the paths conflicting.
- **Bulk-invite for assistants targets "active + hasn't finished setup" (`mustChangePassword: true`),
  scoped to the OWNER's own assistants** — the natural equivalent of `sendTeamInvites`' "has an email,
  no login yet" filter, but simpler: a `User.email` is required at creation, so there's no "no email
  on file" skip case the way an `Athlete.email` (optional) has.
- **`siteBaseUrl()` moved out of `actions/teams.ts` into `src/lib/app-config.ts`** once a third caller
  (`sendAthleteInviteEmail`, then `actions/users.ts`) needed the same "build an absolute invite URL
  from `NEXTAUTH_URL`" logic — a small dedup, not a new decision.

## Eleventh pass: three bug reports from real production use (2026-09-06)

The first patches filed against the live Render deployment, not a feature request — worth noting
since it's the first real signal from outside local dev / demo data.

- **Root cause of "formations disappeared": they were never in the production database to begin
  with, not a regression.** `FORMATION_PRESETS` (see `src/lib/formations.ts`) was only ever inserted
  by `prisma/seed.ts` — the SAME script that also creates the fake demo coach/teams/athletes. A real
  coach deploying to Render reasonably skips that (README already said "or skip this for a real
  coach's workspace"), which meant they *also* silently skipped the formation presets, since the two
  were bundled in one script with no way to get one without the other. Confirmed locally that
  `prisma.formation.findMany()` returns all 6 rows in dev (seeded there), which is what made this a
  genuinely confusing "they worked before" report — they'd only ever been tested against a seeded
  database, never a real one. Fix: `prisma/seed-formations.ts`, a standalone idempotent script with
  no demo-data side effects, run automatically by `render.yaml`'s `preDeployCommand` on every deploy
  (`prisma db push && npx tsx prisma/seed-formations.ts`) — formations are global reference data, so
  they no longer ride on the decision of whether to seed fake people too. `prisma/seed.ts` keeps its
  own copy of the same upsert loop rather than importing this file — a few lines of duplication traded
  for each script staying fully standalone and independently safe to reason about.
- **The opponent-formation picker's missing options was the exact same bug, not a separate one** —
  `formations.map(...)` in `formation-board.tsx` renders nothing when `formations` is empty, for both
  the own-team quick-fill bar and the opponent panel, since both read the same prop sourced from the
  same (until now, demo-seed-only) table.
- **A revoked athlete login had no way back — not by design, just an unfinished corner.** Added
  `reinstateAthleteLogin` (same login, un-revoked — for "revoked by mistake") alongside
  `resetAthleteLogin` (permanently detaches the old login and issues a fresh invite — for "the old
  credentials shouldn't come back," e.g. the athlete lost access to that email). The old `User` row is
  always kept (deactivated, unlinked) rather than deleted on reset, matching this codebase's existing
  posture elsewhere (`actions/users.ts::deleteUser` also refuses to delete an account with real
  history) — an athlete's revoked/replaced login is left as an audit trail, not erased.

## Gotchas inherited from the source app

SQLite has no `mode: "insensitive"` and no `directUrl` (matters if/when migrating to Postgres);
`AUTH_SECRET` is required with no fallback (the app throws on boot if missing); `prisma db push
--force-reset` (and therefore `npm run db:reset`) is blocked by Prisma's own AI-agent safety guard
unless a human explicitly consents — hit this once while iterating on seed data locally; the fix
for a one-off fixture correction is a targeted `updateMany`, not a reset.
