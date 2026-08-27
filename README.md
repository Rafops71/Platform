# Jericho Platform

A private, invitation-only listing and matching-facilitation platform for physical
commodity brokers. Participants publish anonymous Sell Offers and Buy Requests;
Operators privately match counterparties behind the scenes. Not a trading exchange —
no trades are executed here.

For a functional description aimed at a non-technical reader, see
`JERICHO_PLATFORM_PRODUCT_REVIEW.md`. For a full technical description written to
stand alone, see `JERICHO_PLATFORM_AI_REVIEW.md`. This README covers setup and
deployment only.

## Stack

Supabase (Postgres + Auth) · vanilla HTML/CSS/JS (no frameworks, no build step) ·
GitHub Pages · GitHub Actions · Resend (notification email) · Playwright and a
local embedded Postgres for tests.

## Setup — do this in order

### 1. Database

Apply the SQL in order. Either run the files in the Supabase Dashboard → SQL
Editor, or use the script, which knows the order:

```sh
cp .env.example .env      # then fill it in — see "Environment" below
npm install
npm run apply-sql         # applies everything, in order
npm run apply-sql -- 009_message_threading.sql   # or just specific files
```

The order is:

1. `sql/schema.sql` — all tables and indexes.
2. `sql/rls_policies.sql` — every trigger, security-definer function, and Row
   Level Security policy that enforces the anonymity/role model. This is where
   the actual security lives — not in the frontend.
3. `sql/002_updates.sql` — bug fixes, the backend-enforced audit log, and
   in-platform notifications. **Required**, including on a fresh install.
4. `sql/003_email_notifications.sql` — the email outbox and the triggers that
   queue into it.
5. `sql/004_email_outbox_retry.sql` — retry/failure bookkeeping, so a
   permanently failing recipient is not retried forever.
6. `sql/005_confirmed_updates.sql` — invitation emails, invitation edit/delete,
   and the origin/unit dropdown data.
7. `sql/006_checklist_and_price_unit.sql` — the revised document checklist and
   the listing price-unit field.
8. `sql/007_commodities_alphabetical.sql` — commodity sort order.
9. `sql/008_email_language.sql` — the email template/phrase dictionary and
   per-recipient language selection.
10. `sql/009_message_threading.sql` — `messages.in_reply_to`, which is what lets
    an Operator route a reply back to the person who asked.
11. `sql/seed_commodities.sql` — the standard commodity list. **Last**, because
    step 8 reorders what it inserts.

All files are safe to re-run (guarded with `if not exists` / `or replace`).

To check what is actually live at any point:

```sh
npm run verify-live       # READ-ONLY. Safe against production.
```

### 2. First Operator account

Nobody can self-register as an Operator — every signup is hardcoded to
`role='participant'`, `status='pending'` (see `handle_new_user()` in
`rls_policies.sql`). Bootstrapping the first Operator is a manual, one-time step:

1. Register normally through the deployed app (`register.html`) using the
   Operator's real email.
2. In the SQL Editor, run `sql/first_operator.sql` (edit the email in it first if
   promoting someone other than the intended first Operator).

Once one Operator exists, further Operators can be promoted from the Users page
in the app — no SQL needed.

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

- `SUPABASE_URL` — used by all three workflows.
- `SUPABASE_ANON_KEY` — the publishable key from step 4, used by the heartbeat.
- `SUPABASE_SERVICE_ROLE_KEY` — from Supabase Dashboard → Project Settings →
  API. Used by `reminders.yml` and `send-emails.yml`. This key bypasses RLS —
  it must only ever live in this GitHub secret, never in a repo file.
- `RESEND_API_KEY` — used by `send-emails.yml` to actually send queued mail.
- `LISTING_EMAIL_FROM` — the sender address for notification email.

Three scheduled workflows:

- `heartbeat.yml` — pings Supabase every 3 days to prevent free-tier pause.
- `reminders.yml` — runs daily, flags listings older than 30 days.
- `send-emails.yml` — runs every 5 minutes, flushes `email_outbox` through
  Resend.

### Environment

`.env` is git-ignored and must never be committed or pasted into a chat.
`.env.example` lists the variable names. Two of them grant full access to the
database and bypass Row Level Security entirely:

| Variable | Sensitivity |
|---|---|
| `SUPABASE_URL` | public |
| `SUPABASE_PUBLISHABLE_KEY` | public — it is in `js/supabase-config.js` too |
| `SUPABASE_SERVICE_ROLE_KEY` | **bypasses RLS — full access** |
| `SUPABASE_DB_URL` | **full database access** |
| `RESEND_API_KEY` | can send mail as the configured sender |
| `LISTING_EMAIL_FROM` | configuration |
| `OPERATOR_EMAIL` | configuration |

Copy `SUPABASE_DB_URL` exactly as the Supabase dashboard shows it. Supabase has
changed the host and username format over time (direct vs. pooler, `postgres`
vs. `postgres.<ref>`), so the dashboard is the authority — do not compose it by
hand.

## File structure

```
/platform/
├── sql/
│   ├── schema.sql                    tables + indexes
│   ├── rls_policies.sql              RLS, triggers, security-definer functions
│   ├── 002_updates.sql … 009_…       ordered migrations (see setup step 1)
│   ├── seed_commodities.sql          standard commodity list
│   ├── first_operator.sql            one-time Operator bootstrap
│   └── tests/                        local Postgres security suite
├── css/
│   └── styles.css
├── js/
│   ├── supabase-config.js            Supabase client init
│   ├── utils.js                      shared helpers, constants, doc checklist
│   ├── i18n.js                       English/Spanish dictionary + switching
│   ├── auth.js                       login / register / invitation flow
│   ├── app.js                        participant dashboard
│   └── operator.js                   operator dashboard
├── scripts/
│   ├── apply-sql.js                  apply SQL in order
│   ├── verify-live.js                read-only live health check
│   ├── run-sql-tests.js              SQL security suite runner
│   ├── send-listing-emails.js        flush email_outbox via Resend
│   ├── q.js                          ad-hoc query helper
│   └── db.js                         shared connection helper
├── tests/e2e/                        Playwright suite + fixtures
├── .github/workflows/
│   ├── heartbeat.yml                 keep-alive ping, every 3 days
│   ├── reminders.yml                 30-day stale-listing check, daily
│   └── send-emails.yml               outbox flush, every 5 minutes
├── index.html                        login
├── register.html                     invitation-only registration
├── app.html                          participant dashboard
├── operator.html                     operator dashboard
├── JERICHO_PLATFORM_AI_REVIEW.md     standalone technical description
└── JERICHO_PLATFORM_PRODUCT_REVIEW.md  standalone product description
```

## Testing

```sh
npm run test:sql      # SQL security suite, against a throwaway local Postgres
npm run e2e           # Playwright, against the LIVE Supabase project
npm run e2e:headed    # the same, with a visible browser
```

**Current: 88 SQL assertions and 51 E2E tests, all passing.**

### SQL security suite

`sql/tests/` runs the real SQL scripts against a local PostgreSQL that the
runner starts and throws away, and asserts the security rules hold — see
`sql/tests/README.md`. It covers identity and role rules, listings and
anonymity, the matching engine, the activity log and notifications, mailbox
anonymity, the document checklist, invitation security, document requests,
language preference, the registration and approval emails, the email dictionary
and its fallbacks, and message threading.

That suite found two real bugs that code review had missed: a `current_user`
check inside a `SECURITY DEFINER` function that let a participant promote
themselves to Operator, and an RLS sub-query that bound a bare `id` to the wrong
table so forwarded messages never arrived.

### Playwright E2E suite

`tests/e2e/` drives a real browser against the **live** Supabase project,
because Supabase Auth is cloud-hosted and has no local stand-in. Every account,
listing, and message it creates is prefixed `jericho-e2e-` and torn down again,
and a test asserts the teardown actually happened. Playwright ships its own
Chromium, so no system browser is needed.

It covers the full lifecycle (invite → register → approve → listing → browse →
contact → forward → reply), the brokered mailbox in depth including multi-turn
threading, the bilingual interface, recipient-language email selection, and unit
dropdown ordering. No email is dispatched at any point: creating a listing
queues outbox rows by design, nothing flushes them, teardown deletes them, and a
test asserts no test row ever got a `sent_at`.

> Read `tests/e2e/helpers/fixtures.js` before pointing this at any database
> whose contents matter.

## Status

All features are implemented and verified against the live project: invitation
flow, Operator approval, listings with reference numbers, the document
checklist, the brokered mailbox with threaded replies, in-platform
notifications, notification email in the recipient's language, the bilingual
participant interface, commodity management, the activity log, and the match
suggestion engine.

**Known open items:**

- **The Resend sending domain is not yet verified.** Until it is, the sandbox
  sender only delivers to the Resend account owner's own address; any other
  recipient is rejected with an HTTP 403. The pipeline itself works — this is an
  account configuration step, not a code defect.
- **Disclosure asymmetry between browse and email.** Browse withholds
  `specification`, `price_conditions` and `notes` and generalises origin to a
  region; the new-listing email sends all of them verbatim. Both were asked for,
  but together they mean an email reader learns more than a browser does. Needs
  a product decision.
- Four E2E specs carry near-identical `signIn`/`openScreen` helpers that should
  be extracted into `tests/e2e/helpers/`.
