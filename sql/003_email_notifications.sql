-- Jericho Platform — 003: email notifications for new listings.
--
-- Requirement (added 2026-08-26): when a participant posts a new Sell Offer
-- or Buy Request, every approved member must receive an email containing the
-- full content/details of that listing.
--
-- Design: this file only ever writes rows to an `email_outbox` table from a
-- database trigger (security definer, same pattern as the existing
-- notify_operators() in 002_updates.sql). It does not send email itself —
-- Postgres/Supabase has no built-in way to call an arbitrary email provider's
-- API, and this repo deliberately keeps that concern out of the database.
-- The actual send is a small Node script (scripts/send-listing-emails.js)
-- run on a schedule by a GitHub Action (.github/workflows/send-emails.yml),
-- mirroring how sql/rls_policies.sql's send_listing_reminders() is driven by
-- .github/workflows/reminders.yml. That script needs a provider API key that
-- only Rafael can supply — see scripts/send-listing-emails.js for details.
--
-- Anonymity note: listings are browsed anonymously (participants never see
-- who posted a listing — see get_public_listings() in rls_policies.sql).
-- This email preserves that: it includes the listing's full content but
-- never the poster's name/email/company.
-- ----------------------------------------------------------------------------

create table if not exists public.email_outbox (
  id                 uuid primary key default gen_random_uuid(),
  to_email           text not null,
  subject            text not null,
  body_text          text not null,
  related_listing_id uuid references public.listings(id) on delete cascade,
  created_at         timestamptz not null default now(),
  sent_at            timestamptz,
  error              text
);

-- No RLS policies are added on purpose: this table is written only by the
-- security-definer trigger below (which bypasses RLS) and read/updated only
-- by the sender script using the service_role key (which also bypasses RLS).
-- No anon/authenticated session should ever be able to touch it directly.
alter table public.email_outbox enable row level security;

create index if not exists email_outbox_unsent_idx
  on public.email_outbox (created_at) where sent_at is null;

-- New listing -> queue one outbox row per approved member, excluding the
-- poster. "Members" = every approved profile (participants and operators).
create or replace function public.trg_queue_listing_emails()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind      text := case when new.type = 'sell' then 'Sell Offer' else 'Buy Request' end;
  v_docs      text;
  v_body      text;
begin
  select coalesce(string_agg(doc_type, ', ' order by doc_type), 'None indicated')
    into v_docs
    from public.document_checklist
    where listing_id = new.id and indicated = true;

  v_body :=
    'A new ' || v_kind || ' was posted on the Jericho Platform.' || E'\n\n' ||
    'Reference: '      || new.reference_number || E'\n' ||
    'Type: '           || v_kind || E'\n' ||
    'Commodity: '      || new.commodity || E'\n' ||
    'Quantity: '       || coalesce(new.quantity::text, '—') || ' ' || coalesce(new.unit, '') || E'\n' ||
    'Specification: '  || coalesce(new.specification, '—') || E'\n' ||
    'Incoterm: '        || new.incoterm || E'\n' ||
    case when new.type = 'sell'
      then 'Origin: ' || coalesce(new.origin, '—')
      else 'Destination: ' || coalesce(new.destination, '—')
    end || E'\n' ||
    'Price / Conditions: ' || coalesce(new.price_conditions, '—') ||
      case when new.currency is not null then ' ' || new.currency else '' end || E'\n' ||
    'Notes: '          || coalesce(new.notes, '—') || E'\n' ||
    'Documents available: ' || v_docs || E'\n\n' ||
    'This listing is posted anonymously — sign in to the platform to respond via the mailbox.';

  insert into public.email_outbox (to_email, subject, body_text, related_listing_id)
  select au.email,
         'New ' || v_kind || ' — ' || new.commodity || ' (' || new.reference_number || ')',
         v_body,
         new.id
  from public.profiles p
  join auth.users au on au.id = p.user_id
  where p.status = 'approved'
    and p.id <> new.user_id
    and au.email is not null;

  return new;
end;
$$;

drop trigger if exists trg_queue_listing_emails on public.listings;
create trigger trg_queue_listing_emails
  after insert on public.listings
  for each row execute function public.trg_queue_listing_emails();
