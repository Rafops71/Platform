# Function checklist

Every core function this platform is supposed to perform, in plain words.

This file is the source of truth for the checks. `npm run checklist` prints a
tick/cross table against this list and **fails if any item has no passing
check** — so an item added here without one breaks the build, on purpose.

Evidence comes from both suites, and the table says which proved each item:

- **db** — an assertion in `sql/tests` named `Tn ItemNN …`. Where the
  prohibitions belong: row-level security, the rate limits, what one account
  cannot read. Proving those through a browser would test the screen, not the
  rule.
- **ui** — a Playwright test whose title contains `ItemNN`. Where the flows
  belong: the things a person does. The whole suite runs, not a tagged subset:
  a tag is a second thing to keep in step with the title, and a test that
  proves an item while sitting outside the tagged group would go silently
  uncounted — the one failure this report exists to prevent.

An item may be proven by either or both. It may not be proven by a suite that
did not run — if one fails to start, the report is INCOMPLETE and fails, rather
than quietly ticking from the other half.

Items marked **MUST NOT** are prohibitions. They are the most valuable tests in
the suite: this platform's product is controlled disclosure, so proving a thing
*did not* happen matters more than proving a button worked.

| # | Function | Kind |
| --- | --- | --- |
| 01 | An Operator can invite a person by email, and the invitation is sent | does |
| 02 | An invitation link cannot be used twice | MUST NOT |
| 03 | An invited person can register, and lands as pending, not approved | does |
| 04 | An Operator can approve a pending registration | does |
| 05 | An Operator can reject a pending registration | does |
| 06 | A person who is not approved cannot sign in | MUST NOT |
| 07 | Registration is refused unless the Terms are accepted | MUST NOT |
| 08 | The accepted Terms version and language are recorded | does |
| 09 | A member can sign in and sign out | does |
| 10 | A member can update their own contact details | does |
| 11 | A member cannot change their own role or status | MUST NOT |
| 12 | An email change requires the current password and confirmation | does |
| 13 | A password change requires the current password | does |
| 14 | A member can post a listing | does |
| 15 | A member can see, edit and withdraw their own listings | does |
| 16 | A member cannot edit or withdraw another member's listing | MUST NOT |
| 17 | Commodities and units are listed alphabetically, in the chosen language | does |
| 18 | A member can browse other members' listings | does |
| 19 | Browse never reveals who posted a listing | MUST NOT |
| 20 | Browse hides nothing but the poster's identity — verified, not assumed | does |
| 21 | A member can filter and search Browse | does |
| 22 | A member can save a search, and a bare commodity acts as a watchlist | does |
| 23 | A saved search reports the same count Browse then shows | does |
| 24 | A member cannot see another member's saved searches | MUST NOT |
| 25 | An Operator cannot read members' saved searches | MUST NOT |
| 26 | An enquiry about a listing goes to the Operator, not to the listing owner | MUST NOT |
| 27 | An Operator can forward an enquiry to the listing owner | does |
| 28 | The owner can reply, and the reply returns through the Operator | does |
| 29 | Neither party ever sees the other's identity or contact details | MUST NOT |
| 30 | A member's mailbox shows only their own conversations | MUST NOT |
| 31 | A member can declare which documents they hold, against a checklist | does |
| 32 | An Operator can request a document, and the member can respond | does |
| 33 | No file is ever uploaded or stored — documents are declared only | MUST NOT |
| 34 | A member can download their own activity as a CSV | does |
| 35 | The export contains only the member's own data | MUST NOT |
| 36 | The export never names a counterparty | MUST NOT |
| 37 | A stale listing prompts its owner, who can renew it in one action | does |
| 38 | A member cannot fake how fresh their listing is | MUST NOT |
| 39 | A member cannot renew another member's listing | MUST NOT |
| 40 | An Operator sees an overview of what needs attention, and it agrees with the database | does |
| 41 | An Operator sees the activity log — who did what, when | does |
| 42 | An Operator sees week-by-week figures that agree with the database | does |
| 43 | A member cannot read platform-wide Operator figures | MUST NOT |
| 44 | An Operator can manage the commodity list | does |
| 45 | No introduction is ever made automatically — an Operator must act | MUST NOT |
| 46 | One account cannot flood the platform; Operators are exempt | MUST NOT |
| 47 | The whole interface switches language, and every list redraws | does |
| 48 | Emails are sent in the recipient's own language | does |
| 49 | An email that fails to send is retried, not silently dropped | does |
| 50 | No member can read another member's private data by any route | MUST NOT |
| 51 | A caller with no account can reach nothing but their own invitation token | MUST NOT |
| 52 | The audit log and the Operator feed cannot be written by hand | MUST NOT |
| 53 | A member can be deleted: their own content goes, the record of what happened stays, and the other party is untouched | does |
| 54 | A member who has forgotten their password can set a new one, and the old one stops working | does |
| 55 | The reset form never reveals whether an address has an account | MUST NOT |

## Open questions on this list

**Item 20 — the documents are wrong, and so was an earlier reading of them.**
`HANDOFF.md` states that Browse withholds `specification`, `price_conditions`
and `notes`, and generalises origin to a region. Neither is true.
`get_public_listings()` returns all three fields verbatim, and the origin is
returned unchanged — the column is merely aliased to `region`. Checked against
live data: a listing with origin `belgium` is shown as region `belgium`.

So Browse withholds exactly one thing: the poster's identity. Item 20 is
written to that, because a test must assert what the code does. Whether this is
the intended disclosure is a product decision, open as item 2 in `HANDOFF.md`.
If origin should really be coarsened, that is new work and a new item — not a
test to be written as though it already passed.

**Item 46 — also proven under concurrency.** The database and browser suites
each use a single connection, and this prohibition cannot fail on one
connection. `npm run stress` posts from 24 sessions at the same instant, which
is how the hole was found on 2026-10-11: all 24 were accepted against a limit
of 20, because each counted the others' rows before any had committed.
`sql/019` serialises the check per member. A prohibition that holds only when
nobody hurries is not a prohibition.

**Items 48 and 49 — may not be verifiable yet.** The Resend sending domain is
unverified, so mail only reaches the account owner's own address. These are
marked `blocked` in the report rather than ticked. A blocked item fails the
gate exactly as a cross does: an unprovable function is not a working one.
