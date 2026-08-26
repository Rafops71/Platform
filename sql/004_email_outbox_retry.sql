-- Jericho Platform — 004: give email_outbox a terminal failure state.
--
-- Problem found 2026-08-26 during the first live send (listing SELL-26-001):
-- a row that fails to send keeps `sent_at` null and records only `error`, so
-- the sender script re-selects it on every run and fails again — forever. On
-- the 5-minute schedule in .github/workflows/send-emails.yml that is ~288
-- doomed provider calls per day per bad row, which burns quota and buries any
-- real failure in noise.
--
-- Fix: two new columns.
--   attempts  — how many send attempts this row has had.
--   failed_at — set once the row is given up on. A row with failed_at set is
--               never selected again.
--
-- The sender script (scripts/send-listing-emails.js) decides which failures
-- are terminal. Permanent rejections (a 4xx from the provider — bad address,
-- unverified sender, malformed payload) fail the row immediately, because
-- retrying an identical request that the provider already refused cannot
-- succeed. Transient failures (429, 5xx, network errors) retry up to
-- MAX_ATTEMPTS and only then give up.
--
-- Rows that failed can be deliberately re-queued once the underlying cause is
-- fixed (e.g. after verifying a domain with the provider):
--     node scripts/send-listing-emails.js --retry-failed
-- ----------------------------------------------------------------------------

alter table public.email_outbox
  add column if not exists attempts  integer not null default 0;

alter table public.email_outbox
  add column if not exists failed_at timestamptz;

-- The sender's work queue is "not sent and not given up on". Replaces the
-- old index, which only excluded sent rows and so still pointed at the
-- permanently-failed ones.
drop index if exists public.email_outbox_unsent_idx;

create index if not exists email_outbox_pending_idx
  on public.email_outbox (created_at)
  where sent_at is null and failed_at is null;

-- Backfill: any row already carrying an error from before this migration has
-- had at least one attempt. Rows whose recorded error is the provider's
-- sandbox-recipient rejection are terminal by definition — mark them failed
-- rather than letting the new script retry them once more to rediscover that.
update public.email_outbox
   set attempts = greatest(attempts, 1)
 where error is not null
   and sent_at is null;

update public.email_outbox
   set failed_at = now()
 where sent_at is null
   and failed_at is null
   and error like 'HTTP 4%';
