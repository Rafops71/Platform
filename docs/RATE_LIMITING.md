# Rate Limiting & Abuse Protection

What is in place, what is not, and what the gaps would cost to close.

---

## What is implemented

`sql/016_rate_limits.sql` — two `BEFORE INSERT` triggers:

| Protects | Limit | Scope |
| --- | --- | --- |
| `messages` | 30 per hour | Per sender |
| `listings` | 20 per hour | Per owner |

Operators are exempt from both. An Operator brokers every conversation on the
platform, so rate-limiting them would rate-limit the product.

Both limits are **flood stops, not quotas**. A participant who hits one is
doing something no legitimate workflow does. They are set generously on
purpose: a limit that is too tight breaks honest use silently, and nobody
reports "the platform stopped me doing something I was allowed to do" — they
just stop using it.

Supporting indexes (`messages_sender_created_idx`, `listings_user_created_idx`)
exist so the counting query on each insert is not a sequential scan. Without
them the protection makes a flood more expensive for the server than for the
attacker.

### Why in the database

A limit enforced in `js/app.js` is a suggestion. The publishable key and the
PostgREST endpoint are both public; anyone with a browser console can insert
directly, and an approved participant already holds a valid session. RLS
decides *whether* someone may insert. Until now, nothing decided *how often*.
A trigger is the only place the answer holds for every caller.

Tested in `sql/tests/10_rate_limits.sql` (9 assertions), which pins both
directions — the 31st message is refused **and** the 30th is not, the limit is
per-sender rather than global, Operators are exempt, and the window slides so
yesterday's messages do not count against today.

---

## What is NOT protected, and why not

### Authentication endpoints — the real gap

Sign-in brute force, signup floods, password-reset abuse and magic-link
flooding all happen at Supabase Auth (GoTrue), **before any row is inserted**.
No trigger in this database can see them, so nothing in `sql/016` touches them.

**This is configuration, not code.** Supabase Dashboard →
Authentication → Rate Limits. Set at minimum:

- Sign-in attempts per hour per IP
- Sign-ups per hour per IP
- Password-reset emails per hour
- Token refreshes per hour

Supabase applies defaults already, so the platform is not naked here — but they
are defaults chosen for a generic project, and nobody on this project has
reviewed them against an invite-only platform where **signups should be
approximately zero** (every account arrives through an operator invitation).
A signup rate limit far below the default would be appropriate and costs one
dashboard change.

> **Action for the Operators:** review those settings before real rollout.
> This is the highest-value item on the page and it requires no code.

### Per-IP limiting anywhere

Everything in `sql/016` is per *account*. An attacker with ten approved
accounts gets ten times the allowance. Postgres cannot see the client IP
through PostgREST in any reliable way, so per-IP limiting must happen at the
edge — Cloudflare, or an API gateway in front of Supabase. **That is a new
service, so it is out of scope by instruction.**

In practice this matters less than it would elsewhere: getting one account
requires an operator invitation *and* an operator approval, so ten accounts
requires ten failures of human judgement.

### Content abuse

Nothing inspects what is in a message. A participant can send 30 abusive or
identity-leaking messages an hour within the limit. This is deliberate — an
Operator reads every message before it goes anywhere, so the mailbox review
step *is* the content filter, and it is a human one.

The residual risk is Operator time, not participant harm.

### Storage / upload abuse

Not applicable. The platform has no file uploads. The document checklist
records an assertion that a document exists; nothing is ever transferred.

### Enumeration

`get_public_listings()` returns every non-archived listing to any approved
participant, with no pagination and no limit. An approved participant can
therefore scrape the entire listing book in one request. This is a deliberate
product decision (full listing visibility — see requirement #7 of the
2026-08-26 confirmed updates), not an oversight. It is only a problem if
someone is approved who should not have been, which returns to the approval
gate.

---

## If more is needed later

In rough order of value per unit of effort:

1. **Tighten the Auth rate limits in the dashboard.** No code, no deploy,
   closes the largest real gap. Do this first.
2. **Add a per-hour invitation limit** for Operators, if the Operator count
   ever grows beyond people who know each other. Same trigger pattern as
   `sql/016`, maybe 20 minutes of work.
3. **Cloudflare in front of the Supabase domain** for per-IP limiting and bot
   filtering. This is the "new service" the current instruction excludes, but
   it is the only way to get per-IP protection.
4. **A `blocked` account state** distinct from `suspended`, if abuse ever comes
   from an account that should keep its data but lose its ability to write.
   Today `suspended` covers this adequately.

## What to watch

An abuse problem shows up in the Activity Log and in Analytics before anyone
reports it:

```bash
# Messages per sender in the last day — a flood stands out immediately
node scripts/q.js "select sender_id, count(*) from public.messages where created_at > now() - interval '1 day' group by 1 order by 2 desc limit 10"

# Anyone actually hitting the ceiling
node scripts/q.js "select sender_id, count(*) from public.messages where created_at > now() - interval '1 hour' group by 1 having count(*) >= 25"
```

If the second query ever returns a row, either someone is abusing the platform
or the limit is too tight for a legitimate workflow. **Find out which before
changing the number** — raising a limit to silence a symptom is how flood
protection quietly becomes decorative.
