-- 035: deal files - one per negotiation, with its stages and its outcome.
--
-- Decided with the owner, 2026-10-25, block by block:
--
--   The negotiation runs through platform messages, always through an
--   Operator: price, Incoterms, volume, specification, SOP, payment terms,
--   and the commission (with the paying party only). When both agree, the
--   Operator makes the introduction.
--
--   Block 2: a deal file opens AUTOMATICALLY the first time an Operator
--   forwards a member's message about a listing between its owner and
--   another member. The same pair about the same listing is one file.
--   Stages: negotiating -> agreed -> introduced -> closed.
--
--   Block 3: the outcome is recorded by Operators only:
--     documents      matched | not_matched | never_arrived
--     genuineness    genuine | faulty | false
--     offer / client real | did_not_happen | not_genuine
--     deal           closed | fell_through | open
--
--   Block 4: answers may be changed, and every change is kept - old value,
--   new value, who, when. Nothing is deleted. Plus a free note.
--
-- Members never see any of it: every policy here is Operator-only.
--
-- A member's deletion keeps the file (SET NULL) with the listing reference
-- frozen on it, for the same reason sql/031 keeps signatures: the record of
-- what happened outlives the account.

begin;

create table if not exists public.deals (
  id               uuid primary key default gen_random_uuid(),
  listing_id       uuid references public.listings(id) on delete set null,
  listing_ref      text not null,
  owner_id         uuid references public.profiles(id) on delete set null,
  counterparty_id  uuid references public.profiles(id) on delete set null,
  stage            text not null default 'negotiating'
                     check (stage in ('negotiating','agreed','introduced','closed')),
  opened_at        timestamptz not null default now(),
  agreed_at        timestamptz,
  introduced_at    timestamptz,
  closed_at        timestamptz,
  docs_match       text check (docs_match in ('matched','not_matched','never_arrived')),
  docs_genuine     text check (docs_genuine in ('genuine','faulty','false')),
  offer_real       text check (offer_real in ('real','did_not_happen','not_genuine')),
  deal_result      text check (deal_result in ('closed','fell_through','open')),
  note             text check (note is null or length(note) <= 2000),
  updated_at       timestamptz not null default now()
);
create unique index if not exists deals_one_per_pair
  on public.deals (listing_id, counterparty_id)
  where listing_id is not null and counterparty_id is not null;

create table if not exists public.deal_history (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references public.deals(id) on delete cascade,
  field       text not null,
  old_value   text,
  new_value   text,
  changed_by  uuid references public.profiles(id) on delete set null,
  changed_at  timestamptz not null default now()
);
create index if not exists deal_history_deal on public.deal_history (deal_id, changed_at);

alter table public.deals enable row level security;
alter table public.deal_history enable row level security;

drop policy if exists deals_select on public.deals;
create policy deals_select on public.deals for select using (public.is_operator());
drop policy if exists deals_update on public.deals;
create policy deals_update on public.deals for update using (public.is_operator()) with check (public.is_operator());
drop policy if exists deal_history_select on public.deal_history;
create policy deal_history_select on public.deal_history for select using (public.is_operator());

-- Opened only by the trigger below; never deleted, never written by hand.
revoke all on public.deals, public.deal_history from anon, authenticated;
grant select, update on public.deals to authenticated;
grant select on public.deal_history to authenticated;

-- ------------------------------------------------------- opening a file --
create or replace function public.open_deal_on_forward()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_msg     public.messages%rowtype;
  v_listing public.listings%rowtype;
  v_other   uuid;
begin
  select * into v_msg from public.messages where id = new.message_id;
  if v_msg.listing_id is null then return new; end if;
  -- An Operator's own words are not a member's negotiation.
  if exists (select 1 from public.profiles where id = v_msg.sender_id and role = 'operator') then
    return new;
  end if;
  select * into v_listing from public.listings where id = v_msg.listing_id;
  if v_listing.id is null then return new; end if;

  -- The other member is whichever of sender and recipient is not the owner.
  v_other := case when v_msg.sender_id = v_listing.user_id then new.to_user_id else v_msg.sender_id end;
  if v_other is null or v_other = v_listing.user_id then return new; end if;
  if exists (select 1 from public.profiles where id = v_other and role = 'operator') then return new; end if;

  insert into public.deals (listing_id, listing_ref, owner_id, counterparty_id)
  values (v_listing.id, v_listing.reference_number, v_listing.user_id, v_other)
  on conflict (listing_id, counterparty_id)
    where listing_id is not null and counterparty_id is not null
  do nothing;
  return new;
end;
$function$;

drop trigger if exists trg_open_deal_on_forward on public.message_forward_log;
create trigger trg_open_deal_on_forward
  after insert on public.message_forward_log
  for each row execute function public.open_deal_on_forward();

-- --------------------------------------------- stages, outcome, history --
create or replace function public.guard_deal_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_by uuid := public.current_profile_id();
  f text;
  o text; n text;
begin
  -- Who, which listing and when it opened are facts, not answers.
  -- The one change allowed to them is to NULL: that is the foreign key
  -- blanking a deleted member or listing, and refusing it made deleting a
  -- member silently keep their link (found by sql/tests/21 T11).
  new.id := old.id; new.listing_ref := old.listing_ref; new.opened_at := old.opened_at;
  if new.listing_id is not null then new.listing_id := old.listing_id; end if;
  if new.owner_id is not null then new.owner_id := old.owner_id; end if;
  if new.counterparty_id is not null then new.counterparty_id := old.counterparty_id; end if;

  -- Each stage's date is the server's clock, stamped once, the first time
  -- that stage is reached. A date sent by a browser is ignored. Reaching
  -- "introduced" without passing "agreed" stamps both.
  new.agreed_at := old.agreed_at; new.introduced_at := old.introduced_at; new.closed_at := old.closed_at;
  -- Closing straight from negotiating (it fell through) stamps neither.
  if new.stage in ('agreed','introduced') and new.agreed_at is null then new.agreed_at := now(); end if;
  if new.stage = 'introduced' and new.introduced_at is null then new.introduced_at := now(); end if;
  if new.stage = 'closed' and new.closed_at is null then new.closed_at := now(); end if;
  new.updated_at := now();

  foreach f in array array['stage','docs_match','docs_genuine','offer_real','deal_result','note',
                           'listing_id','owner_id','counterparty_id'] loop
    execute format('select ($1).%I::text, ($2).%I::text', f, f) into o, n using old, new;
    if o is distinct from n then
      insert into public.deal_history (deal_id, field, old_value, new_value, changed_by)
      values (old.id, f, o, n, v_by);
    end if;
  end loop;
  return new;
end;
$function$;

drop trigger if exists trg_guard_deal_update on public.deals;
create trigger trg_guard_deal_update
  before update on public.deals
  for each row execute function public.guard_deal_update();

revoke execute on function public.open_deal_on_forward() from public, anon;
revoke execute on function public.guard_deal_update() from public, anon;

commit;
