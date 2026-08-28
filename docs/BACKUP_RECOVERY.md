# Backup & Recovery

What exists in more than one place, what exists in only one, and what to do
when something is lost.

The short version: **the code is safe, the schema is safe, the data is only as
safe as your Supabase plan, and `.env` exists nowhere but this laptop.**

---

## 1. What Supabase backs up

The database lives in Supabase project `coarclhafggkakmpggfh`. Supabase takes
its own backups, but **how far back you can go depends on the plan**, and the
plan is the thing to check before trusting any of this:

| Plan | What you get |
| --- | --- |
| Free | Daily backups, short retention, no point-in-time recovery. On some free projects backups are not restorable by self-service at all. |
| Pro | Daily backups with longer retention, plus optional Point-in-Time Recovery (PITR) as a paid add-on. |

> **Verify this before you need it.** Dashboard → Project Settings → Database →
> Backups. If that page shows no restorable backup, everything in section 5 that
> depends on Supabase restoring for you does not apply, and the recovery you
> actually have is "re-create the schema and lose the data".

A Supabase backup covers the whole Postgres instance, which importantly
includes the **`auth` schema** — the actual user accounts. That matters because
nothing in this repository can recreate a user account.

What Supabase does **not** back up: your `.env`, your GitHub repo, or anything
on this laptop.

## 2. What is stored in GitHub

Remote: `https://github.com/Rafops71/Platform.git`, branch `main`.

Everything that defines the platform is committed:

- **Schema and migrations** — `sql/schema.sql`, `sql/rls_policies.sql`, and
  `sql/002_*` … `sql/015_*`, plus `sql/seed_commodities.sql`.
- **The whole front end** — `*.html`, `css/`, `js/`.
- **Scripts** — `scripts/` (apply-sql, verify-live, q, send-listing-emails,
  bootstrap-operator).
- **Tests** — `tests/e2e/` and `sql/tests/`.
- **Automation** — `.github/workflows/` (heartbeat, reminders, send-emails).
- **Docs** — `README.md`, `HANDOFF.md`, and this `docs/` directory.

GitHub Actions secrets are configured separately from the repo and are **not**
in a backup you control. They are: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `RESEND_API_KEY`,
`LISTING_EMAIL_FROM`. If the repo is ever recreated, these must be re-entered by
hand — you cannot read them back out of GitHub afterwards.

## 3. What local files matter

Only one file is irreplaceable, and it is deliberately not in git:

- **`.env` — the one to worry about.** It holds `SUPABASE_SERVICE_ROLE_KEY` and
  `SUPABASE_DB_URL`, each of which bypasses Row Level Security completely and
  grants full read/write to every table, including the real identities behind
  anonymous listings. It is git-ignored on purpose. **It exists on this laptop
  and nowhere else.**
  - Keep a copy in a password manager, not in cloud storage, not in a chat, not
    in a screenshot.
  - Every value in it can be regenerated from the Supabase dashboard if lost,
    so losing it is an inconvenience, not a disaster. Leaking it is the
    disaster. If it leaks, rotate both secrets immediately (Dashboard →
    Project Settings → API → rotate service key; and change the database
    password) and update the GitHub Actions secrets to match.
  - `.env.example` **is** committed and documents every key with instructions.
    Recovering `.env` means copying that file and refilling the two secrets.

- **`test-results/`** — Playwright output. Git-ignored, and should stay that
  way: traces and screenshots from a failed run can contain session tokens and
  test-account contents. **Disposable.** Never back it up; delete it freely.

- **`node_modules/`** — disposable, `npm install` rebuilds it.

Nothing else on the laptop is unique. The working tree is a clone.

## 4. How to restore the database

There are two different situations and they have different answers. Decide
which one you are in first.

### 4a. The data is intact, the schema is wrong

Something was dropped, a migration went badly, an object is missing. You do not
need a backup — the repo is the source of truth for structure.

```bash
node scripts/verify-live.js            # what is actually there now
node scripts/apply-sql.js              # re-apply everything, in order
node scripts/verify-live.js            # confirm
```

`apply-sql.js` applies `schema.sql`, `rls_policies.sql`, `002` … `015`, then
`seed_commodities.sql`, in that order. **Every statement in those files is
guarded** (`create or replace`, `drop … if exists`, `add column if not
exists`), so re-running the whole set against a working database is safe and
idempotent. Each file is sent as one multi-statement query, so a file that
fails partway rolls itself back rather than leaving half a migration applied.

To apply just one file:

```bash
node scripts/apply-sql.js 015_operator_analytics.sql
```

### 4b. The data is gone

Rows deleted, tables truncated, project damaged. **The repo cannot help you
here** — it recreates empty structure, not content, and it cannot recreate a
single user account. You need Supabase's own backup.

1. Dashboard → Project Settings → Database → Backups.
2. Restore the most recent backup from **before** the damage. Read the
   timestamp carefully; restoring the wrong one silently overwrites good data
   with older data.
3. If PITR is enabled, prefer it — pick the moment just before the damage
   rather than losing a whole day.
4. After the restore, run `node scripts/apply-sql.js` to bring the schema up to
   the current migration level, in case the backup predates recent migrations.
5. Work through section 6.

If there is no restorable backup, the honest position is that the data is lost
and the platform restarts empty: apply the SQL, bootstrap an operator with
`scripts/bootstrap-operator.sh`, and re-invite everyone.

## 5. How to restore the repo if the laptop fails

The repo is on GitHub, so this is short:

```bash
git clone https://github.com/Rafops71/Platform.git
cd Platform
npm install
npx playwright install chromium
cp .env.example .env
#   then fill in SUPABASE_SERVICE_ROLE_KEY and SUPABASE_DB_URL from the
#   Supabase dashboard, and RESEND_API_KEY from resend.com/api-keys
node scripts/verify-live.js
```

That is the entire local setup. The only step that needs anything not in the
clone is `.env`, and `.env.example` tells you where each value comes from.

**Check before you trust the clone:** `git log --oneline -5` on the new machine
should show the same tip commit as the old one. Anything committed but never
pushed died with the laptop. This project commits straight to `main` and pushes
on request, so an unpushed commit is a real possibility — `git status` and
`git log origin/main..HEAD` on the old machine, while it still works, is the
cheapest insurance there is.

## 6. What to check after recovery

Work down this list. It is ordered so that a failure early explains the
failures after it.

1. **Structure** — `node scripts/verify-live.js`. Every table present with
   `RLS on`, every security function `present | definer`, all ten triggers
   present, and both bug-fix checks reading `FIXED`. RLS showing as off on any
   table is an emergency: it means anonymity is not being enforced.
2. **Migration level** — confirm the newest migration's objects exist. Today
   that is `sql/015`: `operator_analytics()` and `reviewed_at` on both
   `messages` and `matches`.
   ```bash
   node scripts/q.js "select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname='operator_analytics'"
   ```
3. **Policy counts** — `verify-live.js` prints policies per table. A table that
   lost its policies still answers queries; it just answers them for everyone.
4. **Accounts** — at least one approved operator must exist, or nobody can
   administer anything:
   ```bash
   node scripts/q.js "select count(*) from public.profiles where role='operator' and status='approved'"
   ```
   If it returns 0, run `scripts/bootstrap-operator.sh`.
5. **The email outbox** — check nothing is queued that would re-send on the
   next workflow run:
   ```bash
   node scripts/q.js "select count(*) from public.email_outbox where sent_at is null and failed_at is null"
   ```
   A restore can resurrect already-sent rows as unsent. Inspect before letting
   `send-listing-emails` run.
6. **Both suites** — `node scripts/run-sql-tests.js` (local, safe) and
   `npx playwright test` (writes prefixed fixtures to the **live** database and
   deletes them again). Green means the schema, the policies and the UI agree.
7. **Live data is clean afterwards** — the E2E suite tears itself down, so
   confirm nothing was left behind:
   ```bash
   node scripts/q.js "select count(*) from public.profiles where email like 'jericho-e2e-%'"
   ```
8. **Sign in as a real operator** in a browser and open every tab. The suites
   check behaviour; this catches a broken deploy, a stale cached asset, or a
   dashboard that loads but shows `—` in every tile because a count query is
   failing silently.

---

## Known gaps in this plan

Recorded honestly rather than left to be discovered during an incident.

- **No verified restore.** Nobody has actually performed a Supabase restore on
  this project. An untested backup is a hypothesis. The first restore should be
  a drill, not an emergency.
- **`.env` has no off-machine copy** unless you have made one. See section 3.
- **GitHub Actions secrets are write-only.** They cannot be exported. If the
  repo is recreated, they are re-entered from the Supabase and Resend
  dashboards by hand.
- **No backup of the Resend configuration** — but it holds nothing that cannot
  be recreated: an API key and a sender address.
