-- 39_message_on_hold.sql
--
-- Proves sql/068 and its revert ("Please reconcile", owner's idea 4; Item 78 is the mirror):
--   * a message may be 'on_hold' (and the four older statuses still hold, 'denied' included);
--   * only an Operator can put a message on hold (a member cannot change any message's status);
--   * an approved Operator can record 'message_reconcile_requested'; a member cannot;
--   * putting a message on hold counts as the Operator's first action on it (reviewed_at is stamped);
--   * nothing in the message is changed by it (same body, same sender);
--   * the revert returns an on-hold message to 'pending_review', narrows the check, and takes the
--     action name back out; re-applying gives exactly what 068 first produced; applying twice is harmless.
-- Ends with 068 applied, as the rest of the suite expects.

\set QUIET on
\pset pager off

\echo
\echo '=========== MESSAGE ON HOLD ==========='

select public.test_invite('hold-member@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('10990000-0000-4000-8000-00000000039a'::uuid, 'hold-member@example.invalid',
        jsonb_build_object('first_name', 'Hana', 'last_name', 'Holder'));
select public.test_invite('hold-op@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('10990000-0000-4000-8000-00000000039b'::uuid, 'hold-op@example.invalid',
        jsonb_build_object('first_name', 'Olu', 'last_name', 'Operator'));
update public.profiles set status = 'approved' where user_id = '10990000-0000-4000-8000-00000000039a'::uuid;
update public.profiles set role = 'operator', status = 'approved' where user_id = '10990000-0000-4000-8000-00000000039b'::uuid;

insert into public.messages (sender_id, body, status)
select id, 'hold test message: give me 3 weeks to arrange financing', 'pending_review'
  from public.profiles where user_id = '10990000-0000-4000-8000-00000000039a'::uuid;

select case when pg_get_constraintdef(c.oid) like '%''on_hold''%'
             and pg_get_constraintdef(c.oid) like '%''denied''%'
             and pg_get_constraintdef(c.oid) like '%''pending_review''%'
            then 'PASS' else 'FAIL' end
  as "T1 the messages status rule allows on_hold and still allows denied and pending_review"
from pg_constraint c where c.conname = 'messages_status_check';

create temp table t39_before as
  select pg_get_functiondef('public.record_activity(text,jsonb)'::regprocedure) as ra,
         (select pg_get_constraintdef(oid) from pg_constraint where conname = 'messages_status_check') as chk;
create temp table t39_result (name text, ok boolean);
grant all on t39_result to authenticated;

-- T2: a MEMBER cannot change a message's status (the update policy is Operator-only): 0 rows change.
set role authenticated; set "test.uid" = '10990000-0000-4000-8000-00000000039a';
update public.messages set status = 'on_hold' where body like 'hold test message%';
reset role; reset "test.uid";
select case when status = 'pending_review' then 'PASS' else 'FAIL ' || status end
  as "T2 a member cannot put a message on hold"
from public.messages where body like 'hold test message%';

-- T3: the Operator can; the message is otherwise unchanged; reviewed_at is stamped.
set role authenticated; set "test.uid" = '10990000-0000-4000-8000-00000000039b';
update public.messages set status = 'on_hold' where body like 'hold test message%';
reset role; reset "test.uid";
select case when m.status = 'on_hold' and m.body = 'hold test message: give me 3 weeks to arrange financing'
             and m.sender_id = (select id from public.profiles where user_id = '10990000-0000-4000-8000-00000000039a'::uuid)
             and m.reviewed_at is not null
            then 'PASS' else 'FAIL' end
  as "T3 an Operator puts a message on hold: body and sender untouched, first action stamped"
from public.messages m where m.body like 'hold test message%';

-- T4/T5: the activity door.
set role authenticated; set "test.uid" = '10990000-0000-4000-8000-00000000039b';
select public.record_activity('message_reconcile_requested', '{"t":"39"}'::jsonb);
reset role; reset "test.uid";
select case when count(*) = 1 then 'PASS' else 'FAIL wrote ' || count(*) end
  as "T4 an approved Operator can record message_reconcile_requested"
from public.activity_log where action = 'message_reconcile_requested' and details->>'t' = '39';

set role authenticated; set "test.uid" = '10990000-0000-4000-8000-00000000039a';
do $$ begin
  begin perform public.record_activity('message_reconcile_requested', '{"t":"39m"}'::jsonb);
        insert into t39_result values ('member', true);   -- accepted = bad
  exception when others then insert into t39_result values ('member', false); end;
end $$;
reset role; reset "test.uid";
select case when (select ok from t39_result where name = 'member') = false
             and not exists (select 1 from public.activity_log where details->>'t' = '39m')
            then 'PASS' else 'FAIL' end
  as "T5 a member cannot record message_reconcile_requested (nothing is written)";

-- The revert.
\i sql/revert/068_message_on_hold_revert.sql
select case when status = 'pending_review' then 'PASS' else 'FAIL ' || status end
  as "T6 the revert returns an on-hold message to pending_review, nothing deleted"
from public.messages where body like 'hold test message%';
select case when pg_get_constraintdef(c.oid) not like '%on_hold%' and pg_get_constraintdef(c.oid) like '%''denied''%'
            then 'PASS' else 'FAIL' end
  as "T7 after the revert the status rule is the five-value one of sql/052"
from pg_constraint c where c.conname = 'messages_status_check';
select case when position('message_reconcile_requested' in pg_get_functiondef('public.record_activity(text,jsonb)'::regprocedure)) = 0
             and position('message_rewrite_requested' in pg_get_functiondef('public.record_activity(text,jsonb)'::regprocedure)) > 0
            then 'PASS' else 'FAIL' end
  as "T8 after the revert record_activity no longer knows the new action but keeps the rewrite one";

\i sql/068_message_on_hold.sql
select case when pg_get_functiondef('public.record_activity(text,jsonb)'::regprocedure) = (select ra from t39_before)
             and (select pg_get_constraintdef(oid) from pg_constraint where conname = 'messages_status_check') = (select chk from t39_before)
            then 'PASS' else 'FAIL' end
  as "T9 after revert and re-apply the function and the rule are exactly what 068 first produced";

\i sql/068_message_on_hold.sql
select case when pg_get_functiondef('public.record_activity(text,jsonb)'::regprocedure) = (select ra from t39_before)
            then 'PASS' else 'FAIL' end
  as "T10 applying 068 a second time changes nothing (idempotent)";

delete from public.activity_log where details->>'t' = '39';
delete from public.messages where body like 'hold test message%';
