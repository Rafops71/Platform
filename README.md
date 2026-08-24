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

1. `sql/schema.sql` — creates all tables and indexes.
2. `sql/rls_policies.sql` — creates every trigger, security-definer function, and
   Row Level Security policy that enforces the anonymity/role model. This is where
   the actual security lives — not in the frontend.

Both files are safe to re-run (guarded with `if not exists` / `or replace`).

### 2. First Operator account

Nobody can self-register as an Operator — every signup is hardcoded to
`role='participant'`, `status='pending'` (see `handle_new_user()` in
`rls_policies.sql`). Bootstrapping the first Operator is a manual, one-time step:

1. Register normally through the deployed app (`register.html`) using the
   Operator's real email.
2. In the SQL Editor, run `sql/first_operator.sql` (edit the email in it first if
   promoting someone other than Rafael).

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
│   ├── schema.sql            tables + indexes
│   ├── rls_policies.sql      RLS, triggers, security-definer functions
│   └── first_operator.sql    one-time Operator bootstrap
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

## Status

Build in progress. See commit history for what's actually implemented so far —
this README will be kept current, not aspirational. Not yet independently
tested end-to-end against a live Supabase project — see the Testing section
that will be added once the schema is live and a real run-through has
happened.
