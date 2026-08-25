# Handoff — continuing this build in a local Claude Code session

This file exists because the session that built the platform ran in a cloud
sandbox whose network policy blocks `*.supabase.co`. Everything here was
therefore verified against a **local** PostgreSQL, never against the live
Supabase project. A local session can close that gap.

## Getting set up

```sh
git clone https://github.com/Rafops71/Platform.git
cd Platform
cp .env.example .env      # then fill in the two secrets — see below
```

Then start Claude Code in that directory and point it at this file.

### Filling in .env

`.env` is git-ignored (verified: `git check-ignore .env` matches). Never commit
it, never paste its contents into a chat.

| Variable | Where to get it | Sensitivity |
|---|---|---|
| `SUPABASE_URL` | already filled in | public |
| `SUPABASE_PUBLISHABLE_KEY` | already filled in | public — it is in `js/supabase-config.js` too |
| `SUPABASE_SERVICE_ROLE_KEY` | Dashboard → Project Settings → API → service_role | **bypasses RLS — full access** |
| `SUPABASE_DB_URL` | Dashboard → **Connect** → connection string | **full database access** |

Copy `SUPABASE_DB_URL` exactly as the dashboard shows it. Supabase has changed
the host and username format over time (direct vs. pooler, `postgres` vs.
`postgres.<ref>`), so the dashboard is the authority — do not compose it by hand.

`psql` is required:
- macOS: `brew install libpq && brew link --force libpq`
- Ubuntu/Debian: `sudo apt install postgresql-client`

## Scripts (all tested end-to-end against a local PostgreSQL)

```sh
./scripts/apply-sql.sh                    # apply all SQL, in order
./scripts/apply-sql.sh 002_updates.sql    # or just specific files
./scripts/verify-live.sh                  # READ-ONLY health check — safe on production
./scripts/bootstrap-operator.sh           # promote OPERATOR_EMAIL to Operator
```

`verify-live.sh` creates and changes nothing — it only reads catalog tables and
counts rows. It reports whether each table exists and has RLS on, whether every
security function and trigger is present, and specifically whether the two known
bugs are fixed in the live database. That last check was itself tested by
installing the broken policy and confirming the script flags it.

## Current state

Applied to the live project already (by Rafael, manually):
- `sql/schema.sql`
- `sql/rls_policies.sql` — **an older version**, before the two fixes below

**Not yet applied to the live project:**
- `sql/002_updates.sql` ← contains both bug fixes; required
- `sql/seed_commodities.sql` ← the 22-commodity list

So the first job in a local session is:

```sh
./scripts/verify-live.sh      # expect: mailbox fix "NOT FIXED", commodities 0
./scripts/apply-sql.sh 002_updates.sql seed_commodities.sql
./scripts/verify-live.sh      # expect: both fixes "FIXED", commodities 22
```

Rafael's Operator account already exists and was promoted manually using a
`set session_replication_role = replica;` workaround, which is no longer needed
once `002_updates.sql` is applied.

## The two bugs already found and fixed

Both were found by executing the SQL, not by reading it. Neither is visible on
inspection.

1. **Privilege escalation.** `protect_profile_columns` exempted callers using a
   `current_user` check. Inside a `SECURITY DEFINER` function `current_user` is
   the function's *owner*, not the caller — so the exemption applied to
   everyone, and a participant could set their own `role='operator'`. Now keyed
   on `auth.uid() IS NULL`.
2. **Mailbox forwarding silently dead.** `messages_select` correlated on a bare
   `id`, which binds to `message_forward_log.id`, not `messages.id` — so the
   condition was `f.message_id = f.id`, never true. Operators could forward a
   message and the recipient would never see it.

## What still needs live verification

The local test suite (`sql/tests/`, 38 PASS / 0 FAIL) uses a **stub** for
`auth.users` and `auth.uid()`. These behaviours depend on the real Supabase Auth
and have never been exercised:

- [ ] Real signup through `register.html` fires `handle_new_user` and creates a
      `pending` profile.
- [ ] Supabase's real `auth.uid()` makes `is_operator()` / `current_profile_id()`
      resolve correctly under PostgREST (the local stub reads a session GUC —
      this is the single biggest untested assumption).
- [ ] "Confirm email" being off really does return a session from `signUp()`, so
      `mark_invitation_used` can consume the token in one pass.
- [ ] A participant hitting the REST API directly cannot escalate — the local
      tests used `SET ROLE`, which is close to but not identical to how
      PostgREST switches roles.
- [ ] End-to-end: invite → register → approve → create listing → browse
      anonymously → contact → forward → reply.
- [ ] Both GitHub Actions workflows actually succeed (`heartbeat`, `reminders`).

## Deliberately not built

Email notifications (Section 12). Agreed scope is in-platform notifications
only. Supabase Auth's built-in email covers auth flows (signup, password reset)
but not custom notification email; wiring that up needs a provider decision.

## Still needed from Rafael

- Rodrigo's email, to create the second Operator account.
