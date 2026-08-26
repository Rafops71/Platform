-- Jericho Platform — 005: the seven confirmed updates of 2026-08-26.
--
-- Covers the database half of:
--   1. Full invitation email flow (invite / registered / approved / rejected)
--   2. Operators can edit and delete invitations
--   5+6. Revised two-category document checklist (CIS renamed, deal-stage
--        documents removed)
--   7. Participants see every listing detail except poster identity
--
-- Items 3 and 4 (unit and origin/destination dropdowns) are presentation-only
-- and live entirely in the frontend — the columns were already free text and
-- stay that way, so old rows remain valid.
-- ----------------------------------------------------------------------------


-- ============================================================================
-- 6. DOCUMENT CHECKLIST — new vocabulary
--
-- doc_type carries an inline CHECK naming every permitted document. The new
-- checklist renames all of them, so the constraint has to be replaced in the
-- same migration or every listing save would fail against it.
--
-- Existing rows are migrated where a document survived under a new name, and
-- deleted where the document was dropped from the checklist entirely (LOI,
-- ICPO, SPA, Proof of Funds, Past Performance). Those five describe a
-- negotiation between a specific buyer and seller, not the material on offer.
-- ============================================================================

alter table public.document_checklist
  drop constraint if exists document_checklist_doc_type_check;

-- Renames first, so surviving indications are not lost. Each pair is
-- old -> new. Done before the delete so nothing is dropped that has a home.
update public.document_checklist set doc_type = 'Certificate of Analysis (COA)'      where doc_type = 'Certificate of Analysis';
update public.document_checklist set doc_type = 'CIS (Customer Information Sheet)'    where doc_type = 'Cargo Information Sheet / CIS';
update public.document_checklist set doc_type = 'Proof of Product'                    where doc_type = 'Proof of product';
update public.document_checklist set doc_type = 'Assay Report'                        where doc_type = 'Assay report';
update public.document_checklist set doc_type = 'SGS or equivalent independent inspection report' where doc_type = 'SGS report';
update public.document_checklist set doc_type = 'Certificate of Origin'               where doc_type = 'Certificate of origin';
update public.document_checklist set doc_type = 'Company Registration / Corporate Documents' where doc_type = 'Company registration';
update public.document_checklist set doc_type = 'KYC Documentation'                   where doc_type = 'KYC';
update public.document_checklist set doc_type = 'Photos'                              where doc_type = 'Photographs';
update public.document_checklist set doc_type = 'Other relevant product/material documentation' where doc_type = 'Other';

-- Documents removed from the checklist entirely.
delete from public.document_checklist
 where doc_type in ('LOI', 'ICPO', 'SPA', 'Proof of Funds', 'Past performance record');

alter table public.document_checklist
  add constraint document_checklist_doc_type_check check (doc_type in (
    -- A) Material / Product Documentation
    'Certificate of Analysis (COA)',
    'Assay Report',
    'SGS or equivalent independent inspection report',
    'Certificate of Origin',
    'Proof of Product',
    'Photos',
    'Videos',
    'Other relevant product/material documentation',
    -- B) Company / Compliance & Supporting Documentation
    'Company Registration / Corporate Documents',
    'KYC Documentation',
    'CIS (Customer Information Sheet)',
    'Export License / Permit, where applicable',
    'Warehouse Receipt, where applicable',
    'Bill of Lading / Shipping Documentation, where applicable',
    'Packing List, where applicable',
    'Other relevant compliance or logistical documentation'
  ));


-- ============================================================================
-- 7. FULL LISTING VISIBILITY
--
-- Browse previously withheld specification, price_conditions, currency and
-- notes. Confirmed 2026-08-26: approved participants see every commercial
-- detail; only the poster's identity (name, company, email, phone) is hidden.
-- That is enforced structurally — this function simply never selects from
-- profiles, so there is no identity to leak.
--
-- `region` keeps its name (the frontend filters on it) and its meaning: the
-- exact origin for a Sell Offer, the exact destination for a Buy Request.
-- ============================================================================

drop function if exists public.get_public_listings();

create or replace function public.get_public_listings()
returns table (
  id uuid, reference_number text, type text, commodity text,
  quantity numeric, unit text, incoterm text, region text,
  specification text, price_conditions text, currency text, notes text,
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
    l.specification, l.price_conditions, l.currency, l.notes,
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


-- ============================================================================
-- 2. INVITATIONS — edit and delete
--
-- invitations already had select/insert/update policies for operators; only
-- delete was missing. Deleting an invitation revokes its link, because
-- get_invitation_by_token() finds nothing to redeem.
-- ============================================================================

drop policy if exists invitations_delete on public.invitations;
create policy invitations_delete on public.invitations for delete
  using (public.is_operator());

grant delete on public.invitations to authenticated;


-- ============================================================================
-- 1. INVITATION / REGISTRATION EMAIL FLOW
--
-- Same outbox pattern as 003: nothing here sends mail, it only queues rows
-- for scripts/send-listing-emails.js to flush.
-- ============================================================================

-- Operator-callable: queue the invitation link to the invited address.
-- email_outbox has RLS on with no policies, so no client session can insert
-- into it directly; this definer function is the only door, and it checks the
-- caller is an operator before opening it.
create or replace function public.queue_invitation_email(p_to_email text, p_link text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_operator() then
    raise exception 'Only an operator may send invitations';
  end if;

  if p_to_email is null or position('@' in p_to_email) = 0 then
    raise exception 'A valid email address is required';
  end if;

  insert into public.email_outbox (to_email, subject, body_text)
  values (
    p_to_email,
    'You have been invited to the Jericho Platform',
    'You have been invited to join the Jericho Platform.' || E'\n\n' ||
    'Use this link to create your account:' || E'\n' ||
    p_link || E'\n\n' ||
    'The link is valid for 5 days and can only be used once.' || E'\n\n' ||
    'Once you register, an operator reviews your application and you will be ' ||
    'emailed when it is approved.'
  );
end;
$$;

grant execute on function public.queue_invitation_email(text, text) to authenticated;


-- Registration submitted -> confirm to the registrant.
create or replace function public.trg_email_registration_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending' and new.email is not null then
    insert into public.email_outbox (to_email, subject, body_text)
    values (
      new.email,
      'Your Jericho Platform registration has been submitted',
      'Hello ' || coalesce(new.first_name, '') || ',' || E'\n\n' ||
      'Thank you — your registration for the Jericho Platform has been received ' ||
      'and is now awaiting review by an operator.' || E'\n\n' ||
      'You will receive another email once a decision has been made. You will ' ||
      'not be able to sign in until your account is approved.'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_email_registration_submitted on public.profiles;
create trigger trg_email_registration_submitted
  after insert on public.profiles
  for each row execute function public.trg_email_registration_submitted();


-- Approved or rejected -> tell the applicant which it was.
create or replace function public.trg_email_profile_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is not distinct from old.status or new.email is null then
    return new;
  end if;

  if new.status = 'approved' then
    insert into public.email_outbox (to_email, subject, body_text)
    values (
      new.email,
      'Your Jericho Platform registration has been approved',
      'Hello ' || coalesce(new.first_name, '') || ',' || E'\n\n' ||
      'Good news — your registration for the Jericho Platform has been approved.' || E'\n\n' ||
      'You can now sign in and start posting and browsing listings.'
    );

  elsif new.status = 'rejected' then
    insert into public.email_outbox (to_email, subject, body_text)
    values (
      new.email,
      'Your Jericho Platform registration was not approved',
      'Hello ' || coalesce(new.first_name, '') || ',' || E'\n\n' ||
      'Thank you for your interest in the Jericho Platform. After review, your ' ||
      'registration has not been approved and your account will not be activated.' || E'\n\n' ||
      'If you believe this was a mistake, please reply to the operator who ' ||
      'invited you.'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_email_profile_decision on public.profiles;
create trigger trg_email_profile_decision
  after update on public.profiles
  for each row execute function public.trg_email_profile_decision();
