# Jericho Platform — Project Blueprint for External Review

This document is a self-contained technical and functional description of the
Jericho Platform. It is written to be read without any additional context, and
is intended for independent architectural, security, and product review.

It contains **no credentials, keys, connection strings, or environment variable
values**. Where secrets exist, only their names and storage locations are
described.

---

## 1. Project summary

### What Jericho Platform is

Jericho Platform is a **private, invitation-only listing and matching-facilitation
platform for physical commodity brokers**. Approved participants publish
**anonymous Sell Offers and Buy Requests**. A small group of Operators sees the
full picture and privately brokers introductions between counterparties.

The product's defining characteristic is **brokered anonymity**: a participant
can see that an opportunity exists and read its full commercial detail, but
never learns who posted it. All contact between two participants is relayed by
an Operator, in both directions.

### What it is not

- **Not a trading exchange.** No trades are executed, cleared, or settled. No
  order book, no matching of bids to asks for execution, no price discovery
  mechanism.
- **Not a payments or escrow system.** No money moves through the platform.
- **Not a document repository.** Documents are *declared* against a checklist
  and *requested* through a workflow, but files are not uploaded or stored.
- **Not a public marketplace.** There is no self-service signup, no public
  listing pages, and no anonymous browsing by non-members.
- **Not a messaging platform.** Participants cannot address each other. Every
  message passes through an Operator who decides whether to forward it.

### Core business rules and non-negotiables

1. **Registration is invitation-only.** An Operator issues a tokenised
   invitation to a specific email address. There is no other route in.
2. **Every account requires Operator approval** before it can do anything.
   Registration alone grants no access.
3. **Nobody can self-register as an Operator.** Every new signup is forced to
   `role='participant'`, `status='pending'` at the database level, regardless
   of what the client sends.
4. **Poster identity is never disclosed to other participants.** Not the name,
   company, email, phone, or user id — and not indirectly through the browse
   data source.
5. **Enquirer identity is never disclosed to the listing owner either.**
   Anonymity is symmetric.
6. **No participant-to-participant delivery without an Operator.** A message is
   invisible to its intended recipient until an Operator explicitly forwards it.
7. **Security is enforced in the database, not the frontend.** The frontend is
   a static site with a publishable key; it is assumed to be fully
   attacker-controlled. Row Level Security and `SECURITY DEFINER` functions are
   the actual control.
8. **Precise origin is generalised in the anonymous view.** Browse shows a
   region rather than an exact location.

---

## 2. Roles and permissions

There are exactly two roles: `operator` and `participant`
(`profiles.role`, CHECK-constrained). Account state is separate:
`profiles.status` ∈ `pending | approved | rejected | suspended`.

### Operator capabilities

- Create, edit, resend, and delete/cancel invitations, in a chosen language.
- Review pending registrations; approve or reject them.
- View **all** listings with full detail **including poster identity**.
- Change any listing's status.
- View the entire mailbox: every message, from everyone.
- Forward a message to its correct recipient; reply to a message directly;
  ignore a message.
- Raise document requests against a listing and see participant responses.
- Manage the commodity list (add and remove commodities).
- View the match suggestions the engine generates; mark reviewed or dismiss.
- View the full activity log (audit trail).
- Promote a participant to Operator, demote an Operator, suspend and reinstate
  users.
- Trigger manual listing reminders.

### Participant capabilities

- Register **only** with a valid, unused, unexpired invitation token.
- Create, edit, and manage their own Sell Offers and Buy Requests.
- Maintain the document checklist on their own listings.
- Browse other participants' listings **anonymously**, with filters.
- Contact a listing (message goes to the Operator queue, not the owner).
- Reply to a message that an Operator forwarded to them.
- Respond to document requests directed at them.
- View their own notifications.
- Edit their own profile and switch interface language.

### Participant restrictions (enforced in the database)

- Cannot change their own `role`, `status`, or `email`.
- Cannot read another participant's profile row.
- Cannot read another participant's listing row directly — only through the
  anonymised view function.
- Cannot list, enumerate, or read invitation tokens.
- Cannot read the activity log or the matches table.
- Cannot see a message addressed to them until an Operator forwards it.
- Cannot insert a message claiming to be from another sender.
- Cannot write to the email queue or email template tables.

---

## 3. Full feature inventory

### Invitation-only registration
An Operator creates an invitation for a specific email address and language. The
system generates a token, stores an `invitations` row, and queues an invitation
email. The invitation link carries the token. `register.html` resolves the token
through a dedicated lookup function, and consumes it via
`mark_invitation_used()` immediately after signup. Invitations carry an expiry
and a single-use marker; Operators can edit, resend, or delete pending ones.

### Operator approval
Every registration creates a `pending` profile and notifies Operators. An
Operator approves or rejects it. Approval and rejection each send the applicant
an email in their own language. A pending or rejected user cannot sign in to the
dashboard.

### Sell Offers and Buy Requests
A single `listings` table with `type ∈ sell | buy`. Fields include commodity,
quantity, unit, specification, incoterm, origin, destination, price conditions,
price unit, currency, notes, and status. Each listing receives a human-readable
reference number of the form `SELL-YY-NNN` / `BUY-YY-NNN`, allocated from a
`reference_counters` table.

- Statuses: `available | under_review | negotiation | closed | archived`
- Incoterms: EXW, FCA, FAS, FOB, CFR, CIF, CPT, CIP, DAP, DPU, DDP
- Currencies: USD, EUR, GBP, ZAR
- Units are drawn from a single shared, alphabetically ordered list.

### Document checklist
Each listing carries a checklist of document types the poster indicates they can
provide. Documents are **declared, not uploaded**. The checklist is organised in
two groups:

- *Material / Product Documentation* — Certificate of Analysis (COA), Assay
  Report, Certificate of Origin, Photos, Videos, Warehouse Receipt (where
  applicable), Bill of Lading / Shipping Documentation (where applicable),
  Packing List (where applicable), other product/material documentation.
- *Company / Compliance & Supporting Documentation* — Company Registration /
  Corporate Documents, KYC Documentation, CIS (Customer Information Sheet),
  Other.

A separate `document_requests` workflow lets an Operator formally request a
document type from a participant and record the response.

### Mailbox / contact flow
The brokered communication core:

1. A participant browsing anonymously contacts a listing. The message is stored
   with `status='pending_review'` and is **not** visible to the listing owner.
2. The Operator sees it in their mailbox and chooses to forward, reply, or
   ignore it.
3. Forwarding writes a `message_forward_log` row, which is what makes the
   message visible to the recipient, and raises a notification.
4. The recipient can reply. The reply threads onto the message it answers via
   `messages.in_reply_to`.
5. The Operator forwards the reply back to whoever wrote the parent message.

Forward targets are derived from `in_reply_to`: null means an opening enquiry,
which routes to the listing owner; set means it routes to the sender of the
parent message. This allows a conversation to alternate for any number of turns
without special-casing who is "owner" and who is "enquirer", and allows routing
a message that has no listing attached. The UI refuses to forward a message back
to its own author, and a database CHECK forbids a message being a reply to
itself. The foreign key is `ON DELETE SET NULL`, so losing a parent orphans the
thread link rather than deleting the reply.

### Notifications and emails
Two independent channels:

- **In-platform notifications** (`notifications` table), raised by database
  triggers for new registrations, approval decisions, new listings, new
  messages, forwarded messages, listing status changes, document request
  responses, and new match suggestions.
- **Email**, via a queue-and-flush design. Triggers insert rows into
  `email_outbox`; a scheduled job flushes the queue through an external email
  provider and records `sent_at`, `error`, `attempts`, and `failed_at`.

Email bodies are rendered in the database from `email_templates` and
`email_phrases`, keyed by template and language. Five templates exist, each in
English and Spanish: `invitation`, `new_listing`, `registration_submitted`,
`registration_approved`, `registration_rejected`.

Notably, the new-listing notification **excludes the poster** from its
recipients, preserving anonymity in the email channel as well.

### Search and browsing
The browse screen filters by type, commodity, origin/destination text, and
status. Browse reads exclusively from `get_public_listings()`, a
`SECURITY DEFINER` function that returns only:
`id, reference_number, type, commodity, quantity, unit, incoterm, region,
status, has_documents, created_at, updated_at`.

It exposes no `user_id`, name, email, company, or phone, and generalises precise
origin into `region`. It also withholds `specification`, `price_conditions`, and
`notes` from the anonymous view.

### Language support
Full English/Spanish bilingual participant interface, dictionary-driven, with a
language toggle. The chosen language is persisted both to browser storage and to
`profiles.language`, because notification emails are composed in the database
and can only read a stored column. Emails are sent in the recipient's own
language, with fallback to English for an unknown language, then to the phrase
key itself. Operator-facing email copy remains English.

### Commodity management
A managed `commodities` table with an explicit `sort_order`, maintained by
Operators through the UI. The list is currently seeded with 24 entries and is
kept alphabetical.

### Activity log and audit
An append-only `activity_log`, written by database triggers rather than by the
client, covering profile changes, listing changes, checklist changes, document
request changes, message inserts, and message forwards. Readable by Operators
only.

### Matching engine status
Implemented and active. `generate_matches_for_listing()` runs from a trigger
when a listing is inserted or when its status, quantity, commodity, incoterm,
origin, or destination changes. It pairs listings of the **opposite type** with
the **same commodity**, then scores on additional factors — quantity within a
0.5×–2× band, and origin/destination overlap — producing `high` (≥3 factors),
`medium` (≥1), or `low`. Results land in `matches` for Operator review; they are
**suggestions only** and never auto-notify participants.

### Other implemented features
- Stale-listing reminders: a daily job flags listings older than 30 days;
  Operators can also send a manual reminder.
- User management: promote, demote, suspend, reinstate.
- Notification unread indicators and document-request indicators.
- Responsive layouts verified at small, medium, and desktop widths.

---

## 4. Technology stack

### Frontend
- **Vanilla HTML, CSS, and JavaScript. No framework, no build step, no bundler.**
- Pages: `index.html` (login), `register.html` (invitation registration),
  `app.html` (participant dashboard), `operator.html` (operator dashboard).
- Scripts: `supabase-config.js` (client init), `utils.js` (shared helpers, auth
  guard, formatting, constants), `auth.js` (login/register/invitation),
  `app.js` (participant dashboard), `operator.js` (operator dashboard),
  `i18n.js` (translation dictionary and language switching).
- Single stylesheet, `css/styles.css`.

### Backend / database
- **Supabase**, i.e. managed **PostgreSQL** with the PostgREST auto-generated
  REST API. There is no custom application server.
- All business logic that matters lives in SQL: RLS policies, triggers, and
  `SECURITY DEFINER` functions.

### Authentication
- **Supabase Auth** (email + password). A database trigger, `handle_new_user()`,
  creates the corresponding `profiles` row and forces role and status.
- "Confirm email" is deliberately **off**, so `signUp()` returns a session
  immediately and the invitation token can be consumed in the same pass.
  Operator approval remains a separate mandatory gate.

### Storage
- **No file storage is used.** Documents are declared and requested, never
  uploaded.

### Email provider
- **Resend**, called from a Node script that flushes the `email_outbox` queue.
- Supabase Auth's own email handles auth flows (password reset); it is not used
  for notification email.

### Hosting
- **GitHub Pages**, serving the static site from the default branch. The site is
  entirely static.

### Automation
Three GitHub Actions workflows:
- `heartbeat.yml` — pings the Supabase REST endpoint every 3 days to prevent
  free-tier project pause.
- `reminders.yml` — daily at 07:00 UTC, calls `send_listing_reminders()`.
- `send-emails.yml` — every 5 minutes, runs the outbox flush script.

### Testing tools
- **Playwright** for end-to-end browser tests (ships its own Chromium, so no
  system browser is required).
- **embedded-postgres** to spin up a real, throwaway PostgreSQL for the SQL
  security suite.
- **node-postgres (`pg`)** for direct database access in scripts and tests.
- Helper scripts: `q.js` (ad-hoc queries), `verify-live.js` (read-only health
  check), `apply-sql.js` (apply migrations), `run-sql-tests.js` (SQL suite),
  `send-listing-emails.js` (outbox flush, with a dry-run mode).

---

## 5. Architecture and data flow

### Browser → Supabase REST → Postgres

```
Static page (GitHub Pages)
        │  supabase-js, publishable key + user JWT
        ▼
Supabase PostgREST
        │  request runs as the authenticated role,
        │  with auth.uid() bound to the caller
        ▼
PostgreSQL
        ├─ Row Level Security decides visibility per row
        ├─ SECURITY DEFINER functions expose narrowed views
        ├─ BEFORE triggers reject forbidden column changes
        └─ AFTER triggers write audit log, notifications, email queue
```

There is no trusted middle tier. The browser talks directly to PostgREST, so
every rule is expressed as a policy, a constraint, or a trigger. A hostile
client with a valid session can call any endpoint, and the database is what
stops it.

### Email pipeline

```
Database trigger (e.g. new listing, approval decision)
        │  renders subject/body from email_templates + email_phrases
        │  in the recipient's language
        ▼
email_outbox row (sent_at null)
        ▼
Scheduled GitHub Action, every 5 minutes
        │  scripts/send-listing-emails.js
        ▼
Resend API
        ▼
email_outbox updated: sent_at, or error/attempts/failed_at
```

The queue is deliberately decoupled: composing an email never blocks or fails
the transaction that triggered it, and a provider outage retries rather than
losing the message. Failure bookkeeping (`attempts`, `failed_at`) exists so a
permanently failing row cannot be retried forever.

### GitHub Actions
Workflows authenticate with repository secrets. The reminders workflow uses a
service-role credential because `send_listing_reminders()` is restricted to it;
the heartbeat uses only the publishable key. Secrets live in GitHub Actions
secrets, never in repository files.

### Database triggers and RLS
19 triggers across `profiles`, `listings`, `messages`, `message_forward_log`,
`document_checklist`, and `document_requests`. They fall into four groups:
column protection (BEFORE UPDATE), audit logging (AFTER), notification raising
(AFTER), and email queueing (AFTER). RLS is enabled on **all 15 public tables**.

---

## 6. Database schema overview

### Main tables

| Table | Purpose |
|---|---|
| `profiles` | Identity, company, contact, role, status, language. One row per auth user. |
| `listings` | Sell Offers and Buy Requests, with commercial detail, status, and reference number. |
| `invitations` | Tokenised, single-use, expiring invitations, with target email and language. |
| `messages` | All participant/operator messages, with `status` and `in_reply_to` threading. |
| `message_forward_log` | Records that an Operator forwarded a message to a specific user. This is what grants the recipient visibility. |
| `document_checklist` | Per-listing declaration of which document types can be provided. |
| `document_requests` | Operator-raised requests for a document type, with response status. |
| `notifications` | In-platform notifications, per user, with read state. |
| `activity_log` | Append-only audit trail written by triggers. |
| `matches` | Engine-generated match suggestions with score and review status. |
| `commodities` | Managed commodity list with explicit sort order. |
| `email_outbox` | Email queue with delivery bookkeeping. |
| `email_templates` | Subject and body per template key per language. |
| `email_phrases` | Reusable translated fragments for email rendering. |
| `reference_counters` | Sequence source for `SELL-YY-NNN` / `BUY-YY-NNN`. |

### Key functions

**Identity and authorisation helpers** — `current_profile_id()`,
`is_operator()`, `is_approved_participant()`. All `SECURITY DEFINER`, all used
inside RLS policies.

**Controlled exposure** — `get_public_listings()` returns the anonymised browse
projection; `get_invitation_by_token()` resolves a single invitation without
allowing enumeration.

**State transitions** — `handle_new_user()` forces role and status on signup;
`mark_invitation_used()` consumes a token; `next_reference()` allocates
reference numbers.

**Column protection** — `protect_profile_columns()`,
`protect_listing_columns()`, `protect_document_request_columns()` reject
forbidden field changes at the row level.

**Business logic** — `generate_matches_for_listing()`,
`send_listing_reminders()`, `send_manual_reminder()`, `log_activity()`,
`notify_operators()`.

**Email rendering** — `render_email()`, `email_phrase()`, `norm_lang()`,
`queue_invitation_email()`.

37 functions exist in the public schema; all but one are `SECURITY DEFINER`.

### RLS model and security enforcement

RLS is on for every public table. The shape of the model:

- `profiles` — a participant sees only their own row; Operators see all.
- `listings` — owner or Operator only. Everyone else must go through
  `get_public_listings()`.
- `messages` — visible if you are the sender, an Operator, **or** there exists a
  `message_forward_log` row directing it to you. Insert requires
  `sender_id = current_profile_id()` and an approved participant or Operator.
  Update is Operator-only.
- `invitations` — not enumerable by participants; token lookup only via the
  dedicated function.
- `activity_log`, `matches` — Operator-only.
- `email_outbox`, `email_templates`, `email_phrases`, `reference_counters` —
  **zero policies with RLS enabled**, meaning no client-role access at all.
  These are reachable only by `SECURITY DEFINER` functions and the service role.

---

## 7. Security model

### Anonymity mechanisms
- The browse data source is a function, not a table, and its return type
  physically cannot carry an identity column. A future UI bug cannot leak what
  the projection does not contain.
- Precise origin is generalised to `region` in that projection.
- `specification`, `price_conditions`, and `notes` are withheld from the
  anonymous browse view.
- The mailbox is symmetric: the enquirer never learns who posted, and the owner
  never learns who is asking.
- Message threading links **two messages, not two people** — `in_reply_to`
  carries no identity, and the Operator still brokers every hop.
- The new-listing email excludes the poster from its recipient set.

### Role protection
- Signup is hardcoded at the database level to participant/pending.
- A BEFORE UPDATE trigger rejects participant attempts to change `role`,
  `status`, or `email` on their own profile.
- Role checks inside `SECURITY DEFINER` functions key on `auth.uid()`, not on
  `current_user`. This matters: inside a `SECURITY DEFINER` function
  `current_user` is the function's *owner*, so a `current_user`-based exemption
  applies to every caller. That exact defect was found and fixed here — it had
  allowed a participant to promote themselves to Operator.
- The first Operator is bootstrapped by a manual, one-time SQL step; thereafter
  promotion happens in-app.

### Invitation token security
- Tokens are not listable or enumerable by participants.
- Single-use, marked consumed via a dedicated function at registration time.
- Time-limited by `expires_at`.
- Bound to a specific target email address.

### Email and secret handling
Secrets are **never** stored in the repository. `.env` is git-ignored (with an
explicit ignore rule and a committed `.env.example` template that holds
placeholder names only).

Secret **names** and their storage locations:

| Name | Stored in | Sensitivity |
|---|---|---|
| `SUPABASE_URL` | `.env`, GitHub Actions secret | Public identifier |
| `SUPABASE_PUBLISHABLE_KEY` | `.env`, GitHub Actions secret, and the committed client config | Public by design |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env` and GitHub Actions secret only | **Bypasses RLS entirely — full database access** |
| `SUPABASE_DB_URL` | `.env` only | **Full database access** |
| `RESEND_API_KEY` | `.env` and GitHub Actions secret | Can send mail as the configured sender |
| `LISTING_EMAIL_FROM` | `.env` | Configuration, not a secret |
| `OPERATOR_EMAIL` | `.env` | Configuration, not a secret |

Playwright output directories (`test-results/`, `playwright-report/`,
`blob-report/`) are git-ignored specifically because failure traces and
screenshots can contain session tokens and test account contents.

### Other known security measures
- The frontend is treated as untrusted; no security decision depends on it.
- The publishable key is safe to expose; the service role key never appears in
  any repository file and is used only by a scheduled job and local scripts.
- The security model is verified by executing SQL against a real PostgreSQL
  rather than by code review — an approach that has already caught two
  high-severity defects invisible to inspection.

---

## 8. Testing and verification

### SQL security suite
Runs the **real** SQL scripts against a throwaway local PostgreSQL and asserts
that the security rules actually hold. Statements execute one at a time in
autocommit, exactly as `psql` would, because the suite deliberately performs
operations that must be rejected and then asserts the row was left alone —
running the file as one transaction would abort every assertion after the first
expected error.

Coverage areas: identity and role rules, listings and anonymity, the matching
engine, activity log and notifications, mailbox anonymity, document checklist,
invitation security, document requests, language preference storage,
registration submission, approval and rejection, invitation email, new-listing
email, dictionary fallback, message threading, and threading guards.

**Current: 76 assertions, 0 failures.**

### Playwright E2E suite
Drives a real browser against the live Supabase project, because Supabase Auth
is cloud-hosted and has no local stand-in. Every account, listing, and message
it creates is prefixed and torn down again, and a test asserts the teardown
actually happened.

Specs:
- `full-flow.spec.js` — invite → register → approve → post listing → browse
  anonymously → contact → forward → owner receives, plus the anonymity
  assertions.
- `mailbox-flow.spec.js` — the brokered conversation in depth: browse, contact,
  Operator review, forward, reply, forward back, a third turn proving the route
  alternates, the Operator's own reply path, and an assertion that no email was
  sent anywhere in the flow.
- `bilingual.spec.js` — English/Spanish interface behaviour.
- `email-language.spec.js` — recipient-language email selection, including that
  the poster is not emailed about their own listing and that nothing was
  actually sent.
- `units-order.spec.js` — unit dropdown ordering and completeness in both
  languages.

**Current: 43 tests, 0 failures**, confirmed stable across three consecutive
full runs.

### What is specifically asserted
- Browse leaks no poster name, company, email, or phone anywhere in the rendered
  page — not merely inside the listing card.
- `get_public_listings()` itself exposes no identity column.
- The listing owner cannot see an enquiry before an Operator forwards it.
- Anonymity holds in both directions across a multi-turn conversation.
- A reply routes to the person who asked, not back to its own author.
- No email is ever actually dispatched during tests.

---

## 9. Known limitations and pending decisions

### Resend domain verification
The email sender domain is **not yet verified**. Until it is, the provider's
sandbox sender will only deliver to the account owner's own address. Any other
recipient is rejected with an HTTP 403 explaining that testing emails can only
go to the account's own address.

The practical effect: the email pipeline is fully functional and correct, but in
production only one address actually receives mail. This is a provider account
configuration issue, not a code defect. **Verifying a sending domain is the
prerequisite for real multi-recipient email.**

### Open product question: disclosure asymmetry between browse and email
Browse deliberately withholds `specification`, `price_conditions`, and `notes`,
and generalises origin to a region. The new-listing notification email sends all
of them verbatim, including exact origin, to every approved member.

This is not an identity leak, and it does match the stated requirement that the
email carry full listing content. But it does undo the information control the
browse view is built around: a recipient who reads the email learns more than a
participant who browses the same listing. **A decision is needed on whether the
email should be trimmed to match browse, or whether browse should be widened.**

### Documentation drift
`README.md` and `HANDOFF.md` predate the email and bilingual work and are
outdated in places. They still state that email notifications are deliberately
not implemented (they now are) and quote an older test count. This document
reflects the current state; those two do not.

### Test-suite duplication
Four E2E specs each define near-identical `signIn` and `openScreen` helpers.
Extracting them into the shared helpers module is a pending cleanup.

### Other notes
- The application is a static site with no server-side rendering, so first paint
  depends on the Supabase round trip.
- The mailbox and several list views issue one query per row for related
  records, which is acceptable at current data volumes but will not scale
  linearly.
- Match scoring is a simple factor count, not a weighted or learned model.
- There is no file upload; if document exchange is ever required in-platform,
  that is new work including storage, virus scanning, and access control.

---

## 10. Current state summary

### Done
- Complete invitation → registration → approval lifecycle, with email at each
  step in the recipient's language.
- Sell Offers and Buy Requests with reference numbering, status workflow, and
  document checklist.
- Anonymous browse with filters, backed by a projection that cannot carry
  identity.
- The full brokered mailbox, including multi-turn threaded replies that route
  correctly in both directions.
- In-platform notifications and a queue-based email pipeline with retry
  bookkeeping.
- Full English/Spanish participant interface and language-aware emails.
- Operator tooling: approvals, user management, commodity management, document
  requests, activity log, match review.
- Matching engine generating scored suggestions for Operator review.
- Security model verified by execution, not inspection: 76 SQL assertions.
- Browser behaviour verified end to end: 43 Playwright tests.
- Three scheduled automation workflows.

### Committed and pushed
The default branch is current and synchronised with the remote. All of the
above, including the database migrations through `sql/009_message_threading.sql`
and the complete test suites, is committed and pushed. The working tree is
clean.

Database migrations are applied to the live project and verified present at the
catalog level (columns, foreign keys, check constraints, and indexes confirmed
directly rather than assumed).

### Still open
1. **Verify a sending domain with the email provider.** Highest-value
   outstanding item; without it, production email reaches only one address.
2. **Decide the browse-versus-email disclosure question** described in Section 9.
3. **Refresh `README.md` and `HANDOFF.md`** to match the current feature set.
4. **Extract the duplicated E2E test helpers** into the shared helpers module.
5. **Review query patterns** in the mailbox and list views before data volume
   grows.

---

## Suggested focus areas for a reviewer

If you are reviewing this system, the highest-value questions are probably:

1. **Is the anonymity model actually airtight?** The claim is that no
   participant can determine who posted a listing or who sent an enquiry,
   through any endpoint, including direct REST calls with a valid session.
   Consider timing, reference-number correlation, match suggestions, and
   notification metadata as potential side channels.
2. **Are the RLS policies complete?** In particular, is there any path by which
   a participant reads a `messages` row before it has been forwarded, or reads
   another participant's `listings` row directly?
3. **Is the `SECURITY DEFINER` surface safe?** 36 of 37 functions run with
   definer rights. Each is a potential privilege boundary crossing.
4. **Is the invitation flow abusable?** Consider token guessing, replay after
   consumption, expiry handling, and the interaction with email confirmation
   being disabled.
5. **Does the email pipeline leak anything?** The new-listing email carries more
   detail than the anonymous browse view; consider whether that content, or the
   recipient set, discloses anything it should not.
6. **What breaks first under load?** Per-row query patterns and the 5-minute
   outbox flush are the obvious candidates.
