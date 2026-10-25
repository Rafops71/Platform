-- 21_deal_files.sql
--
-- Proves sql/035: a deal file opens by itself on the first forward, one per
-- pair; only Operators can see or change it; every change keeps the old
-- answer, who and when; nothing is deleted; and the file outlives a member.

\set QUIET on
\pset pager off

\echo
\echo '=========== A DEAL FILE OPENS BY ITSELF ==========='

select public.test_invite('deal-op@example.invalid');
insert into auth.users (id, email, raw_user_meta_data) values
 ('d1d1d1d1-0001-0001-0001-000000000001'::uuid, 'deal-op@example.invalid',
  jsonb_build_object('first_name','Opal','last_name','Operator','phone','+3200000301','country','Chile','language','en'));
update public.profiles set role = 'operator', status = 'approved' where email = 'deal-op@example.invalid';

select public.test_invite('deal-owner@example.invalid');
insert into auth.users (id, email, raw_user_meta_data) values
 ('d1d1d1d1-0002-0002-0002-000000000002'::uuid, 'deal-owner@example.invalid',
  jsonb_build_object('first_name','Owen','last_name','Owner','phone','+3200000302','country','Chile','language','en'));
select public.test_invite('deal-buyer@example.invalid');
insert into auth.users (id, email, raw_user_meta_data) values
 ('d1d1d1d1-0003-0003-0003-000000000003'::uuid, 'deal-buyer@example.invalid',
  jsonb_build_object('first_name','Bea','last_name','Buyer','phone','+3200000303','country','Peru','language','en'));
update public.profiles set status = 'approved' where email in ('deal-owner@example.invalid','deal-buyer@example.invalid');
select public.test_sign_approved();

insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number)
select id, 'sell', 'Deal Copper', 'FOB', 'Chile', 'SELL-DEAL-1' from public.profiles where email = 'deal-owner@example.invalid';

-- The buyer's enquiry, as the buyer. A member cannot read another member's
-- listing row, only Browse, so the listing's id is handed over the way the
-- page gets it - here through a temp table.
create temp table t21 as select id as listing_id from public.listings where reference_number = 'SELL-DEAL-1';
grant select on t21 to authenticated;
set role authenticated; set test.uid='d1d1d1d1-0003-0003-0003-000000000003';
insert into public.messages (sender_id, listing_id, subject, body)
select p.id, (select listing_id from t21), 'Price?', 'What is your best FOB price?'
  from public.profiles p where p.email = 'deal-buyer@example.invalid';
reset role; reset test.uid;

select case when count(*) = 0 then 'PASS' else 'FAIL got ' || count(*) end
  as "T1 an enquiry alone opens no file - the Operator has not acted"
from public.deals where listing_ref = 'SELL-DEAL-1';

-- The Operator forwards it to the owner.
set role authenticated; set test.uid='d1d1d1d1-0001-0001-0001-000000000001';
insert into public.message_forward_log (message_id, operator_id, to_user_id)
select m.id, (select id from public.profiles where email = 'deal-op@example.invalid'), l.user_id
  from public.messages m join public.listings l on l.id = m.listing_id
 where l.reference_number = 'SELL-DEAL-1';
reset role; reset test.uid;

select case when count(*) = 1
             and bool_and(stage = 'negotiating'
                          and owner_id = (select id from public.profiles where email = 'deal-owner@example.invalid')
                          and counterparty_id = (select id from public.profiles where email = 'deal-buyer@example.invalid'))
            then 'PASS' else 'FAIL got ' || count(*) end
  as "T2 Item70 the first forward opens one file, owner and counterparty right"
from public.deals where listing_ref = 'SELL-DEAL-1';

-- The owner replies and the Operator forwards the reply back: same pair.
set role authenticated; set test.uid='d1d1d1d1-0002-0002-0002-000000000002';
insert into public.messages (sender_id, listing_id, subject, body)
select p.id, l.id, 'Re: Price?', 'USD 9,100 FOB'
  from public.profiles p, public.listings l
 where p.email = 'deal-owner@example.invalid' and l.reference_number = 'SELL-DEAL-1';
reset role; reset test.uid;

set role authenticated; set test.uid='d1d1d1d1-0001-0001-0001-000000000001';
insert into public.message_forward_log (message_id, operator_id, to_user_id)
select m.id, (select id from public.profiles where email = 'deal-op@example.invalid'),
       (select id from public.profiles where email = 'deal-buyer@example.invalid')
  from public.messages m where m.body = 'USD 9,100 FOB';
reset role; reset test.uid;

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T3 Item70 forwarding back and forth stays one file"
from public.deals where listing_ref = 'SELL-DEAL-1';

\echo
\echo '=========== ONLY OPERATORS ==========='

set role authenticated; set test.uid='d1d1d1d1-0002-0002-0002-000000000002';
select case when (select count(*) from public.deals) = 0 and (select count(*) from public.deal_history) = 0
            then 'PASS' else 'FAIL' end
  as "T4 Item71 a member sees no deal file and no history, even their own";
update public.deals set docs_match = 'matched' where listing_ref = 'SELL-DEAL-1';
reset role; reset test.uid;

select case when docs_match is null then 'PASS' else 'FAIL changed by a member' end
  as "T5 Item71 a member cannot change a deal file"
from public.deals where listing_ref = 'SELL-DEAL-1';

\echo
\echo '=========== STAGES AND OUTCOME ==========='

set role authenticated; set test.uid='d1d1d1d1-0001-0001-0001-000000000001';
update public.deals set stage = 'agreed', agreed_at = '2001-01-01' where listing_ref = 'SELL-DEAL-1';
reset role; reset test.uid;

select case when agreed_at > now() - interval '5 minutes' and introduced_at is null then 'PASS'
            else 'FAIL ' || coalesce(agreed_at::text, 'null') end
  as "T6 agreeing stamps the server's date, not one sent to it"
from public.deals where listing_ref = 'SELL-DEAL-1';

set role authenticated; set test.uid='d1d1d1d1-0001-0001-0001-000000000001';
update public.deals set stage = 'introduced', docs_match = 'never_arrived', note = 'B/L promised, not sent'
 where listing_ref = 'SELL-DEAL-1';
update public.deals set docs_match = 'matched' where listing_ref = 'SELL-DEAL-1';
reset role; reset test.uid;

select case when introduced_at is not null and docs_match = 'matched' then 'PASS' else 'FAIL' end
  as "T7 the introduction is dated and an answer can be corrected"
from public.deals where listing_ref = 'SELL-DEAL-1';

select case when count(*) = 1 and bool_and(h.changed_by = (select id from public.profiles where email = 'deal-op@example.invalid'))
            then 'PASS' else 'FAIL got ' || count(*) end
  as "T8 Item72 the corrected answer keeps its old value, who and when"
from public.deal_history h join public.deals d on d.id = h.deal_id
where d.listing_ref = 'SELL-DEAL-1' and h.field = 'docs_match'
  and h.old_value = 'never_arrived' and h.new_value = 'matched' and h.changed_at is not null;

-- History and files cannot be removed or rewritten, by an Operator either.
set role authenticated; set test.uid='d1d1d1d1-0001-0001-0001-000000000001';
delete from public.deal_history;
update public.deal_history set new_value = 'tampered';
delete from public.deals;
insert into public.deals (listing_ref) values ('FORGED');
reset role; reset test.uid;

select case when (select count(*) from public.deal_history h join public.deals d on d.id = h.deal_id
                   where d.listing_ref = 'SELL-DEAL-1') >= 4
             and not exists (select 1 from public.deal_history where new_value = 'tampered')
             and (select count(*) from public.deals where listing_ref in ('SELL-DEAL-1','FORGED')) = 1
            then 'PASS' else 'FAIL' end
  as "T9 Item72 no one deletes or rewrites a file or its history, nor forges one";

\echo
\echo '=========== WHAT DOES NOT OPEN A FILE, AND WHAT OUTLIVES A MEMBER ==========='

-- An Operator's own message, forwarded, is not a member's negotiation.
set role authenticated; set test.uid='d1d1d1d1-0001-0001-0001-000000000001';
insert into public.messages (sender_id, listing_id, body)
select p.id, l.id, 'Operator note' from public.profiles p, public.listings l
 where p.email = 'deal-op@example.invalid' and l.reference_number = 'SELL-DEAL-1';
insert into public.message_forward_log (message_id, operator_id, to_user_id)
select m.id, (select id from public.profiles where email = 'deal-op@example.invalid'),
       (select id from public.profiles where email = 'deal-owner@example.invalid')
  from public.messages m where m.body = 'Operator note';
reset role; reset test.uid;

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T10 an Operator's own message opens no file"
from public.deals where listing_ref = 'SELL-DEAL-1';

delete from public.profiles where email = 'deal-buyer@example.invalid';

select case when count(*) = 1 and bool_and(counterparty_id is null and stage = 'introduced')
            then 'PASS' else 'FAIL got ' || count(*) || ' ' || string_agg(coalesce(counterparty_id::text,'null') || '/' || stage, ',') end
  as "T11 deleting a member keeps the deal file and what was recorded"
from public.deals where listing_ref = 'SELL-DEAL-1';

delete from public.deal_history where deal_id in (select id from public.deals where listing_ref = 'SELL-DEAL-1');
delete from public.deals where listing_ref = 'SELL-DEAL-1';
