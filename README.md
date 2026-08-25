# Jericho Platform

A private, invitation-only listing and matching-facilitation platform for physical
commodity brokers. Participants publish anonymous Sell Offers and Buy Requests;
Operators privately match counterparties behind the scenes. Not a trading exchange —
no trades are executed here.

Full functional/security specification: see project history (Section 1–21 spec).
This README covers setup and deployment only.

## Stack

Supabase (Postgres + Auth) · vanilla HTML/CSS/JS (no frameworks, no build step) ·
GitHub Pages · GitHub Actions (heartbeat).

## Setup — do this in order

### 1. Database

In the Supabase Dashboard → SQL Editor, run, in this exact order:

1. `sql/schema.sql` — all tables and indexes.
2. `sql/rls_policies.sql` — every trigger, security-definer function, and Row
   Level Security policy that enforces the anonymity/role model. This is where
   the actual security lives — not in the frontend.
3. `sql/002_updates.sql` — bug fixes and the backend-enforced audit log and
   notifications. **Required**, including on a fresh install.
4. `sql/seed_commodities.sql` — loads the standard commodity list.

All files are safe to re-run (guarded with `if not exists` / `or replace`).

### 2. First Operator account

Nobody can self-register as an Operator — every signup is hardcoded to
`role='participant'`, `status='pending'` (see `handle_new_user()` in
`rls_policies.sql`). Bootstrapping the first Operator is a manual, one-time step:

1. Register normally through the deployed app (`register.html`) using the
   Operator's real email.
2. In the SQL Editor, run `sql/first_operator.sql` (edit the email in it first if
   promoting someone other than Rafael).

Once one Operator exists, further Operators can be promoted from the Users page
in the app — no SQL needed.

> If you ran an earlier version of these scripts, this UPDATE appeared to
> succeed while silently changing nothing, and the workaround was
> `set session_replication_role = replica;`. That is fixed in
> `002_updates.sql`; the plain UPDATE now works.

### 3. Required Auth setting

In Supabase Dashboard → Authentication → Sign In / Providers → Email, turn
**"Confirm email" OFF**.

Why this matters: `register.html` calls the `mark_invitation_used` database
function immediately after `signUp()`, using the session that call creates.
If email confirmation is required, `signUp()` returns no session (the user
isn't authenticated until they click the confirmation link), so there's
nothing to call that function with and the invitation token wouldn't get
consumed. With confirmation off, signup produces an active session
immediately, exactly matching this flow. (Operator approval is still a
separate, mandatory gate — turning this off does not let anyone use the
platform without being approved.)

### 4. Frontend config

`js/supabase-config.js` holds the Supabase Project URL and the **publishable**
key only (never the service role key — that stays out of any file in this repo).

### 5. GitHub Pages

Repo Settings → Pages → Deploy from branch `main`, root. The site is fully static.

### 6. GitHub Actions secrets

Settings → Secrets and variables → Actions:

- `SUPABASE_URL` — used by both workflows below.
- `SUPABASE_ANON_KEY` — the publishable key from step 4, used by the heartbeat.
- `SUPABASE_SERVICE_ROLE_KEY` — from Supabase Dashboard → Project Settings →
  API. Used only by `reminders.yml` to call the service-role-restricted
  `send_listing_reminders()` function. This key bypasses RLS — it must only
  ever live in this GitHub secret, never in a repo file.

Two scheduled workflows:
- `heartbeat.yml` — pings Supabase every 3 days to prevent free-tier pause.
- `reminders.yml` — runs daily, flags listings older than 30 days
  (Section 12).

## File structure

```
/platform/
├── sql/
│   ├── schema.sql             tables + indexes
│   ├── rls_policies.sql       RLS, triggers, security-definer functions
│   ├── 002_updates.sql        fixes + audit-log/notification triggers
│   ├── seed_commodities.sql   standard commodity list
│   ├── first_operator.sql     one-time Operator bootstrap
│   └── tests/                 local Postgres security suite
├── css/
│   └── styles.css
├── js/
│   ├── supabase-config.js    Supabase client init
│   ├── utils.js               shared helpers (auth guard, formatting, toasts)
│   ├── auth.js                login / register / invitation flow
│   ├── app.js                 participant dashboard
│   └── operator.js            operator dashboard
├── .github/workflows/
│   ├── heartbeat.yml          keep-alive ping, every 3 days
│   └── reminders.yml          30-day stale-listing check, daily
├── index.html                 login
├── register.html              invitation-only registration
├── app.html                   participant dashboard
├── operator.html               operator dashboard
└── README.md
```

## Design notes / where this reads between the lines of the spec

- **"Region" in the anonymous listing view** reuses the listing's
  origin/destination field — there's no separate region column in the data
  model, so participants should enter a region/country there rather than a
  precise address.
- **`notifications` table** isn't in the spec's suggested table list
  (Section 17) but is added because Section 12's in-platform notifications
  need somewhere to live.
- **Mailbox "sender reference"**: the spec's mailbox flow (Section 11)
  mentions the recipient seeing the sender's anonymous reference number.
  There's no hidden identity-resolution mechanism — the `subject` field on a
  message is available for the sender to note their own reference if
  relevant; nothing automatic infers or attaches it.

## Testing

`sql/tests/` holds a suite that runs the real SQL scripts against a local
PostgreSQL and asserts the security rules hold — see `sql/tests/README.md`.
**38 PASS / 0 FAIL** at the last run, covering: self-registration always landing
as participant/pending, participants being unable to escalate role/status/email,
listings being readable only by their owner or an Operator, the anonymous view
exposing no `user_id`, mailbox messages reaching a recipient only after an
Operator forwards them, invitation tokens being unlistable and single-use, and
the activity log and matches being Operator-only.

That suite found two real bugs that code review had missed: a `current_user`
check inside a `SECURITY DEFINER` function that let a participant promote
themselves to Operator, and an RLS sub-query that bound a bare `id` to the wrong
table so forwarded messages never arrived.

The frontend is exercised with Playwright against a stubbed Supabase REST layer
(20/20 interaction checks; both dashboards, every tab, no JS errors; responsive
checks at 375/412/1280px with no horizontal overflow and every tap target
≥36px).

**Not yet verified:** none of this has been run against the live Supabase
project. The sandbox this was built in blocks `*.supabase.co`, so the live
signup → approval → listing → mailbox path still needs a real run-through.

## Status

All features in Sections 5–17 of the specification are implemented. Email
notifications (Section 12) are deliberately **not** implemented — in-platform
notifications only, per the agreed scope.
