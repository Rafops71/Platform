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

### 3. Frontend config

`js/supabase-config.js` holds the Supabase Project URL and the **publishable**
key only (never the service role key — that stays out of any file in this repo).

### 4. GitHub Pages

Repo Settings → Pages → Deploy from branch `main`, root. The site is fully static.

### 5. Heartbeat workflow (keeps the free-tier Supabase project active)

`.github/workflows/heartbeat.yml` needs two repo secrets (Settings → Secrets and
variables → Actions):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (the same publishable key from step 3)

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
│   └── heartbeat.yml
├── index.html                 login
├── register.html              invitation-only registration
├── app.html                   participant dashboard
├── operator.html               operator dashboard
└── README.md
```

## Status

Build in progress. See commit history for what's actually implemented so far —
this README will be kept current, not aspirational.
