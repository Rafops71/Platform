# Handoff — picking this project up

This file is for whoever works on the Jericho Platform next, in a local session
with access to the live Supabase project. It records what is done, what is
verified, what is deliberately not built, and what is still open.

For setup and deployment steps, see `README.md`. For a description of the
product in business terms, see `JERICHO_PLATFORM_PRODUCT_REVIEW.md`; for a
standalone technical description, `JERICHO_PLATFORM_AI_REVIEW.md`.

## Getting set up

```sh
git clone https://github.com/Rafops71/Platform.git
cd Platform
cp .env.example .env      # then fill it in
npm install
```

`.env` is git-ignored. Never commit it, never paste its contents into a chat.
`README.md` has the variable table and which two grant full database access.

`psql` is **not** required — every script is Node and talks to Postgres
directly. If you want it anyway:
- macOS: `brew install libpq && brew link --force libpq`
- Ubuntu/Debian: `sudo apt install postgresql-client`

## Current state

**The live database is fully migrated.** Everything through
`sql/011_profile_self_service.sql` is applied and verified present at the catalog
level — not assumed, but read back: columns, foreign keys, check constraints,
and indexes all confirmed.

**Both test suites pass against the current code:**

```sh
npm run test:sql      # 104 assertions, 0 failures
npm run e2e           # 71 tests, 0 failures
npm run verify-live   # READ-ONLY health check, safe on production
```

The E2E suite runs against the **live** Supabase project, because Supabase Auth
is cloud-hosted and has no local stand-in. It creates prefixed fixtures and
tears them down; read `tests/e2e/helpers/fixtures.js` before pointing it at
anything whose contents matter.

**Everything that was once listed here as "needs live verification" has been
verified**, including real signup firing `handle_new_user`, `auth.uid()`
resolving correctly under PostgREST, invitation tokens being consumed in one
pass with email confirmation off, and the full invite → register → approve →
listing → browse → contact → forward → reply path.

### Changing an email address needs a confirmation this project does not send

A participant can change their own email on the Profile page, and the flow is
not instant: this Supabase project requires the change to be confirmed from the
**new** address. `auth.updateUser({ email })` returns success, GoTrue parks the
address in `auth.users.email_change`, and `auth.users.email` only moves when the
link in that confirmation mail is followed. The confirmation is sent by Supabase
Auth itself, not by the outbox in `sql/003`, so nothing here composes or queues
it — but it does mean the address does not change until somebody clicks.

The page says so rather than claiming success, which matters: telling someone
their email has changed when it has not is how they lock themselves out.

`public.profiles.email` is never written by the browser. A trigger
(`trg_sync_profile_email_from_auth`, `sql/011`) mirrors it from `auth.users`
whenever Auth moves it, so the address someone signs in with and the address
they are mailed at cannot drift apart. `protect_profile_columns()` still pins
the column against every other writer; the trigger's own update is let through
by a transaction-local GUC that only that function sets.

One consequence for tests: GoTrue validates the address the account *currently*
holds, and rejects domains with no MX records — so an account created at
`@example.invalid` (the suite default) can never change its address. Only
`tests/e2e/profile.spec.js` overrides the fixture domain, to `resend.dev`.

### The Operator workload overview

The Operator dashboard opens on an **Overview** tab: five counts of work
waiting — pending registrations, messages awaiting review, outstanding document
requests, unreviewed match suggestions, and available listings not updated in 30
days — each tile a link to the screen where that work is done.

It is read-only and adds no permission of its own: every count is a head-only
`count: 'exact'` query on a table the Operator could already open, so RLS decides
what is counted exactly as it decides what the tab would show. A count that
errors renders `—` rather than `0`, because "nothing waiting" and "could not ask"
must not look the same.

Two things to know before changing it. The definition of stale lives once, in
`staleListingCutoff()` / `STALE_LISTING_DAYS` in `js/operator.js`, and both the
count and the filtered table read it from there — the Listings screen has no
"not updated in N days" filter of its own, so the tile sets `LISTINGS_STALE_ONLY`
and the screen announces the filter above the table. Any Search or Clear on that
screen drops the flag, so the Operator's own filtering always wins. And the
Approvals tab dot is now set from the overview's first count, so it appears
before that tab has ever been opened.

## Things worth knowing before you change anything

### Three bugs found by executing, not by reading

None of these was visible on inspection. They are the reason this project tests
by running SQL and a real browser rather than by review.

1. **Privilege escalation.** `protect_profile_columns` exempted callers using a
   `current_user` check. Inside a `SECURITY DEFINER` function `current_user` is
   the function's *owner*, not the caller — so the exemption applied to
   everyone, and a participant could set their own `role='operator'`. Now keyed
   on `auth.uid() IS NULL`.

2. **Mailbox forwarding silently dead.** `messages_select` correlated on a bare
   `id`, which binds to `message_forward_log.id`, not `messages.id` — so the
   condition was `f.message_id = f.id`, never true. Operators could forward a
   message and the recipient would never see it.

3. **Replies could not reach the person who asked.** Forward targets were
   derived from `listings.user_id`, which is right for an opening enquiry and
   wrong for a reply, because on a reply the listing owner *is* the sender —
   "Forward to Owner" handed the message back to its own author. Fixed by
   `sql/009`: `messages.in_reply_to` records what a message answers, and the
   target comes from that. Null means an opening enquiry and still routes to the
   owner; set means it routes to whoever wrote the parent. The thread then
   alternates for any number of turns without special-casing who is "owner".

### Page-readiness races

`waitForURL` resolves the moment the browser navigates, but both dashboards do
their setup inside an async `DOMContentLoaded` callback that first awaits
`requireAuth()`. Between those two points the page exists and is wrong: tab
buttons are not wired and the unit selects have no options. Work done in that
window is not slow, it is silently incorrect — a nav click lands on an unwired
button and disappears, a select reads back empty.

Every spec now gates on `#user-name` being non-empty, which is filled in the
same synchronous block as the wiring and the populate calls. **If you add a
spec, gate it the same way.**

The same shape existed one layer down in the app itself and was a real bug:
`loadOperatorMailbox` awaits a listing lookup per message and appends rows as it
goes, but wired the click handlers only after the whole loop — so every row was
visible, enabled, and not listening for as long as the remaining lookups took.
Rows are now wired as they are appended. **When rendering a list incrementally,
wire each row as you append it.**

### Suite-scoped gotchas

- A session-scoped `insert ... select` in the SQL suites **fails silently**
  under RLS: a participant cannot see the counterparty's profile or listing, so
  the feeding SELECT is empty, every assertion reads an empty table, and nothing
  raises. Suite 03 runs its setup on a direct connection for this reason. RLS
  visibility is suite 01's job.
- The SQL runner starts a throwaway Postgres and sweeps abandoned data
  directories from earlier runs on startup, because Windows sometimes holds a
  handle past the cleanup retries.

## Deliberately not built

- **File upload / document exchange.** Documents are *declared* against a
  checklist and *requested* through a workflow; files are never uploaded or
  stored. Adding this is new work including storage, scanning, and access
  control.
- **Participant-to-participant direct messaging.** Central to the model, not an
  oversight. Every message is brokered.
- **Automatic listing expiry.** Only a 30-day reminder, plus a manual nudge.
- **Automatic introductions.** The matching engine produces scored suggestions
  for an Operator to act on, never an automatic connection.

## Still open

1. **Verify the Resend sending domain.** Highest-value item. Until it is done,
   the sandbox sender only delivers to the Resend account owner's own address —
   any other recipient is rejected with an HTTP 403 saying testing emails can
   only go to your own address. The pipeline is correct; this is an account
   configuration step.

2. **Decide the browse-versus-email disclosure question.** Browse deliberately
   withholds `specification`, `price_conditions` and `notes` and generalises
   origin to a region. The new-listing email sends all of them verbatim,
   including exact origin, to every approved member. Not an identity leak, and it
   does match the stated "full content" requirement — but it undoes the
   information control browse is built around. **Needs a product decision**, not
   a technical one.

3. **Extract the duplicated E2E helpers.** Four specs carry near-identical
   `signIn` / `openScreen` implementations; they belong in
   `tests/e2e/helpers/`.

4. **Review the per-row query pattern.** The mailbox and several list views
   issue one query per row for related records. Fine at current volumes, not
   linear.

5. **Legal and compliance gaps — blocks rollout.** The Terms, the acceptance
   record, and the Privacy Notice exist (version 2.2, `sql/010`, section 10 of
   the terms). What is still missing is the operating company itself, and as of
   version 2.1 every missing detail is written into the document as a marked
   `[PLACEHOLDER — …]` rather than omitted: section 16 carries the company
   name, country of incorporation, registration number, registered office,
   trading address, VAT number and notices address; the Privacy Notice carries
   the data controller, its address, the data protection contact, and the
   supervisory authority for complaints. Twelve placeholders in each language, a
   warning banner above the text, and two E2E tests that fail if any bracket
   loses its marking.

   **Every one of them must be completed, and these Terms read by a qualified
   lawyer, before the Platform is opened to real Participants.** The lawyer
   should also read the non-circumvention clause at section 8 — a 24-month
   commission tail is only worth what a court will enforce.

   No participant holds an acceptance of any version. The two existing
   participants registered before the Terms existed, and `terms_acceptances` was
   empty on the live database when checked on 2026-08-27; only registrations
   from now on are recorded. They are deliberately not being asked to accept
   2.x. There is no re-acceptance prompt in the dashboard; the mechanism
   supports one (the insert policy lets a participant record a later version,
   and the uniqueness constraint is on `(profile_id, version)` so an earlier row
   would survive), but nothing drives it.
   See `JERICHO_PLATFORM_PRODUCT_REVIEW.md` for the wider list.
