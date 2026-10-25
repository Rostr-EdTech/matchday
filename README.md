# Matchday

> **Try it:** [matchday-advt.onrender.com](https://matchday-advt.onrender.com) · [Create a free workspace](https://matchday-advt.onrender.com/signup)  
> Head coaches can create their own private workspace for free. Matchday is becoming **Rostr Coach**. The first visit after a quiet period can take up to a minute while the server wakes up.  
> Built by [Rostr EdTech](https://rostr.one): custom software designed around your process. Source published for transparency; see [LICENSE](LICENSE).

> **Status lives in TODO.md, not here.** This file only covers setup/usage — see `TODO.md` for what's
> built so far and what's next, and `CONTEXT.md` for the architecture and why it's built this way.

A soccer team-management platform with two sides:

- **For coaches**: manage your roster (positions, jersey numbers, injury status), build starting
  lineups on a drag-and-drop tactical board with common presets (4-4-2, 4-3-3, 4-2-3-1, 3-5-2,
  3-4-3, 5-3-2), schedule matches, and plan substitutions with a per-period timeline that tracks
  total playing time per athlete.
- **For athletes**: a limited portal (`/portal`) to see their team(s) and any feedback a coach has
  chosen to share.

Each **head coach** who signs up gets their own independent, private workspace — their own teams,
athletes, and lineups, invisible to every other coach's workspace by default. A head coach can
explicitly grant a colleague **assistant coach** access to one or more of their specific teams for
real collaboration; that grant never widens beyond the teams it names.

Forked from [class_copilot](../class_copilot) — see `CONTEXT.md` for the full domain mapping and why
that base (not the CRM root both class_copilot and college-counseling forked from) was reused here.
Kept fully independent: its own repo, own database, no shared runtime with class_copilot or the
student-check-in app (Rostr).

---

## Roles

| Role | Sees | Can do |
|---|---|---|
| **Head Coach** | Their own workspace only — teams/athletes they created, plus any team an explicit assistant-coach grant gives them | Manage their own teams & athletes, assign assistant coaches, generate athlete invite links, the tactical board, the match planner, manage their own assistant-coach accounts |
| **Assistant Coach** | Only the teams they're assigned to (or every team taught by the one head coach who created their account, if granted all-access — never platform-wide) | Manage rosters, build lineups, and plan matches for their assigned teams only |
| **Athlete** | Only their own data, via `/portal` | See their own team(s) and any feedback a coach chose to share |

An athlete gets portal access via a one-time invite link a coach generates (they choose their own
email/password when they open it) — a coach never sets or sees an athlete's password.

---

## Run it locally (no online services, no API keys)

The app is **local-first**: it runs entirely on a local **SQLite** database with seeded demo data.

```bash
cd matchday
npm install

# Create your local env (SQLite + a generated AUTH_SECRET):
cp .env.example .env
node -e "console.log('AUTH_SECRET=\"'+require('crypto').randomBytes(32).toString('hex')+'\"')"
# → paste that AUTH_SECRET into .env (DATABASE_URL is already file:./dev.db)

npm run db:push      # create the SQLite schema
npm run db:seed      # head coach + 2 assistant coaches + 2 teams + 18 demo athletes
npm run dev          # http://localhost:3000
```

`npm run build` compiles the whole app; `npm run db:reset` wipes + reseeds (destructive — only ever
run this against your local dev database).

### Demo logins (password `ChangeMe123!` for all)

| Role | Email |
|---|---|
| Head Coach | `coach@matchday.test` |
| Assistant Coach | `assistant1@matchday.test` (Varsity) / `assistant2@matchday.test` (JV) |
| Athlete | `ava@athlete.test` / `liam@athlete.test` / `noor@athlete.test` / `caleb@athlete.test` |

Several demo athletes are seeded without a portal login, to demonstrate the "athlete exists before
being invited" state. Or go to `/signup` to create a brand-new, separate coach workspace of your own
instead of using the seeded one.

Bulk athlete-invite emails (the "Send invite links to all" button on a team's roster page) need a
Gmail address + App Password added from `/admin/settings` — without one, invite **links** still work
fine, a coach just shares them manually.

---

## Using the tactical board & match planner

1. **Roster** (`/admin/teams/[id]`) — add athletes to a team, set positions/jersey numbers/injury
   status.
2. **Tactical Board** (`/teams/board`) — pick a formation, drag athletes from the bench onto a slot,
   drag one slot onto another to swap, drag a slot back to the bench to unassign. Save multiple
   named lineups per team.
3. **Matches** (`/teams/matches`) — schedule a match (opponent, date, number/length of periods).
4. **Match planner** (`/teams/matches/[id]/plan`) — for each period, start from a saved lineup (or
   carry over who was on at the end of the previous period), then log substitutions (player off,
   player on, minute). A running total-minutes-per-athlete panel flags anyone who hasn't played yet.
5. **Attendance** (`/teams/attendance`) — start a practice and every active roster athlete defaults
   to Present; tap a name to cycle Present → Late → Absent. "Mark all present" resets the whole
   list in one tap.

---

## Tech

Next.js 15 (App Router) · React 18 · TypeScript · Tailwind + a hand-built shadcn-style UI kit ·
Prisma (SQLite local / Postgres-ready) · custom JWT auth (jose + bcrypt) · Zod · lucide-react.

### Security (enforced server-side)

- **The access-control spine** — `src/lib/access.ts` (`assertCanAccessAthlete`/`assertCanAccessTeam`,
  `accessibleAthleteIds`/`accessibleTeamIds`, `athleteScopeWhere`/`teamScopeWhere`/
  `athleteIdScopeWhere`/`taskScopeWhere`) is called by every athlete- and team-scoped action, query,
  and API route. Each head coach (`OWNER`) is scoped to teams they coach or hold an explicit
  assistant-coach grant on, and athletes they created or who are rostered on those teams — never
  "every team/athlete in the database." An assistant coach (`ASSISTANT`) is scoped to their assigned
  teams (or their one owning head coach's teams, if granted all-access — never platform-wide).
- **`src/actions/users.ts`'s `requireOwnedAssistant`** — every account-management action (role
  change, deactivate, delete, password reset) can only ever target an `ASSISTANT` the calling head
  coach personally created; it can never touch another coach's account.
- **Required `AUTH_SECRET`** (no fallback), short session TTL + a `sessionVersion` check so
  role/deactivation changes revoke stale sessions immediately, not just on next expiry.
- **Encrypted-at-rest invite-email credentials** (`src/lib/crypto.ts`/`settings.ts`) when set from
  `/admin/settings` instead of `.env`.
- **A preloaded roster allowlist gates who can get an account** (`src/lib/allowed-email.ts`,
  managed from `/admin/settings`) — set `ALLOWED_EMAIL_DOMAIN` to restrict sign-up to the program's
  domain, and preload approved staff/athlete emails so `/signup` can't be used to create a rogue
  head-coach account, and an athlete record's email can't be set to an address the program hasn't
  verified. Bootstrap-friendly — an empty roster just means the domain check (if any) is the only
  gate, so the first admin can still sign up before preloading anything.
- **Login/signup/invite-accept are rate-limited** (`src/lib/rate-limit.ts`, in-memory/per-process —
  fine for this app's single-instance deployment), to blunt scripted password-guessing without
  adding friction to normal use.
- Passwords require 8+ characters plus a number and a special character (`src/lib/validations.ts`).

Run the isolation + domain tests:
```bash
node --env-file=.env --import tsx scripts/isolation-test.mts
node --env-file=.env --import tsx scripts/multi-tenant-isolation-test.mts
node --env-file=.env --import tsx scripts/feedback-test.mts
node --env-file=.env --import tsx scripts/roster-import-test.mts
node --env-file=.env --import tsx scripts/attendance-test.mts
node --env-file=.env --import tsx scripts/assistant-invite-test.mts
node --env-file=.env --import tsx scripts/athlete-login-test.mts
```

---

## Deploying to Render (Postgres)

`render.yaml` at the repo root is a [Render Blueprint](https://render.com/docs/blueprint-spec) that
provisions both the web service and its own dedicated Postgres database in one step — fully
independent of any other app's database or Postgres instance (see CONTEXT.md's Ninth pass for why a
shared-instance option was considered and rolled back):

1. Push this repo to GitHub (see "push and commit" below — needs its own remote).
2. Render dashboard → **New** → **Blueprint** → pick this repo. Render reads `render.yaml` and
   creates the `matchday` web service and the `matchday-db` Postgres database together.
3. Fill in the secrets Render leaves blank (`sync: false` in the blueprint) on the web service's
   **Environment** tab:
   - `AUTH_SECRET` — a fresh random value (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) — **do not reuse** the one from your local `.env`.
   - `NEXTAUTH_URL` — the `https://your-app.onrender.com` URL Render assigns (or your custom domain).
   - `ALLOWED_EMAIL_DOMAIN` — optional, see `src/lib/allowed-email.ts`.
   - `GMAIL_SMTP_USER` / `GMAIL_SMTP_APP_PASSWORD` — optional, for bulk invite emails; can also be set later from `/admin/settings` instead.
4. Deploy. The build step temporarily switches `prisma/schema.prisma` to `provider = "postgresql"`
   inside Render's build container (see the comment at the top of `render.yaml` for why this never
   touches the committed file — local dev keeps using SQLite), then `preDeployCommand` runs
   `prisma db push` against the new Postgres database, followed by `prisma/seed-formations.ts` — this
   always (re-)inserts the 6 built-in tactical-board formation presets, on every deploy, whether or
   not you ever run the full demo seed below. They're global reference data, not demo data, so a real
   coach's workspace still gets them without fake athletes showing up anywhere.
5. Optionally seed demo data the same way local dev does — open a shell on the Render service and
   run `npx tsx prisma/seed.ts` — or skip this for a real coach's workspace and just sign up at
   `/signup` instead.

**If formation presets are missing on an already-deployed instance** (this shipped after some earlier
deploys — see CONTEXT.md's Eleventh pass): open a shell on the Render service and run
`npx tsx prisma/seed-formations.ts` once — you don't need to wait for a redeploy, and it's safe to
re-run any time (it only upserts by name, never duplicates).

**Schema changes after the first deploy**: `prisma db push` in `preDeployCommand` re-applies
automatically on every deploy, but it *refuses* (failing that deploy step, not the running app) if a
change would drop data with real rows in it — Render's own safety net on top of the one already
built into `db push`. A change like that needs a human to run it deliberately (Render shell, or your
own machine pointed at `DATABASE_URL`), or a move to tracked `prisma migrate` migrations if this
grows past the "solo coach's tool" stage — there's no `prisma/migrations/` folder yet, only `db push`.
