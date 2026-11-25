-- 46_documents_wording.sql
--
-- Proves sql/075 and its revert (the documents question is asked by role; owner-approved English wording, 23 Nov 2026):
--   * a principal's answer on a Sell offer must be held or not_held, and is stored;
--   * a broker's and a mandated intermediary's answer must be yes, source_says or no, and is stored;
--   * the wrong role's answer is refused (a principal cannot answer yes; a broker cannot answer held);
--   * a Sell offer with no answer is still refused; a Buy request is still asked nothing;
--   * OLD answers are kept: a principal's old 'yes' stays in the column and a change that touches no statement keeps it;
--     a change that does touch a statement makes the principal answer the new question;
--   * the table accepts only the five answers;
--   * the revert puts the old function back (a principal's 'yes' is accepted again) and keeps the widened check; re-applying
--     gives exactly what 075 produced.
-- Ends with 075 applied, as the rest of the suite expects.

\set QUIET on
\pset pager off

\echo
\echo '=========== THE DOCUMENTS QUESTION, BY ROLE ==========='

\i sql/075_documents_wording.sql

select public.test_invite('dw-a@example.invalid');
insert into auth.users (id, email, raw_user_meta_data) values
 ('46464646-0046-0046-0046-000000000001'::uuid, 'dw-a@example.invalid',
  jsonb_build_object('first_name','Dora','last_name','Worder','phone','+3200004601','country','Chile','language','en'));
update public.profiles set status = 'approved' where email = 'dw-a@example.invalid';
select public.test_sign_approved();

create temp table t46_msg (label text, msg text); grant all on t46_msg to authenticated;

-- One helper per attempt: records ACCEPTED or the sentence that refused it.
create or replace function pg_temp.try_post(p_label text, p_role text, p_type text, p_docs text) returns void
language plpgsql as $$
begin
  begin
    insert into public.listings (user_id, type, commodity, incoterm, origin, destination, reference_number,
                                 poster_role, principal_kind, broker_via, has_mandate, mandate_date, docs_seen, truth_confirmed)
    select id, p_type, 'Word Copper ' || p_label, 'FOB', 'Chile', 'Chile', 'SELL-DW-' || p_label,
           p_role, case when p_role = 'principal' and p_type = 'sell' then 'producer' end,
           case when p_role = 'broker' then 'principal' end,
           case when p_role = 'mandated' then true end, case when p_role = 'mandated' then current_date - 1 end,
           p_docs, true
      from public.profiles where email = 'dw-a@example.invalid';
    insert into t46_msg values (p_label, 'ACCEPTED');
  exception when others then insert into t46_msg values (p_label, sqlerrm);
  end;
end $$;
grant execute on function pg_temp.try_post(text, text, text, text) to authenticated;
grant usage on schema pg_temp to authenticated;

set role authenticated; set test.uid = '46464646-0046-0046-0046-000000000001';
select pg_temp.try_post('P1', 'principal', 'sell', 'held');
select pg_temp.try_post('P2', 'principal', 'sell', 'not_held');
select pg_temp.try_post('P3', 'principal', 'sell', 'yes');
select pg_temp.try_post('P4', 'principal', 'sell', 'source_says');
select pg_temp.try_post('B1', 'broker', 'sell', 'yes');
select pg_temp.try_post('B2', 'broker', 'sell', 'source_says');
select pg_temp.try_post('B3', 'broker', 'sell', 'no');
select pg_temp.try_post('B4', 'broker', 'sell', 'held');
select pg_temp.try_post('M1', 'mandated', 'sell', 'yes');
select pg_temp.try_post('M2', 'mandated', 'sell', 'not_held');
select pg_temp.try_post('N1', 'principal', 'sell', null);
select pg_temp.try_post('Y1', 'principal', 'buy', null);
reset role; reset test.uid;

select case when (select count(*) from t46_msg where label in ('P1','P2') and msg = 'ACCEPTED') = 2
             and (select count(*) from public.listings where reference_number = 'SELL-DW-P1' and docs_seen = 'held') = 1
             and (select count(*) from public.listings where reference_number = 'SELL-DW-P2' and docs_seen = 'not_held') = 1
            then 'PASS' else 'FAIL' end
  as "T1 Item94 a principal's held and not_held answers are accepted and stored";
select case when (select count(*) from t46_msg where label in ('P3','P4') and msg = 'Please answer the question about documents.') = 2
            then 'PASS' else 'FAIL ' || (select string_agg(label || '=' || msg, '; ') from t46_msg where label in ('P3','P4')) end
  as "T2 Item94 a principal cannot give a broker's answer (yes, source_says): refused with the existing sentence";
select case when (select count(*) from t46_msg where label in ('B1','B2','B3','M1') and msg = 'ACCEPTED') = 4
            then 'PASS' else 'FAIL ' || (select string_agg(label || '=' || msg, '; ') from t46_msg where label in ('B1','B2','B3','M1')) end
  as "T3 Item94 a broker and a mandated intermediary keep the three answers yes, source_says, no";
select case when (select count(*) from t46_msg where label in ('B4','M2') and msg = 'Please answer the question about documents.') = 2
            then 'PASS' else 'FAIL ' || (select string_agg(label || '=' || msg, '; ') from t46_msg where label in ('B4','M2')) end
  as "T4 Item94 a broker or a mandated intermediary cannot give a principal's answer (held, not_held)";
select case when (select msg from t46_msg where label = 'N1') = 'Please answer the question about documents.'
             and (select msg from t46_msg where label = 'Y1') = 'ACCEPTED'
            then 'PASS' else 'FAIL' end
  as "T5 Item94 a Sell offer with no answer is still refused, and a Buy request is still asked nothing";

-- T6: the table itself accepts only the five answers.
do $$ begin
  begin
    alter table public.listings disable trigger trg_enforce_listing_statements;
    update public.listings set docs_seen = 'maybe' where reference_number = 'SELL-DW-P1';
    insert into t46_msg values ('bad', 'ACCEPTED');
  exception when check_violation then insert into t46_msg values ('bad', 'REFUSED'); end;
  alter table public.listings enable trigger trg_enforce_listing_statements;
end $$;
select case when (select msg from t46_msg where label = 'bad') = 'REFUSED' then 'PASS' else 'FAIL' end
  as "T6 an answer outside the five is refused by the table";

-- OLD answers are kept. A principal's old 'yes' is put in by the server (as an older listing already holds it).
alter table public.listings disable trigger trg_enforce_listing_statements;
update public.listings set docs_seen = 'yes' where reference_number = 'SELL-DW-P1';
alter table public.listings enable trigger trg_enforce_listing_statements;
select case when docs_seen = 'yes' then 'PASS' else 'FAIL' end
  as "T7 Item97 a principal's old 'yes' stays in the column (nothing is mapped or deleted)"
from public.listings where reference_number = 'SELL-DW-P1';

-- A change that touches no statement keeps it (the member only renews / touches updated_at).
set role authenticated; set test.uid = '46464646-0046-0046-0046-000000000001';
update public.listings set updated_at = now() where reference_number = 'SELL-DW-P1';
reset role; reset test.uid;
select case when docs_seen = 'yes' then 'PASS' else 'FAIL ' || coalesce(docs_seen, 'null') end
  as "T8 Item97 a change that touches no statement leaves the old answer untouched"
from public.listings where reference_number = 'SELL-DW-P1';

-- A change that does touch a statement makes the principal answer the NEW question.
set role authenticated; set test.uid = '46464646-0046-0046-0046-000000000001';
do $$ begin
  begin
    update public.listings set notes = 'edited', truth_confirmed = true where reference_number = 'SELL-DW-P1';
    insert into t46_msg values ('edit-old', 'ACCEPTED');
  exception when others then insert into t46_msg values ('edit-old', sqlerrm); end;
  begin
    update public.listings set notes = 'edited', docs_seen = 'held', truth_confirmed = true where reference_number = 'SELL-DW-P1';
    insert into t46_msg values ('edit-new', 'ACCEPTED');
  exception when others then insert into t46_msg values ('edit-new', sqlerrm); end;
end $$;
reset role; reset test.uid;
select case when (select msg from t46_msg where label = 'edit-old') = 'Please answer the question about documents.'
             and (select msg from t46_msg where label = 'edit-new') = 'ACCEPTED'
            then 'PASS' else 'FAIL ' || (select string_agg(label || '=' || msg, '; ') from t46_msg where label like 'edit-%') end
  as "T9 Item97 editing a statement with the old answer is refused; with the new answer it is accepted";

-- ---- the revert ----
\i sql/revert/075_documents_wording_revert.sql
create temp table t46_rev (msg text); grant all on t46_rev to authenticated;
set role authenticated; set test.uid = '46464646-0046-0046-0046-000000000001';
do $$ begin
  begin
    insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number, poster_role, principal_kind, docs_seen, truth_confirmed)
    select id, 'sell', 'Word Copper R', 'FOB', 'Chile', 'SELL-DW-R', 'principal', 'producer', 'yes', true
      from public.profiles where email = 'dw-a@example.invalid';
    insert into t46_rev values ('ACCEPTED');
  exception when others then insert into t46_rev values (sqlerrm); end;
end $$;
reset role; reset test.uid;
select case when (select msg from t46_rev) = 'ACCEPTED' then 'PASS' else 'FAIL ' || (select msg from t46_rev) end
  as "T10 AFTER THE REVERT a principal's 'yes' is accepted again (the 066 function is back)";
select case when exists (select 1 from public.listings where reference_number = 'SELL-DW-P2' and docs_seen = 'not_held')
             and pg_get_constraintdef((select oid from pg_constraint where conname = 'listings_docs_seen_check')) like '%held%'
            then 'PASS' else 'FAIL' end
  as "T11 Item97 the revert keeps the widened check and the stored held / not_held answers";

-- ---- re-apply: exactly what 075 produced ----
\i sql/075_documents_wording.sql
create temp table t46_again (msg text); grant all on t46_again to authenticated;
set role authenticated; set test.uid = '46464646-0046-0046-0046-000000000001';
do $$ begin
  begin
    insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number, poster_role, principal_kind, docs_seen, truth_confirmed)
    select id, 'sell', 'Word Copper S', 'FOB', 'Chile', 'SELL-DW-S', 'principal', 'producer', 'yes', true
      from public.profiles where email = 'dw-a@example.invalid';
    insert into t46_again values ('ACCEPTED');
  exception when others then insert into t46_again values (sqlerrm); end;
end $$;
reset role; reset test.uid;
select case when (select msg from t46_again) = 'Please answer the question about documents.' then 'PASS' else 'FAIL ' || (select msg from t46_again) end
  as "T12 re-applying 075 puts the role check back (a principal's 'yes' is refused again)";
