# TODO / Roadmap — Matchday

> **This is the sole authoritative status document.** README.md and CONTEXT.md deliberately do not
> restate status, so they can't go stale.

## Built (v1)

- **Fork & core scaffold** — copied from class_copilot, K-12 subsystems stripped, roles relabeled
  Head Coach/Assistant Coach/Athlete. Multi-tenant workspaces (`/signup`, `User.ownerId`) carried
  over as-is. Auth (JWT via `jose`, bcrypt), `AllowedEmail` roster gate, activity log, notifications,
  tasks, generic `Setting`s (trimmed to Gmail SMTP for invite emails) all working.
- **Roster** — `Team`/`Athlete`/`RosterSpot`/`TeamAssistantCoach` CRUD at `/admin/teams`,
  `/admin/athletes`. Athlete fields: primary/secondary position, jersey number, DOB, dominant foot,
  injury status/note (the roster's at-a-glance signal). CSV/paste bulk roster import
  (`/admin/teams/[id]/roster/import`) with header-guessing and email/externalId/name dedupe. Athlete
  portal invite links, optional bulk invite email via Gmail SMTP.
- **Tactical board** (`/teams/board`) — blank by default, no formation click required; drag any
  athlete anywhere on the pitch (freeform, not fixed slots) with pointer-based dragging (mouse,
  touch, and pen all work — no native HTML5 DnD), drag near another player to swap, drag back to the
  bench to unassign. Dragging is optimistic (moves instantly, doesn't wait on the server round trip).
  6 seeded presets (4-4-2, 4-3-3, 4-2-3-1, 3-5-2, 3-4-3, 5-3-2) available as an optional one-time
  quick-fill of empty placeholder positions on a blank board; "Clear board" resets to blank. Four
  views (Full Wide — the default, Full Tall, Attacking Half, Defending Half, the last two showing a
  complete, full-size half of the pitch), a names on/off toggle, and a "Lock" toggle that freezes all
  editing for presenting without accidental bumps — all three persisted per-browser. Multiple named
  boards per team. **Sketch in an opponent's expected formation** (`side: OPPONENT` markers, shown in
  red, mirrored to face the right way, independent of the team's own shape — clearing one never
  touches the other). **A draggable ball** and **drawn arrows** (Pass — solid white, or Run — dashed
  yellow) via a Move/Draw mode switch, with arrows **chainable into a sequence**: starting a new
  arrow near where a previous one ended snaps to connect them, and the **Sequence panel** lists the
  resulting steps — click one to play just that motion, or **Play** to run the whole thing in order
  (each step moves everyone/the ball with an arrow at that step, all at once, then the next step
  begins). Purely a client-side visualization — nothing is written back, so replaying always starts
  from the same drawn-up shape. Dark navy presentation theme across the **whole platform** (not just
  the board), a coach's own token is a plain blue circle (no boxed background), the opponent's stays
  red. **The bench shows every athlete this coach can access, not just this team's official
  roster** — placing one on the board auto-adds them to the team's roster. **Share with the team**: a
  coach generates a public, no-login read-only link (`/share/lineup/[token]`) with an optional
  game-plan message, the same sequence Play controls, and a matching card on a logged-in athlete's
  portal dashboard.
- **Match planner** (`/teams/matches`, `/teams/matches/[id]/plan`) — schedule a match
  (opponent/date/periods), seed each period's starting XI from a saved lineup or carry over from the
  previous period, log substitutions (player off / player on / minute), see a per-athlete timeline
  and running total-minutes panel (flags anyone at 0 minutes).
- **Practice attendance** (`/teams/attendance`, `/teams/attendance/[id]`) — start a practice (date +
  optional notes) and every ACTIVE roster athlete is seeded Present; the detail page is a quick
  tap-to-cycle list (Present → Late → Absent → Present) with a "Mark all present" reset, live
  present/late/absent counts, and delete. An athlete added to the roster after a practice was
  created is reconciled in (defaulted to Present) the next time that practice is opened, rather than
  silently missing — same reasoning as the tactical board's bench always showing everyone.
- **Invite links, individually or in bulk, for both athletes and assistant coaches** — an athlete's
  portal invite (`AthleteInvite`) can now be emailed one at a time from their own profile page
  (`sendAthleteInviteEmail`), on top of the existing "Send invite links to all" bulk button on a
  team's roster. Assistant coaches get the same self-service option for the first time: a new
  `AssistantInvite` model lets an already-created assistant account (which starts with a coach-issued
  temp password) instead set its own password via a link — generate/copy/regenerate/cancel it, email
  it individually, or "Send invite links to all pending" in one click from `/admin/assistants` for
  every assistant who hasn't finished setup yet. Both invite kinds share the same Gmail-SMTP
  transport and expiry (7 days); the temp-password path still works too — the invite link is an
  additional, not exclusive, way in.
- **Reinstate or reset a revoked athlete login** — a revoked athlete portal login (`AthleteInvite`'s
  "Revoke access") used to be a dead end. Now: "Reinstate access" un-revokes the *same* login (for
  "revoked by mistake" or a temporary suspension), or "Send new invite" permanently detaches the old
  login (kept, deactivated, never reinstatable after this) and issues a fresh invite link so the
  athlete sets up a brand new email/password — for when the old credentials shouldn't come back.
- **Formation presets always seeded on deploy** — `prisma/seed-formations.ts` (re-)inserts the 6
  built-in tactical-board formations independently of the full demo seed, run automatically by
  `render.yaml`'s `preDeployCommand` on every deploy. Fixes a real gap: a coach who (reasonably)
  skipped the demo seed on their production deploy never got formation presets at all, so both the
  own-team quick-fill bar and the opponent-formation picker silently had nothing to show.
- **Tests**: `scripts/isolation-test.mts` (2-hop assistant-coach access), 
  `scripts/multi-tenant-isolation-test.mts` (cross-workspace isolation),
  `scripts/feedback-test.mts`, `scripts/roster-import-test.mts`, `scripts/attendance-test.mts`,
  `scripts/assistant-invite-test.mts`, `scripts/athlete-login-test.mts` — all passing against the
  seeded demo data. Full `next build` + `tsc --noEmit` clean.
- **Render + Postgres deployment** — `render.yaml` blueprint (web service + Postgres database),
  README's "Deploying to Render" walkthrough. Local dev stays SQLite/zero-setup; the datasource
  provider swap happens only inside Render's own build container (see CONTEXT.md).

## Not built yet / deliberate v1 cuts (see CONTEXT.md's Decisions for the reasoning)

- **No in-app formation-preset editor** — a coach can't save their own custom preset back into the
  6 seeded formations (freeform placement covers most of the original need, though — a board isn't
  locked to any template once quick-filled).
- **A share link never expires and has no view log** — anyone with the link can view it indefinitely
  until the coach re-shares (which rotates the token) or unshares.
- **Opponent markers have no formation-vs-formation "matchup" view** — they render on the same pitch
  as the team's own shape, but there's no side-by-side or overlay-diff comparison beyond that.
- **One ball per board, and no way to reorder/edit a sequence step after drawing it** — chains are
  inferred purely from where arrows happen to connect; fixing a mistake means deleting and redrawing,
  not dragging a step to a new position or editing one arrow in place.
- **Only one active drag at a time** — fine for mouse/single-finger touch, but there's no
  multi-touch support (e.g. two coaches' fingers moving two players at once on a shared tablet).
- **No tracked `prisma/migrations/` — schema changes go out via `db push`**, both locally and on
  Render (`preDeployCommand`). Fine solo; worth moving to real migrations before more than one
  person is relying on the production database not losing a change history.
- **No live match-day mode** — the planner is for pre-match planning (and after-the-fact
  reconstruction), not a live "tap to sub now" clock during an actual match.
- **No per-team formation defaults** — a new Lineup always starts from whichever preset the coach
  picks; there's no "this team usually plays 4-3-3" default.
- **No notifications wired to lineups/matches** — `notifyAssistantCoachesForAthlete`/
  `notifyAthleteUser` exist (ported from class_copilot) but nothing calls them yet for e.g. "you've
  been named in the starting XI" or "a match was scheduled."
- **Athlete portal is minimal** — shows teams + recent feedback only. No match schedule, no
  "am I in the lineup" view for an athlete yet.
- **No club/season-level reporting** — e.g. minutes-played trends across a whole season, or
  cross-team athlete availability at a glance. This includes attendance: no season-long
  present/late/absent rate per athlete, no "who's missed the most practices" view — each practice's
  attendance is only browsable one session at a time from `/teams/attendance`.
- **An athlete never sees their own attendance** — the portal doesn't surface it; attendance is a
  coach-facing tool only, same as feedback's COACH_ONLY default.

## Gotchas / operational notes

- `npm run db:reset` runs `prisma db push --force-reset`, which Prisma's own AI-agent safety guard
  refuses to run without a human explicitly consenting in the moment — don't script around this;
  ask first (or use SQLite Studio / a targeted Prisma query for a one-off fixture fix instead of a
  full reset).
- Local dev is SQLite; going online means switching `prisma/schema.prisma` to `postgresql` (see
  README's "Going online later").
