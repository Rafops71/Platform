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

**The live database is fully migrated**, through
`sql/024_require_invitation.sql`, applied 2026-10-13 and read back from the
live catalog rather than assumed. `sql/revert/` holds the previous
`handle_new_user()` exactly as it was read out of the live project before 024
replaced it: the way back, proven before the change was made.

**Registration is now invitation-only, enforced in the database.** Until
2026-10-13 anybody who found the Supabase project's `/auth/v1/signup`
endpoint could create a pending profile without an invitation. The page never
offered it, which is why it went unnoticed for months — the hole was in the
API, not the UI, and no amount of testing the code would have found it. 024's
`handle_new_user()` consumes a live invitation or raises, inside the same
transaction, so a refusal leaves no auth user and no profile.

Proven against the live project on 2026-10-13, not in a test database: an
uninvited `POST /auth/v1/signup` was refused, and the counts before and after
were identical (3 auth users, 3 profiles). Supabase reports a trigger
exception as a 500 "Database error saving new user", so `errorMessage()` in
`js/utils.js` translates exactly that string into one plain sentence, in both
languages, with no hint about which address would have worked.

**Both test suites pass against the current code:**

```sh
npm run test:sql      # 192 assertions, 0 failures
npm run e2e           # 95 tests — needs .env; see "What blocks the rest" below
npm run checklist     # tick/cross table against docs/CHECKLIST.md: 56 of 56
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

### Analytics counts when the work was done, not when it arrived

Three of the five analytics columns had no timestamp before `sql/015`: a message
or a match said it had been reviewed without saying when. `reviewed_at` on both
tables is written by a trigger at the first transition out of the unreviewed
status, so a message that sat for a week counts in the week it was dealt with,
and re-classifying it later is not a second review.

Nothing was backfilled. Rows reviewed before the migration carry no date and
appear in no period, because dating them from `created_at` would put the work on
days it did not happen — which is exactly the question the column exists to stop
answering wrongly.

`operator_analytics()` is Operator-only, checked inside the function because a
definer function has no RLS behind it. It returns a date and five integers and
cannot carry an identity; an assertion checks the signature for that.

### One definition of "stale", used from both sides

`STALE_LISTING_DAYS` and `staleListingCutoff()` live in `js/utils.js` and are
shared by the Operator's stale count and the participant's "is this still
available?" prompt. Two definitions would mean an Operator chasing a listing
whose owner was never asked about it.

`updated_at` is not writable from a browser — `protect_listing_columns()` sets
it on every UPDATE — so renewing goes through `renew_listing()` (`sql/014`),
which checks ownership itself because a definer function has no RLS behind it.
This also catches out tests: a listing cannot be *made* stale by updating it, so
fixtures insert an already-backdated row instead.

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

## What blocks the rest

`npm run test:sql` and `npm run checklist --db-only` run anywhere, including a
cloud container, with no credentials: the suite downloads its own PostgreSQL.
PostgreSQL refuses to run as root, so in a container run it as the `postgres`
user — nothing needs to be installed and no permission needs changing:

```sh
su postgres -s /bin/bash -c 'export TMPDIR=/tmp HOME=/tmp; cd '"$PWD"' && npm run test:sql'
```

The browser suite cannot. It needs `.env` with `SUPABASE_SERVICE_ROLE_KEY` (to
create and delete its own throwaway accounts) and `SUPABASE_DB_URL` (to read
back what the application wrote). Verified empirically, not assumed: with only
the public URL and publishable key, every spec stops at
`SUPABASE_DB_URL not set`.

Those two secrets are now set as repository secrets, so **the checklist stands
at 52 of 52, proven in CI** (run 33, 2026-10-11, commit 6659a28 — all three
jobs green and a build artifact produced). It read 37 of 52 while the secrets
were missing, because the fifteen unproven functions were all screen behaviour
and every one of them needs them.

Two things learned getting there, both worth keeping:

- **One live database cannot serve two test runs.** Teardown deleted every
  `jericho-e2e-` account it could see, so overlapping runs deleted each
  other's fixtures mid-test. CI now serialises on a single
  `ci-live-database` concurrency group, and each run tags its own accounts
  and deletes only those. Symptoms were eleven failures that moved between
  runs — a signed-in account vanishing, foreign keys failing, match counts
  of zero.
- **A crossed function used to say nothing about why.** `npm run why` prints
  the real error, with file and line, from the report the failing run already
  saved, and CI runs it on failure so the reason is in the log rather than
  inside a zipped artifact.

## Volume and concurrency

`npm run stress` builds a market on a throwaway PostgreSQL — 200 members, 2000
listings, 2000 messages by default, sizes settable with `STRESS_MEMBERS`,
`STRESS_LISTINGS`, `STRESS_MESSAGES`, `STRESS_CONCURRENCY` — then checks that
the prohibitions still hold at that volume, times the screens members actually
read, posts from 24 sessions at the same instant, and deletes the lot. It needs
no credentials and leaves nothing behind, because the server itself is deleted.
CI runs it as its own job.

It found two things on its first run, both now fixed:

- **The flood limit could be beaten by doing it all at once.** 24 parallel
  inserts, 24 accepted, limit 20. Fixed in `sql/019` with a per-member advisory
  lock; the run now reports 20 accepted and 4 refused.
- **Ten foreign keys had no index**, so every cascade was a full scan.
  Deleting 200 members with everything they owned took 198 seconds. With
  `sql/020` it takes 1.8. Both applied to the live project on 2026-10-11.

Measured after both fixes, at 200 members and 2000 listings: Browse 31ms,
Operator figures 76ms, activity export 4ms, deleting 200 members 1.8s.

**One thing deliberately not changed, because it is a product decision.**
Posting a listing takes about 46ms, and that is almost all
`generate_matches_for_listing()`: it loops over every opposite-type listing in
the same commodity and, for each pair, inserts one notification *per approved
Operator*. About 56 writes per listing posted, and it grows with the number of
listings in that commodity. At 2000 listings it is unnoticeable to a member. At
20,000 a post would take around half a second and the notifications table would
hold millions of rows. Adding an index did not help — the cost is the fan-out
inside the loop, not the lookup. Whether Operators should get one notification
per match, a digest, or none, is a question about how the platform should work.

## The thousandth listing stopped the platform, and nothing predicted it

`next_reference()` ended with `lpad(v_seq::text, 3, '0')`. PostgreSQL's `lpad`
truncates as well as pads: `lpad('1012', 3, '0')` is `'101'`.
`listings.reference_number` is UNIQUE, so from the 1000th sell listing of a
year onward every reference collided with one already issued and the insert was
**refused**. Not degraded — refused. Nobody could post a listing for the rest of
the year.

It was latent from the day the function was written. It surfaced on 2026-10-12
because the volume tests had pushed `SELL-26` to 1012, after which five browser
tests failed at once with the same duplicate-key error. Fixed in `sql/022`,
which pads below 1000 and lets the number grow a digit above it, so every
reference already quoted to a counterparty stays exactly as it was.

Two things worth keeping from this:

- **No suite had ever issued a thousand of anything.** The volume work was
  asked for to see whether screens held up; what it actually found was a cliff
  nobody knew existed. `sql/tests/15_reference_overflow.sql` now walks the
  counter over that boundary deliberately.
- **A wider pad would have been the tempting fix and the worse one.** It moves
  the cliff rather than removing it.

## The stale-render guard, and why it is enforced by a script

A loader that awaits before it writes can be overtaken. Start two, and the
container is painted by whichever ANSWER arrives last, which is not
necessarily the question asked last — so the screen shows rows for a request
the member has moved on from, while the controls show the one they chose.
Nothing on the page admits the disagreement, which is what makes it worse
than a crash.

It shipped twice.

`js/operator.js loadListings()` awaits twice and then writes the table, and
two of its controls fire back to back: arriving from the Overview's stale tile
calls it, pressing Search calls it again. The operator was left looking at the
stale-filtered rows with the note already hidden, as though their search had
found almost nothing. Fixed 2026-10-11.

`loadAnalytics()` was then caught by **CI run 50**: the test asked for 8
monthly periods and the table held 26 weekly rows. Those are the figures an
Operator reads to decide what needs attention.

At that point this file said the same shape existed in eight other loaders
and that none had been seen to fail. One just had. Finding a class of bug one
instance at a time, over weeks, is the actual defect — so the whole class was
closed in one pass on 2026-10-12:

- `renderToken()` in `js/utils.js` is the single guard. Keyed by name, so two
  screens cannot share a counter and cancel each other.
- **All 22 loaders** across `js/app.js` and `js/operator.js` take a token on
  entry and check it after every await, before writing anything. The four that
  had bespoke counters (`MY_LISTINGS_RENDER`, `SAVED_SEARCH_RENDER`,
  `LISTINGS_RENDER`, `ANALYTICS_RENDER`) were converted to it, so there is one
  pattern to look for rather than three.
- Two of those four turned out to be guarded late, after their error and
  empty-state writes. A stale answer could still paint "no listings" over a
  good list. Both now check straight after each await.
- `scripts/check-render-guards.js` (`npm run check:guards`) parses both files
  and fails if any `load*` / `refresh*` / `populate*` function writes the DOM
  after an await without the guard. It runs in the **Database tests** job,
  which needs no secrets, so it fails in seconds and on forks rather than
  after an eight-minute browser suite.

### The known gap

The check covers loaders, not action handlers. Eight functions —
`submitListingForm`, `editListing`, `saveProfileDetails`, `changeEmail`,
`createInvitation`, `addCommodity`, `confirmForward`, `confirmReply` — also
write the DOM after an await, but what they write is one status line about one
action. The right guard there is to stop the second submit, not to drop the
second answer, and that is a different change: disabling the button for the
duration of the request. **Not done, and not covered by the guard check.**
Worst case today is a status line that flaps between two answers to the same
double-clicked action; no data is written twice, because the database
constraints and the rate limits are what stop that, not the button.

## Password recovery, and three wrong diagnoses in a row

`reset.html` + `js/reset.js` + the "Forgotten your password?" panel on
`index.html` are new (items 54–56). Supabase Auth sends the recovery mail
itself, so recovery works while `RESEND_API_KEY` is still unset — deliberately,
because recovery must not rest on the part of the system that is broken.

Item 54 then failed three CI runs in a row, with three different causes, all
of them mine and none of them the one I first named:

1. `js/reset.js` called `initLanguage()`, **a function that has never existed
   in this codebase**. It threw on load, before the link was ever examined, so
   the page sat on "Checking the link…" for ever and never told anybody their
   link was bad. `node --check` passes such a file: it parses perfectly.
   `scripts/check-page-functions.js` now checks every HTML page's scripts for
   calls nothing they load defines, and CI runs it as "Every call resolves".
   It was verified by putting the bug back and watching it fail.
2. The test's `canSignIn()` helper returned `res.status === 200`, so a rate
   limit or an outage came back as a confident "that password does not work".
   It now returns false only for a real 400 `invalid_credentials` and throws,
   with the status and body, for anything else.
3. The test asked `canSignIn(member.email, testPassword())` — and
   `testPassword()` **mints a new random password on every call**. It was
   asking whether the account could sign in with a string invented a moment
   earlier. The "old password stops working" assertion had the same bug, which
   means it was proving nothing at all before this was fixed.

`initReset()` now also wraps the whole check, so any unexpected error still
ends in the honest sentence rather than a page that looks permanently busy.
That was checked in a browser, including with the Supabase client failing to
load, not by reading the code.

## Supabase's own settings were never examined, and one of them is wrong

The suites test this project's code. They say nothing about the dashboard
settings around it, and the signup hole above lived in exactly that gap.

Fixed by the owner on 2026-10-13: the Site URL was `http://localhost:3000`,
so every link Supabase sent itself — a password recovery link included —
pointed at an address that exists for nobody but a developer. CI never saw it,
because the test asks the admin API for the link directly instead of clicking
one out of an inbox. It is now `https://rafops71.github.io/Platform/`, and
`https://rafops71.github.io/Platform/reset.html` is on the redirect allow list
(it was empty).

Verified from a session afterwards rather than taken on trust: a recovery link
minted through the admin API came back carrying
`redirect_to=https://rafops71.github.io/Platform/reset.html`. Supabase falls
back to the Site URL when a redirect is not allow-listed, so the link echoing
the asked-for address is the proof that both settings took.

Still off, and still the owner's to change: leaked-password protection.

## The sweep of 2026-10-13: what asked WHO but never WHETHER

The owner asked for every contingency to be tested before the platform is
shown to clients. Probing the live project with throwaway accounts - created
and deleted inside the same check - found a class of hole, not one instance.

**Browse did not care whether you were still allowed in.** Proven live:

    APPROVED  -> listings visible: 1
    (operator suspends the account)
    SUSPENDED -> listings visible: 1      <- the hole
    SUSPENDED -> posting a listing: 403   <- correctly refused

Writing was shut and reading was not. Browse does not read the listings table
(RLS there gives a member only their own rows); it calls
`get_public_listings()`, which is SECURITY DEFINER and so runs with the
owner's rights, bypassing RLS on purpose. It asked who was calling and never
whether they were still a member. An access token lives about an hour and the
browser keeps it, so somebody suspended at nine could read the whole market
from a tab already open. The interface sends them to the sign-in page; the
interface is not the lock.

Sweeping every SECURITY DEFINER function on the live project then found three
more (sql/026): `renew_listing` (a suspended member could keep their listings
looking fresh for ever), `next_reference`, and `purge_orphaned_activity` -
which checked `role = 'operator'` but not status, so **a suspended Operator
could still delete audit rows**, the very records you read to find out what
they did before you suspended them.

`sql/revert/` holds the previous version of each function, read off the live
project before it was replaced.

## Four more gates, each from a real find

- **check:calls** — every function a page calls must exist. `js/reset.js`
  called `initLanguage()`, which has never existed here; it threw on load, so
  the recovery page never examined the link and never said one was bad.
- **check:i18n** — 308 phrases, both languages, every `data-i18n` and every
  `t('…')` defined. A missing Spanish phrase does not crash: it shows English
  to somebody who does not read it, on a screen nobody who built it looks at.
- **check:double** — anything that inserts a row must be unstartable twice.
  Seven actions were not: two of them visible to a member as a doubled forward
  or a doubled invitation email.
- **check:errors** — loads the real `errorMessage()` and runs it against real
  error objects. A refused action used to answer, on screen,
  `new row violates row-level security policy for table "listings"`.
- **check:filters** — the Operator's region box was spliced raw into a
  PostgREST filter; `zzzz,role.eq.operator` became another condition on the
  query. Proven against the live API, fixed with quoting, gated.

## The database suite runs in a cloud container after all

It refuses to start as root, and that had been treated as a dead end. It needs
an ordinary user:

    useradd -m pgtest && chown -R pgtest:pgtest node_modules/@embedded-postgres
    su pgtest -c "cd /home/user/Platform && npm run test:sql"

Before this, every database question cost a fifteen-minute CI run, which is
exactly why changes went out half-checked. Use it, and run it on the previous
commit too when something fails, so "my change broke this" is established
rather than assumed.

## The hygiene check has never run

`hygiene.yml` is on this branch only, and GitHub runs scheduled workflows from
the DEFAULT branch. Verified 2026-10-13: zero runs, while heartbeat, reminders
and the email flush all have recent ones. So the daily "is the database clean"
question - written after 4,776 orphaned notifications were found by hand - has
never actually been asked. It starts working when this branch merges, and not
before. The same is true of every fix listed above.

## The 4,796 notifications, and why clearing them was not the fix

The hygiene check's first working run found 4,796 notifications about things
that no longer exist. The owner had cleared roughly 9,500 by hand days before
and they had rebuilt, which is the signal that a button was treating a symptom.

Cause: every delete in `tests/e2e/helpers/fixtures.js` matched on an id that
still existed. Anything a test deleted DURING its run - a withdrawn listing,
the member-deletion test - left a notification pointing at a row that was
already gone, which no id-based predicate can find afterwards. Roughly sixty
strays per CI run, for seven weeks.

`cleanup()` now applies the orphan rule itself, the same one the Operator's
purge button uses. The backlog was cleared on the owner's say-so with
`sql/maintenance_2026_10_13_clear_orphans.sql` - written as a file rather than
typed into a console, so what was run against the live database is in the
repository with its reason. Verified afterwards: 0 orphans, 13 real
notifications left.

## Items 60 and 61, and Safari

- **60 — an unreachable Platform.** Playwright cuts the browser's requests to
  Supabase at the network level and the suite reads what the member is then
  shown: not blank, not "Loading…" for ever, not database words, and in their
  own language. Plus the button must not be left dead, or they cannot retry
  when their signal returns.
- **61 — two tabs, and a dead session.** A stale tab SHOWING something out of
  date is unavoidable. A stale tab ACTING on it is not: one tab closes a
  listing, the other presses renew, and the listing must stay closed. A session
  whose stored credentials are gone must send the member to sign in or tell
  them - never a dashboard that looks fine while nothing loads.
- **Safari.** Every other suite runs on Chromium, including the phone-layout
  one. On iOS every browser is WebKit underneath, so "it works on a phone" has
  meant "it works on an engine no iPhone runs". `tests/e2e/on-safari.spec.js`
  runs the member's real path on WebKit, in its own CI job with its own browser
  install, after the main suite rather than beside it - two live runs at once is
  a race worth avoiding. Adding it also broke the checklist job for one run,
  because `playwright test` with no project runs EVERY project: both suites now
  name their browser explicitly.

## The logbook had no lock (sql/030, 2026-10-19)

A second-opinion review of the whole build raised nine points. Each was
checked against the code rather than taken on trust, and this is the one that
survived as work.

`authenticated` held a direct INSERT grant on `public.activity_log`
(`sql/rls_policies.sql:740`) and a policy permitting it (`:690`). The policy
pinned WHO a participant could write as. Nothing pinned WHAT: `action` is free
text. A member with the token their browser already holds could add

    action = 'operator agreed to waive documents'

in their own name, into the Operator's audit trail, in its own format. Not
tamper with it - only add. The log's whole value is being the account nobody
can argue with, and a log its subjects can write in is not that.

`sql/030` adds `record_activity(p_action, p_details)`: SECURITY DEFINER, takes
no user_id at all so the actor cannot be supplied by the client, and accepts
only the actions the application actually logs - read out of `js/auth.js` and
`js/operator.js` on the day, listed in the migration's header with line
numbers. Then the policy is dropped and the grant revoked. Both call sites now
go through it. A new action the console starts logging must be added to that
list or the line is silently lost; that is the point, not a side effect.

ONE THING THE FIRST ATTEMPT GOT WRONG, worth keeping: the function first
required an APPROVED profile, copying the guard from sql/025-029. That would
have thrown away the most interesting line the log can carry - a pending,
suspended or rejected member signing in - because `js/auth.js:78` records the
login BEFORE it reads the status and sends them away. `record_activity` now
requires only that a profile exists; status still gates every Operator action.

`sql/tests/18_activity_log_write_only.sql`, 12 assertions, all passing locally
on the embedded PostgreSQL. It was checked the only way a prohibition test can
be: the two lines closing the route were commented out and the suite re-run.
T2 and T2a both failed, and the forged line went straight into the table -
which is also the proof the hole was real and not a reviewer's theory.

APPLIED TO THE LIVE DATABASE on 2026-10-19, and the lock proven there rather
than inferred from the local suite - `set role authenticated` and then the
forged insert:

    ERROR: 42501: permission denied for table activity_log

Live state after: member INSERT false, Operator SELECT true, authenticated
EXECUTE on record_activity true, anon false, 23 log rows and 0 forged.

TWO THINGS THE LIVE DATABASE SAID AND THE SUITE DID NOT.

First, a real bug in this migration. Its first version wrote `revoke all on
function ... from public`, and Supabase grants EXECUTE on a new function in
the public schema to anon, authenticated and service_role EXPLICITLY - so
anon kept its own grant. proacl read on the day:

    {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}

T7 asserts anon cannot execute it and PASSED anyway, because the harness has
no such default. sql/017:57 already says `from public, anon, authenticated`
for this exact reason and this file had not copied it. The lesson is the one
worth keeping: a green suite means the harness agrees, not the live project.

Second, `drop policy activity_log_insert` cannot be run through the Supabase
MCP tool from here. Five attempts, each hanging for 60s and committing
nothing, with no lock held on the table and lock_timeout/statement_timeout
having no effect - so the stall is above Postgres, not in it. The policy is
therefore still present LIVE and is inert: with the INSERT privilege revoked,
a policy permitting an insert has nothing to permit, which is what the live
42501 above demonstrates. It drops cleanly in the local harness and will drop
on any deployment that applies sql/030 by another route. Tidy it with
`psql` or the SQL editor when convenient; nothing depends on it.

Revert in `sql/revert/030_activity_log_write_only_through_a_function_revert.sql`,
copied from what `sql/rls_policies.sql` creates and confirmed identical to the
live policy before anything was changed.

## Email: who sends what, and the two decisions already taken

Two separate jobs, and they are easy to confuse. Keep them apart.

THE PLATFORM SENDING TO MEMBERS (new-listing notifications, password
links). Outbound only, no inbox. This is Resend, and it stays Resend.
Free tier read off their pricing page on 2026-10-19: 3,000 emails a
month, "The Free plan is limited to 100 emails per day", 3 custom
domains. At this platform's volume that is free indefinitely. Still
blocked on the sending domain and the two secrets - see open item 1.

THE OWNER'S OWN MAILBOX (a human address at the company domain, to send
and reply from). DECIDED by the owner on 2026-10-19: **Purelymail, $10 a
year.** Figures read off their own pages that day:

  price        $10/year, NOT per user; multiple users and domains included
  sending      ~3,000 messages/day external, ~300 at once
  stated as    a limit "to protect the service against abuse by spammers,
               and discourage use of the service for marketing"
  raising it   by contacting support
  trial        heavily throttled until $10 is added
  the catch    "significantly more than $10 a year in resources" can move
               an account to their advanced per-resource pricing, so $10
               is the normal-use price, not a guaranteed cap
  one risk     Gmail throttled Purelymail's sending IPs in November 2025
               (their own status post). Gmail's doing, not their quota,
               but it is the kind of thing that decides whether mail
               arrives.

WHAT WAS REJECTED AND WHY, so it is not re-proposed: Migadu Micro is
$19/year for 5 GB but caps outgoing at 20 messages A DAY, per account and
not per mailbox. Twice the price for 1/150th of the headroom. Fastmail
($60/yr, 50 GB) and Proton (from $5.99/mo) are fine products and simply
more than this needs. Zoho's free plan (5 users, 1 domain, 5 GB, no IMAP)
was the free fallback. Zoho's paid tiers, Google Workspace, Microsoft 365
and Namecheap could not be priced at all - those pages render their
figures with scripts, or refused the request - and were left unquoted
rather than guessed.

A CORRECTION WORTH KEEPING. Purelymail was first reported here as
publishing no sending figure, on the strength of its homepage and pricing
page. It publishes both, in its FAQ at /docs/faq. The owner pushed back on
the number and he was right. Two pages of a site are not the site.

NOT a replacement for Resend: Purelymail explicitly discourages bulk and
marketing use, and the platform's notifications are machine-sent to every
member. Keep the platform on Resend and the human mailbox on Purelymail.

STILL OPEN: the domain itself. Nothing can be set up until one is bought.
The owner's constraints, stated on 2026-10-19: .com only; no .eu, .be or
anything Belgian (NV, BV and Dutch or French wording included); the words
commodities, trade, market and capital are all out, because the business
may expand beyond commodities and trade under its own name; no hyphens.
Thirty .com names meeting all of that were verified free against the
registry that day. Re-verify before buying - availability is a snapshot.

## There were no backups at all (2026-10-22)

HANDOFF carried "get a screenshot of the Supabase backup settings" as an item
for the owner for weeks. It needed no screenshot. Read off the Management API
on 2026-10-21:

    organisation  Rafops71's Org
    plan          free

and from Supabase's documentation the same day: daily backups are for Pro,
Team and Enterprise plans, and free-tier projects are told to export their own
data and keep off-site copies. So there was nothing to photograph and nothing
to switch on. The database had no backups of any kind.

`docs/drafts/backup-workflow.yml` (INACTIVE since 2026-10-25, pending the private-repository rewrite) takes one daily, encrypted, and restores it
into a throwaway PostgreSQL in the same run to prove it works.
`docs/BACKUPS.md` has the whole design and what it deliberately is not.

THREE THINGS IN IT THAT ARE NOT OBVIOUS, each from something checked:

  * The dump MUST be encrypted. This repository is public, and GitHub's
    artifact documentation says "Read access to the repository is required" -
    which on a public repository is everybody. An unencrypted dump would
    publish every member's name, company, email, phone and every message they
    have sent.
  * The runner's pg_dump is 16 and the live server is 17.6; pg_dump refuses a
    server newer than itself. Ubuntu 24.04 has no postgresql-client-17 at all
    (checked), so it comes from PGDG. The throwaway database is postgres:17
    for the same reason in reverse.
  * It FAILS when a secret is missing rather than skipping. send-emails.yml
    skips and goes green, which is why no member has ever received an email
    and nobody noticed for weeks. A backup that quietly does not happen is
    that same mistake with a worse ending.

PROVEN, not assumed, on 2026-10-22 against a real PostgreSQL in this
container: the assertions fail on an empty database ("holds no profiles at
all") and pass on one with a member; and the full cycle - dump, encrypt,
decrypt, restore through scripts/restore-backup.sh, verify - ran end to end,
134 kB, with profile counts matching at 1 and 1. The restore script was also
made to refuse a populated target and a wrong passphrase, both on purpose.

WHAT IT STILL IS NOT: an archive (90 days is GitHub's maximum), off-site (it
sits with the code at the same provider), or readable without the passphrase.
A copy of BACKUP_PASSPHRASE has to live somewhere outside this repository,
because a repository secret cannot be read back out. Without it the backups
are decoration.

THE PASSPHRASE DESIGN IS BEING REPLACED, and the reason is worth keeping.
The owner asked, reasonably, that the passphrase be remembered for him rather
than written down somewhere. It cannot be: a session's container does not
survive, so a promise to recall it is a promise to guess later. Worse, the
design put a password inside the system it protects - if the database died and
the only copy of the passphrase died with it, the backup is a locked box with
the key inside.

So the storage changes rather than the memory: the dumps go to a SECOND,
PRIVATE repository instead of to an artifact on this public one. Access is
then the owner's own GitHub login, which he already has and can recover by
email, and there is no passphrase to keep at all. Agreed in principle on
2026-10-22; waiting on him to create the private repository and a token that
can write to it. The encryption step stays harmless either way, but the
remembered-secret requirement goes.

THIS REPOSITORY MUST STAY PUBLIC. Checked on 2026-10-22, because the obvious
reaction to "member data must not be public" is to make the repository
private, and that would take the platform offline. GitHub's own documentation:

  "Any published GitHub Pages site will be automatically unpublished when a
   repository is made private."

The platform IS a Pages site. Publishing from a private repository needs a
paid plan, and making the site itself private needs an organisation on
Enterprise Cloud. Separately, Actions are free on public repositories but the
Free plan allows 2,000 minutes a month on private ones - and this repo runs
browser suites on every push. So: code public (no secret has ever been in it),
member data in a separate private repository that has no Pages site and runs
no tests, so neither limit applies to it.

MOVING OFF GITHUB LATER, since it was asked: the site is static files and
moves by copying them to another host and repointing the domain; Supabase does
not move at all. What does not come along is the automation - backups, the
email sender, the CI gate are written for GitHub Actions and would need
rewriting. That is the part that gets forgotten when someone says "it is just
files".

WAITING ON THE OWNER: the private backup repository and its write token. Until
backup storage is settled the workflow fails on purpose, loudly, at its first
step. That red run IS the guard working.

## Publishing is behind the gate (built and switched on 2026-10-25)

Until now GitHub Pages published `main` straight from the branch, on its own.
Proven from GitHub's check runs on `556e185`: `deploy` 14:42:43, `Function
checklist` 14:55:03. Members had each new version twelve minutes before the
gate decided whether it worked, and a red run changed nothing they saw.

Now `ci.yml` has a `deploy` job that `needs` database, checklist, stress,
Safari and package. GitHub's documented rule - "If a job fails or is skipped,
all jobs that need it are skipped" - makes it the gate, as long as its `if:`
never uses always() or another status function. `npm run check:deploy`
(`scripts/check-deploy-gate.js`) fails the build if that is ever weakened, if a
required check is dropped from `needs`, if the main-only limit goes, or if any
other workflow gains a publish step. Each of those four was tried on a scratch
copy and refused.

`scripts/assemble-site.sh` decides what is published and refuses an
incomplete site. The old packaging copied css/, js/ and the pages and NOT
films/, which register.html loads at runtime - deployed as it was, it would
have removed the registration film and nothing would have failed. Proven: an
intact copy passes; a missing stylesheet and a missing film are both refused.

DELIBERATE CHANGE: branch publishing ran the repo through Jekyll, so every
Markdown file was public on the site - /HANDOFF and /docs/CHECKLIST answered
200. The deployed site is now the app only. The documents are unchanged in the
repository.

TO TAKE EFFECT the owner sets Settings > Pages > Source > "GitHub Actions".
Until then the old branch publishing carries on. What the deploy job does on
main before the switch is NOT verified - it is expected to fail because Pages
is not set to accept a workflow deployment, but no documentation found says so. GitHub's documentation does not
say what the live site does at the moment of the switch, so it is done while
watched: switch, then re-run the deploy job of the latest green main run
(it rebuilds from that run's own commit, so it does not depend on artifacts
surviving a re-run), then confirm `/REVISION` on the live site shows that
commit.

## The morning report (built 2026-10-25)

`.github/workflows/morning-report.yml` runs `scripts/morning-report.js` at
05:43 UTC and files a GitHub issue that @mentions the owner, so GitHub emails
it. No AI: it reads GitHub's records and the live site, costs no Claude usage,
and says the same thing about the same night every time. It reports commits to
main, every workflow run, the latest CI on main job by job with the
checklist's own "N of N functions proven" line, which revision the live site
serves (/REVISION), open pull requests, and - the one that matters most -
scheduled jobs that ran GREEN WHILE SKIPPING their real work.

Its first drafts lied twice, both caught by running it on real data before
trusting it: it called a pull request "all checks green" when no checks had
reported, then again when only the reviewer had. A pull request is now green
only once CI has FINISHED on its exact commit.

NOT YET VERIFIED: that the @mention reaches the owner's inbox. That depends on
his GitHub notification settings; confirm on the first morning.

## What 2026-10-25 added (CI proved 72 of 72 on PR #19; Items 73-75 arrive with sql/037-038)

Decisions behind each are in `docs/AGREED-2026-10-25.md`.

- **Terms 3.0, then 3.1** (sql/032, sql/036), generated from `js/i18n.js` by
  `scripts/terms-seed.js`; `check:terms` fails the build if page and database
  copy differ. 3.1 fixed the commission sentence to the owner's wording.
- **Signing** (sql/031): capacity, street address (no PO boxes), typed name,
  frozen copy, kept after deletion; members cannot write acceptance rows.
  The sign-in gate, held by the database too since sql/034: an unsigned
  member cannot post, message or browse. Nobody had signed any version when
  3.1 went live.
- **Listing statements** (sql/033): role, mandate or chain, the two-degrees
  rule, two document questions, the truth tick dated by the server.
- **Countries**: 250, ISO 3166-1 from the Debian iso-codes data plus Kosovo.
- **Deal files** (sql/035): open on the first forward, one per listing and
  pair; stages dated by the server; four outcome answers and a note,
  Operators only; every change in `deal_history`; nothing deleted. A real bug
  found by its own suite: the no-rewrite guard undid the foreign key's
  SET NULL.
- **Scorecard, numbers only** (sql/037) and **deal analytics** (sql/038).
  No score, no ranking, no AI - see `docs/research/SCORECARD-DATA-PROTECTION.md`.
  The Analytics column that counted every forwarded message as an
  "Introduction" is now labelled "Messages forwarded".
- **Every pull request names what it serves** (`purpose.yml`).
- **Standing permissions** (CLAUDE.md): add-only, revert-proven database
  changes without asking; and for the night of 2026-10-25, merging Claude's
  own pull requests when every check is green.

## Still open

-6. **Protect main on GitHub.** The API refuses it from Claude's session;
    the owner switches it on. Until then the pull-request rule holds only
    because Claude keeps it.

-5. **The films are out of date.** Made 2026-10-18, before signing, the
    listing questions and the Deals tab. Remaking them with OpenMontage
    (installed in the cloud session, `/home/user/OpenMontage`) is planned for
    later, on the owner's word.

-4. **The Privacy Notice does not yet mention outcome records or the
    scorecard.** The research says members must be told. A new Terms version
    is the owner's decision; nothing has been published.

-3. **The morning report is posted in a PUBLIC repository**, so deal figures
    were deliberately kept out of it. Whether the owner wants them somewhere
    private is open.

-2. **PARKED, by the owner, on 2026-10-19: the sender's id on a forwarded
    message.** A member's mailbox receives each message's raw `sender_id`
    UUID. It is never printed - `js/app.js:769` uses it once to decide "From
    you" or "To you" and discards it - never emailed, and the profile behind
    it cannot be read (asserted by `sql/tests/01` T28). What a member who
    opens the browser's developer tools can learn from it is that two
    listings share one unnamed counterparty. Nothing more: the UUID is
    `gen_random_uuid()`, so it encodes nothing, and it exists nowhere outside
    this database.

    Pressing Reply in the console does not leak even that: `js/operator.js:1129`
    writes the new message with the OPERATOR as sender, so a buyer answered in
    the Operator's own words sees the Operator's id on everything.

    The owner weighed it and parked it, and his reasoning is on the record
    because it overrules a guess: the market is saturated, global, and he has
    never been able to identify a counterparty from hundreds of offers. The
    same review raised Browse's disclosure level - specification, price, exact
    region - on the same reasoning, and the owner rejected that outright. That
    question is CLOSED: Browse shows the detail, because the detail is what
    makes a listing worth reading. Do not reopen either on a hunch about
    market size without data.

    If it is ever wanted, the fix is small and does not get harder with age:
    have the server send a `mine` boolean instead of `sender_id`, since the
    mailbox needs nothing else from it. One query, one render line, one test.


-1. ~~**The look.**~~ Built and live on 2026-10-18. "Sky Tint": white behind
    everything, colour in the blocks and badges, Spectral for headings and
    listing titles. `docs/LOOK-DECISION.md` records what the build had to
    decide, including three rules that quietly depended on the page being
    GREY and went invisible on white - two badges and a button hover, each of
    them a screen that stops saying what it meant rather than a matter of
    taste. CI passed, Safari on an iPhone included, so no touch target was
    narrowed. Verified live: the site serves `--bg: #ffffff`.

-0b. **The films exist.** Four of them, in `films/`, each shipped beside the
    narration timings it was checked against:

      member-en     3m36s   the member's side, 22 beats
      member-es     3m11s   the same in Spanish (voice ef_dora)
      operator-en   3m02s   the Operator's desk, 13 beats
      overview-en   2m41s   both sides in one, for a new Operator

    The member film is embedded on `register.html`, shown only once an
    invitation has been accepted and in whichever language the page is set
    to, with `preload="none"` so nothing downloads until play is pressed. It
    is deliberately NOT on `index.html`, which is public.

    Voice: Kokoro-82M, Apache-2.0, `am_michael` for English and `ef_dora` for
    Spanish, at speed 0.92. Piper is kept as a fallback for languages Kokoro
    lacks. `video/script.json` holds the engine, the voices and the pacing.

    FOUR GATES refuse to film something unwatchable, each added after a film
    passed every check and a person watching said no: over 20s of still
    screen, a zoom closer than 2.0x, a zoom that never comes back out, and a
    verb perform() does not handle. The first three cost a run each to learn.

    ONE TRAP WORTH KNOWING: dispatching several films at once silently kills
    all but the newest. GitHub allows one PENDING run per concurrency group
    and cancels the rest. Dispatch them one at a time.

0a. **The independent reviewer is temporary and is meant to be deleted.** The
    owner said so on 2026-10-12: it is a second pair of eyes for the period
    while the platform is still being proved, and it goes once the app is
    working properly. Removing it is three deletions —
    `.github/workflows/review.yml`, `scripts/review-pr.js`, and the
    `GROQ_API_KEY` secret. Nothing imports it, no job needs it, no test asserts
    on it, and deleting it cannot redden a build. Do not build anything that
    depends on it, and do not promote it to a gate.

    Its measured record so far: two reviews, one useful point each, two
    confidently wrong points each.
    The secret was added by the owner on 2026-10-12 and the workflow posts
    comments on pull requests. Read `scripts/review-pr.js`'s header before changing anything there. Three
    limits in it were measured on real runs, not assumed: the free tier allows
    8,000 tokens a minute (39,166 characters of diff was refused outright);
    `gpt-oss-120b` reasons out of the same budget and returned an EMPTY review
    at 700 answer tokens; and `llama-3.3-70b-versatile` 404s on this account.

    Its first review found five things: one worth fixing, two confidently
    wrong. That ratio is the reason it posts a comment and cannot fail a build,
    and the reason nobody should promote it to a gate later.

0. **No email is being sent at all. Nothing.** Verified 2026-10-12 in the
   workflow's own log, run 274:

       Skipped — no mail can be sent until these repository secrets are set:
       RESEND_API_KEY LISTING_EMAIL_FROM

   `.github/workflows/send-emails.yml` skips its send step when any of
   `SUPABASE_DB_URL`, `RESEND_API_KEY` or `LISTING_EMAIL_FROM` is missing. Only
   the first is set, so the run goes green and the "Flush the email queue" step
   is skipped every time. Checked again on 2026-10-18 against run 39099463019,
   that morning's scheduled run, whose steps read:

       Are the secrets configured? :: success
       Flush the email queue       :: skipped

   An earlier version of this note said three rows were queued and waiting.
   That is no longer true and it is worth saying why rather than quietly
   correcting it: `email_outbox` holds ONE row, sent, dated 2026-08-26. The
   queue is empty. Nothing is backing up - because nothing is being queued
   either, there being no members yet to notify. An empty queue here is not
   evidence that sending works.

   So today an invited person gets no invitation, an approved member gets no
   notice, and nobody is told about a new listing. The database side is correct
   and proven — items 48 and 49 pass, and the rows are queued properly. What is
   missing is two repository secrets.

   This is the largest thing between the platform and real members, and it
   cannot be done from a session: the keys are the owner's. Item 1 below is the
   second half of the same problem — even with the keys, an unverified sending
   domain means Resend only accepts the account owner's own address, which is
   exactly the HTTP 403 on the one August attempt.

1. **Verify the Resend sending domain.** Highest-value item. Until it is done,
   the sandbox sender only delivers to the Resend account owner's own address —
   any other recipient is rejected with an HTTP 403 saying testing emails can
   only go to your own address. The pipeline is correct; this is an account
   configuration step.

2. **Decide how much Browse should disclose.** This entry used to say Browse
   withholds `specification`, `price_conditions` and `notes` and generalises
   origin to a region. **It does neither.** `get_public_listings()` returns all
   three fields verbatim and returns the origin unchanged — the column is only
   aliased to `region`. Checked against live data: a listing whose origin is
   `belgium` is shown as region `belgium`.

   So Browse withholds exactly one thing: the poster's identity. The
   new-listing email discloses the same fields, so the two are consistent.

   **DECIDED by the owner on 2026-10-19: Browse stays exactly as it is.** The
   question was put to him with a worked example of how a detailed listing
   might narrow down who posted it. He rejected the premise, and the reasoning
   is recorded because it overrules a guess: the market is saturated, the
   members are global, and in hundreds of offers he has never once been able
   to identify a counterparty from the detail. The example was invented by an
   assistant with no sight of his deal flow, which is exactly the kind of
   confident sentence this project's rules exist to stop. The detail is what
   makes a listing worth reading, so it stays.

   This item is CLOSED. Do not reopen it on a hunch about market size; reopen
   it only if the owner says the membership has changed shape, or with real
   data. Checklist item 20 is written to what the code does and needs no
   change.

3. ~~**Extract the duplicated E2E helpers.**~~ Done in `6d10a32` —
   `tests/e2e/helpers/session.js` now holds `signIn` / `openScreen` and six
   specs were stripped of their copies.

4. ~~**Review the per-row query pattern.**~~ Done in `9583b21` and `81d3ede` —
   the per-row lookups are batched, and the batching is chunked so it stays
   safe at volume and reports honestly when a lookup fails.

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
