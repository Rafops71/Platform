-- 34_documents_questions.sql
--
-- Proves sql/063 and its revert (owner's decisions F2 + F3, 2026-11-15):
--   * a Buy request is accepted with no document answer at all;
--   * a Sell offer is accepted with only docs_seen (docs_showable is no longer asked);
--   * a Sell offer with no docs_seen is still refused, in one sentence;
--   * nothing is cleared: a stored docs_showable stays on a listing, also after the member
--     edits another field of it;
--   * the new function differs from 060's ONLY in the documents check, and keeps its
--     volatility, security setting, search_path, grants, owner and return type;
--   * the revert brings back "both answers on every listing", the trigger stays in place, and
--     re-applying gives exactly what 063 first produced. The file ends with 063 applied.

\set QUIET on
\pset pager off

\echo
\echo '=========== DOCUMENTS QUESTIONS (BUY SKIPS, SHOWABLE GONE) ==========='

-- 064 changed the same function again: step back to 063's state for this file, forward again at the end.
\i sql/revert/064_dated_statements_revert.sql

select public.test_invite('doc-member@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('f4f4f4f4-0034-0034-0034-000000000034'::uuid, 'doc-member@example.invalid',
  jsonb_build_object('first_name','Dora','last_name','Documents','phone','+3200003401',
                     'country','Chile','language','en'));
update public.profiles set status = 'approved' where email = 'doc-member@example.invalid';
select public.test_sign_approved();

create temp table t34 (label text, msg text);
grant all on t34 to authenticated;
create temp table t34_new as
select pg_get_functiondef(p.oid) as def, p.provolatile, p.prosecdef, p.proconfig::text as cfg,
       p.proacl::text as acl, p.proowner::regrole::text as owner, p.prorettype::regtype::text as rt
  from pg_proc p where p.proname = 'enforce_listing_statements' and p.pronamespace = 'public'::regnamespace;

set role authenticated; set test.uid='f4f4f4f4-0034-0034-0034-000000000034';
do $$
declare
  me uuid := (select id from public.profiles where email = 'doc-member@example.invalid');
begin
  begin  -- a Buy request, no document answer at all
    insert into public.listings (user_id, type, commodity, incoterm, destination, reference_number,
                                 poster_role, truth_confirmed)
    values (me, 'buy', 'Doc Copper', 'FOB', 'Chile', 'BUY-DOC-1', 'principal', true);
    insert into t34 values ('buy no docs', 'ACCEPTED');
  exception when others then insert into t34 values ('buy no docs', sqlerrm); end;

  begin  -- a Sell offer with docs_seen only
    insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number,
                                 poster_role, principal_kind, docs_seen, truth_confirmed)
    values (me, 'sell', 'Doc Copper', 'FOB', 'Chile', 'SELL-DOC-1', 'principal', 'producer', 'yes', true);
    insert into t34 values ('sell seen only', 'ACCEPTED');
  exception when others then insert into t34 values ('sell seen only', sqlerrm); end;

  begin  -- a Sell offer with no docs_seen: still refused
    insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number,
                                 poster_role, principal_kind, truth_confirmed)
    values (me, 'sell', 'Doc Copper', 'FOB', 'Chile', 'SELL-DOC-2', 'principal', 'producer', true);
    insert into t34 values ('sell no seen', 'ACCEPTED');
  exception when others then insert into t34 values ('sell no seen', sqlerrm); end;

  begin  -- an older-style Sell offer that still sends docs_showable: stored, not cleared
    insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number,
                                 poster_role, principal_kind, docs_seen, docs_showable, truth_confirmed)
    values (me, 'sell', 'Doc Copper', 'FOB', 'Chile', 'SELL-DOC-3', 'principal', 'producer', 'no', 'after_agreement', true);
    insert into t34 values ('sell old style', 'ACCEPTED');
  exception when others then insert into t34 values ('sell old style', sqlerrm); end;
end $$;

-- The member edits another field of the older listing, without touching the answers.
update public.listings set notes = 'edited', truth_confirmed = true where reference_number = 'SELL-DOC-3';
reset role; reset test.uid;

select case when (select msg from t34 where label = 'buy no docs') = 'ACCEPTED'
             and exists (select 1 from public.listings where reference_number = 'BUY-DOC-1' and docs_seen is null and docs_showable is null)
            then 'PASS' else 'FAIL ' || (select msg from t34 where label = 'buy no docs') end
  as "T1 a Buy request is accepted with no document answer, and none is stored";

select case when (select msg from t34 where label = 'sell seen only') = 'ACCEPTED'
             and exists (select 1 from public.listings where reference_number = 'SELL-DOC-1' and docs_seen = 'yes' and docs_showable is null)
            then 'PASS' else 'FAIL ' || (select msg from t34 where label = 'sell seen only') end
  as "T2 a Sell offer is accepted with only the seen-documents answer";

select case when (select msg from t34 where label = 'sell no seen') = 'Please answer the question about documents.'
             and not exists (select 1 from public.listings where reference_number = 'SELL-DOC-2')
            then 'PASS' else 'FAIL got ' || (select msg from t34 where label = 'sell no seen') end
  as "T3 a Sell offer with no seen-documents answer is refused, in one sentence, and not saved";

select case when exists (select 1 from public.listings where reference_number = 'SELL-DOC-3'
                          and docs_seen = 'no' and docs_showable = 'after_agreement' and notes = 'edited')
            then 'PASS' else 'FAIL' end
  as "T4 a stored docs_showable stays on the listing, also after the member edits another field";

-- 063 against 060 (the revert), compared as text, then put forward again.
\i sql/revert/063_documents_questions_revert.sql

create temp table t34_old as
select pg_get_functiondef(p.oid) as def, p.provolatile, p.prosecdef, p.proconfig::text as cfg,
       p.proacl::text as acl, p.proowner::regrole::text as owner, p.prorettype::regtype::text as rt
  from pg_proc p where p.proname = 'enforce_listing_statements' and p.pronamespace = 'public'::regnamespace;

select case when position('Please answer both questions about documents.' in def) > 0 then 'PASS' else 'FAIL' end
  as "T5 after the revert the function asks for both document answers again"
from t34_old;

-- Comments dropped and whitespace flattened, then the one documents check swapped back.
select case when regexp_replace(regexp_replace(n.def, '--[^\n]*', '', 'g'), '\s+', ' ', 'g') like '%if new.type = ''sell'' and new.docs_seen is null then raise exception ''Please answer the question about documents.'' using errcode = ''22023''; end if;%'
             and replace(regexp_replace(regexp_replace(n.def, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'),
                   'if new.type = ''sell'' and new.docs_seen is null then raise exception ''Please answer the question about documents.''',
                   'if new.docs_seen is null or new.docs_showable is null then raise exception ''Please answer both questions about documents.''')
               = regexp_replace(regexp_replace(o.def, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')
            then 'PASS' else 'FAIL the two functions differ by more than the documents check' end
  as "T6 the new and old function are identical apart from the documents check"
from t34_new n, t34_old o;

select case when n.provolatile = o.provolatile and n.prosecdef = o.prosecdef and n.cfg = o.cfg
              and n.acl is not distinct from o.acl and n.owner = o.owner and n.rt = o.rt
            then 'PASS' else 'FAIL' end
  as "T7 volatility, security setting, search_path, grants, owner and return type are unchanged"
from t34_new n, t34_old o;

select case when count(*) = 1 then 'PASS' else 'FAIL got ' || count(*) end
  as "T8 the trigger that uses the function is still in place after the revert"
from pg_trigger t where t.tgname = 'trg_enforce_listing_statements' and not t.tgisinternal;

\i sql/063_documents_questions.sql

select case when pg_get_functiondef(p.oid) = (select def from t34_new)
            then 'PASS' else 'FAIL' end
  as "T9 after revert and re-apply the function is exactly what 063 first produced"
from pg_proc p where p.proname = 'enforce_listing_statements' and p.pronamespace = 'public'::regnamespace;

\i sql/063_documents_questions.sql

select case when pg_get_functiondef(p.oid) = (select def from t34_new)
            then 'PASS' else 'FAIL' end
  as "T10 applying 063 a second time changes nothing (idempotent)"
from pg_proc p where p.proname = 'enforce_listing_statements' and p.pronamespace = 'public'::regnamespace;

-- Leave the suite as it expects: 064 applied again, no fixtures of this file behind.
\i sql/064_dated_statements.sql

delete from public.listings where reference_number in ('BUY-DOC-1','SELL-DOC-1','SELL-DOC-3');
