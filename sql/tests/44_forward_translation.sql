-- 44_forward_translation.sql
--
-- Proves sql/073 and its revert (a forwarded message can carry the Operator's translation; owner, 19 Nov 2026,
-- batch 2 point 2):
--   * an Operator can store a translation with a forward; a forward without one works exactly as before;
--   * the RECIPIENT reads it; the message's SENDER and a third member cannot;
--   * nobody can change or delete a stored translation afterwards (no update or delete policy);
--   * a member cannot write a forward row at all (so cannot attach a translation);
--   * the check: both empty, or a language of en/es with 1 to 6,000 characters; nothing else is stored;
--   * the message text itself is untouched;
--   * the revert drops the columns and the check and touches nothing else; re-applying restores them; twice is harmless.
-- Ends with 073 applied, as the rest of the suite expects.

\set QUIET on
\pset pager off

\echo
\echo '=========== A FORWARDED MESSAGE CARRIES ITS TRANSLATION ==========='

select public.test_invite('ft-sender@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('44440000-0044-4444-8444-00000000000a'::uuid, 'ft-sender@example.invalid', jsonb_build_object('first_name', 'Sven', 'last_name', 'Sender'));
select public.test_invite('ft-recip@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('44440000-0044-4444-8444-00000000000b'::uuid, 'ft-recip@example.invalid', jsonb_build_object('first_name', 'Rita', 'last_name', 'Recipient'));
select public.test_invite('ft-third@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('44440000-0044-4444-8444-00000000000c'::uuid, 'ft-third@example.invalid', jsonb_build_object('first_name', 'Theo', 'last_name', 'Third'));
select public.test_invite('ft-op@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('44440000-0044-4444-8444-00000000000d'::uuid, 'ft-op@example.invalid', jsonb_build_object('first_name', 'Olga', 'last_name', 'Operator'));

update public.profiles set status = 'approved'
 where user_id in ('44440000-0044-4444-8444-00000000000a'::uuid, '44440000-0044-4444-8444-00000000000b'::uuid, '44440000-0044-4444-8444-00000000000c'::uuid);
update public.profiles set role = 'operator', status = 'approved' where user_id = '44440000-0044-4444-8444-00000000000d'::uuid;

insert into public.messages (id, sender_id, body, status)
select '44440000-0044-4444-8444-0000000000f1'::uuid, id, 'Podemos ofrecer cinco mil toneladas.', 'forwarded'
  from public.profiles where user_id = '44440000-0044-4444-8444-00000000000a'::uuid;

create temp table t44_result (name text, ok boolean, note text);
grant all on t44_result to authenticated;

-- ---- the Operator forwards with a translation ----
set role authenticated; set "test.uid" = '44440000-0044-4444-8444-00000000000d';
insert into public.message_forward_log (message_id, operator_id, to_user_id, translation, translation_lang)
select '44440000-0044-4444-8444-0000000000f1'::uuid, o.id, r.id, 'We can offer five thousand tons.', 'en'
  from public.profiles o, public.profiles r
 where o.user_id = '44440000-0044-4444-8444-00000000000d'::uuid and r.user_id = '44440000-0044-4444-8444-00000000000b'::uuid;
reset role; reset "test.uid";

select case when count(*) = 1 and bool_and(translation = 'We can offer five thousand tons.' and translation_lang = 'en')
            then 'PASS' else 'FAIL got ' || count(*) end
  as "T1 an Operator stores a translation with a forward, exactly as given"
from public.message_forward_log where message_id = '44440000-0044-4444-8444-0000000000f1'::uuid;

-- ---- who can read it ----
set role authenticated; set "test.uid" = '44440000-0044-4444-8444-00000000000b';
create temp table t44_recip as select translation, translation_lang from public.message_forward_log;
reset role; reset "test.uid";
select case when (select count(*) from t44_recip) = 1 and (select translation from t44_recip) = 'We can offer five thousand tons.'
            then 'PASS' else 'FAIL' end
  as "T2 the recipient reads the translation";

set role authenticated; set "test.uid" = '44440000-0044-4444-8444-00000000000a';
create temp table t44_sender as select translation from public.message_forward_log;
create temp table t44_sender_msg as select body from public.messages where id = '44440000-0044-4444-8444-0000000000f1'::uuid;
reset role; reset "test.uid";
select case when (select count(*) from t44_sender) = 0 and (select count(*) from t44_sender_msg) = 1
            then 'PASS' else 'FAIL' end
  as "T3 the message's sender cannot read the forward row or its translation (their own message is still theirs)";

set role authenticated; set "test.uid" = '44440000-0044-4444-8444-00000000000c';
create temp table t44_third as select translation from public.message_forward_log;
reset role; reset "test.uid";
select case when (select count(*) from t44_third) = 0 then 'PASS' else 'FAIL' end
  as "T4 a third member cannot read it";

-- ---- nobody can change or delete it; a member cannot write a forward row ----
set role authenticated; set "test.uid" = '44440000-0044-4444-8444-00000000000b';
do $$ declare n int; begin
  update public.message_forward_log set translation = 'changed by the recipient';
  get diagnostics n = row_count;
  insert into t44_result values ('T5', n = 0, 'updated ' || n);
exception when others then insert into t44_result values ('T5', true, sqlstate);
end $$;
reset role; reset "test.uid";
set role authenticated; set "test.uid" = '44440000-0044-4444-8444-00000000000d';
do $$ declare n int; begin
  update public.message_forward_log set translation = 'changed by an Operator';
  get diagnostics n = row_count;
  insert into t44_result values ('T6', n = 0, 'updated ' || n);
exception when others then insert into t44_result values ('T6', true, sqlstate);
end $$;
do $$ declare n int; begin
  delete from public.message_forward_log;
  get diagnostics n = row_count;
  insert into t44_result values ('T7', n = 0, 'deleted ' || n);
exception when others then insert into t44_result values ('T7', true, sqlstate);
end $$;
reset role; reset "test.uid";
select case when (select ok from t44_result where name = 'T5') and (select ok from t44_result where name = 'T6')
             and (select ok from t44_result where name = 'T7')
             and (select translation from public.message_forward_log where message_id = '44440000-0044-4444-8444-0000000000f1'::uuid) = 'We can offer five thousand tons.'
            then 'PASS' else 'FAIL' end
  as "T5 a stored translation cannot be changed or deleted by the recipient or by an Operator (no update or delete policy)";

set role authenticated; set "test.uid" = '44440000-0044-4444-8444-00000000000a';
do $$ begin
  insert into public.message_forward_log (message_id, operator_id, to_user_id, translation, translation_lang)
  select '44440000-0044-4444-8444-0000000000f1'::uuid, p.id, p.id, 'planted', 'en'
    from public.profiles p where p.user_id = '44440000-0044-4444-8444-00000000000a'::uuid;
  insert into t44_result values ('T8', false, 'accepted');
exception when others then insert into t44_result values ('T8', true, sqlstate);
end $$;
reset role; reset "test.uid";
select case when ok then 'PASS' else 'FAIL ' || coalesce(note, '') end
  as "T6 a member cannot write a forward row, so cannot attach a translation" from t44_result where name = 'T8';

-- ---- the check ----
create temp table t44_bad (label text, lang text, tr text);
insert into t44_bad values
  ('a language other than en or es', 'fr', 'Bonjour'),
  ('a translation with no language', null, 'We can offer'),
  ('a language with no translation', 'en', null),
  ('an empty translation', 'en', ''),
  ('a translation of 6,001 characters', 'en', repeat('x', 6001));
do $$
declare r record; accepted text := '';
begin
  for r in select * from t44_bad loop
    begin
      insert into public.message_forward_log (message_id, operator_id, to_user_id, translation, translation_lang)
      select '44440000-0044-4444-8444-0000000000f1'::uuid, o.id, rc.id, r.tr, r.lang
        from public.profiles o, public.profiles rc
       where o.user_id = '44440000-0044-4444-8444-00000000000d'::uuid and rc.user_id = '44440000-0044-4444-8444-00000000000c'::uuid;
      accepted := accepted || r.label || '; ';
    exception when check_violation then null;
    end;
  end loop;
  insert into t44_result values ('T9', accepted = '', accepted);
end $$;
select case when ok then 'PASS' else 'FAIL accepted: ' || coalesce(note, '') end
  as "T7 the check refuses a wrong language, a lone translation, a lone language, an empty translation and 6,001 characters"
  from t44_result where name = 'T9';

insert into public.message_forward_log (message_id, operator_id, to_user_id, translation, translation_lang)
select '44440000-0044-4444-8444-0000000000f1'::uuid, o.id, rc.id, repeat('x', 6000), 'es'
  from public.profiles o, public.profiles rc
 where o.user_id = '44440000-0044-4444-8444-00000000000d'::uuid and rc.user_id = '44440000-0044-4444-8444-00000000000c'::uuid;
insert into public.message_forward_log (message_id, operator_id, to_user_id)
select '44440000-0044-4444-8444-0000000000f1'::uuid, o.id, rc.id
  from public.profiles o, public.profiles rc
 where o.user_id = '44440000-0044-4444-8444-00000000000d'::uuid and rc.user_id = '44440000-0044-4444-8444-00000000000a'::uuid;
select case when (select count(*) from public.message_forward_log where message_id = '44440000-0044-4444-8444-0000000000f1'::uuid and translation is null and translation_lang is null) = 1
             and (select count(*) from public.message_forward_log where message_id = '44440000-0044-4444-8444-0000000000f1'::uuid and char_length(translation) = 6000 and translation_lang = 'es') = 1
            then 'PASS' else 'FAIL' end
  as "T8 6,000 characters in Spanish is accepted, and a forward with no translation is stored exactly as before";

select case when (select body from public.messages where id = '44440000-0044-4444-8444-0000000000f1'::uuid) = 'Podemos ofrecer cinco mil toneladas.'
            then 'PASS' else 'FAIL' end
  as "T9 the message text itself is untouched";

-- ---- revert and re-apply ----
create temp table t44_cols as
  select string_agg(column_name, ',' order by ordinal_position) c from information_schema.columns
   where table_schema = 'public' and table_name = 'message_forward_log';
\i sql/revert/073_forward_translation_revert.sql
select case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'message_forward_log' and column_name in ('translation', 'translation_lang'))
             and not exists (select 1 from pg_constraint where conname = 'message_forward_log_translation_check')
             and (select count(*) from public.message_forward_log where message_id = '44440000-0044-4444-8444-0000000000f1'::uuid) = 3
             and (select body from public.messages where id = '44440000-0044-4444-8444-0000000000f1'::uuid) = 'Podemos ofrecer cinco mil toneladas.'
            then 'PASS' else 'FAIL' end
  as "T10 the revert drops the two columns and the check and leaves every forward row and every message in place";
\i sql/073_forward_translation.sql
select case when (select c from t44_cols) = (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
                    where table_schema = 'public' and table_name = 'message_forward_log')
             and exists (select 1 from pg_constraint where conname = 'message_forward_log_translation_check')
            then 'PASS' else 'FAIL' end
  as "T11 after the revert and re-apply the columns and the check are back";
\i sql/073_forward_translation.sql
select case when (select count(*) from pg_constraint where conname = 'message_forward_log_translation_check') = 1
            then 'PASS' else 'FAIL' end
  as "T12 applying 073 a second time changes nothing (idempotent)";

delete from public.message_forward_log where message_id = '44440000-0044-4444-8444-0000000000f1'::uuid;
