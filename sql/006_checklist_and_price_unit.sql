-- Jericho Platform — 006: final document checklist + price per unit.
--
-- 1. The document checklist reaches its final vocabulary. Three entries are
--    dropped outright, the Company group's catch-all becomes a plain "Other",
--    and three shipping documents move from Company to Material. The move is
--    presentation-only (DOCUMENT_GROUPS in js/utils.js decides the grouping);
--    doc_type stores the label alone, so no data changes for those three.
--
-- 2. Listings gain `price_unit`: the unit a price is quoted per, chosen from
--    the same list as Quantity's unit but independent of it — ore is
--    quantified in metric tons and priced per DMTU, so one field cannot serve
--    both. Free-text `price_conditions` keeps holding the amount.
-- ----------------------------------------------------------------------------


-- ============================================================================
-- 1. DOCUMENT CHECKLIST — final vocabulary
-- ============================================================================

alter table public.document_checklist
  drop constraint if exists document_checklist_doc_type_check;

-- The Company group's catch-all is renamed to a plain "Other". The unique
-- (listing_id, doc_type) constraint would reject the rename if a row already
-- held "Other" for the same listing, so clear any such collision first — the
-- surviving row is the one being renamed into place.
delete from public.document_checklist dc
 where dc.doc_type = 'Other'
   and exists (
     select 1 from public.document_checklist other
     where other.listing_id = dc.listing_id
       and other.doc_type = 'Other relevant compliance or logistical documentation'
   );

update public.document_checklist
   set doc_type = 'Other'
 where doc_type = 'Other relevant compliance or logistical documentation';

-- Removed from the checklist entirely.
delete from public.document_checklist
 where doc_type in (
   'SGS or equivalent independent inspection report',
   'Proof of Product',
   'Export License / Permit, where applicable'
 );

alter table public.document_checklist
  add constraint document_checklist_doc_type_check check (doc_type in (
    -- A) Material / Product Documentation
    'Certificate of Analysis (COA)',
    'Assay Report',
    'Certificate of Origin',
    'Photos',
    'Videos',
    'Warehouse Receipt, where applicable',
    'Bill of Lading / Shipping Documentation, where applicable',
    'Packing List, where applicable',
    'Other relevant product/material documentation',
    -- B) Company / Compliance & Supporting Documentation
    'Company Registration / Corporate Documents',
    'KYC Documentation',
    'CIS (Customer Information Sheet)',
    'Other'
  ));


-- ============================================================================
-- 2. PRICE PER UNIT
-- ============================================================================

alter table public.listings
  add column if not exists price_unit text;


-- Browse must carry the new column, or a price would render without the unit
-- it is quoted against — "450 USD" where "450 USD per DMTU" was meant.
drop function if exists public.get_public_listings();

create or replace function public.get_public_listings()
returns table (
  id uuid, reference_number text, type text, commodity text,
  quantity numeric, unit text, incoterm text, region text,
  specification text, price_conditions text, price_unit text,
  currency text, notes text,
  status text, has_documents boolean, created_at timestamptz, updated_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    l.id, l.reference_number, l.type, l.commodity,
    l.quantity, l.unit, l.incoterm,
    case when l.type = 'sell' then l.origin else l.destination end as region,
    l.specification, l.price_conditions, l.price_unit,
    l.currency, l.notes,
    l.status,
    exists (
      select 1 from public.document_checklist dc
      where dc.listing_id = l.id and dc.indicated = true
    ) as has_documents,
    l.created_at, l.updated_at
  from public.listings l
  where l.status <> 'archived';
$$;

grant execute on function public.get_public_listings() to authenticated;


-- Same for the new-listing notification email. Body is otherwise unchanged
-- from sql/003_email_notifications.sql — see that file for the anonymity note.
create or replace function public.trg_queue_listing_emails()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind      text := case when new.type = 'sell' then 'Sell Offer' else 'Buy Request' end;
  v_docs      text;
  v_price     text;
  v_body      text;
begin
  select coalesce(string_agg(doc_type, ', ' order by doc_type), 'None indicated')
    into v_docs
    from public.document_checklist
    where listing_id = new.id and indicated = true;

  v_price := coalesce(new.price_conditions, '—')
    || case when new.currency  is not null then ' ' || new.currency  else '' end
    || case when new.price_unit is not null then ' per ' || new.price_unit else '' end;

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
    'Price: '          || v_price || E'\n' ||
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
