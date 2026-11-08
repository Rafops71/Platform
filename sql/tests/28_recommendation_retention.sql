-- 28_recommendation_retention.sql
--
-- Proves sql/055: closed recommendations older than 12 months are purged; open
-- ones, recent ones and the invitations themselves are not; only the service
-- role may run the purge.

\set QUIET on
\pset pager off

select public.test_invite('ret-op@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('f8f80001-0001-0001-0001-000000000001'::uuid, 'ret-op@example.invalid',
  jsonb_build_object('first_name','Ruth','last_name','Keeper','phone','+3200000801',
                     'country','Chile','language','en'));
select public.test_invite('ret-ref@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('f8f80002-0002-0002-0002-000000000002'::uuid, 'ret-ref@example.invalid',
  jsonb_build_object('first_name','Rene','last_name','Referee','phone','+3200000802',
                     'country','Chile','language','en'));
update public.profiles set status = 'approved', role = 'operator' where email = 'ret-op@example.invalid';
update public.profiles set status = 'approved' where email = 'ret-ref@example.invalid';
select public.test_sign_approved();

\echo
\echo '=========== FIXTURES: RECOMMENDATIONS OF DIFFERENT AGES ==========='

-- Invitations, with their own history. invite_old was used 13 months ago,
-- invite_recent 11 months ago, invite_pending is unused and unexpired,
-- invite_expired expired 13 months ago and was never used.
insert into public.invitations (token, email, language, created_by, created_at, expires_at, used_at)
select 'ret' || t.k || repeat('x', 40), t.email, 'en',
       (select id from public.profiles where email = 'ret-op@example.invalid'),
       now() - interval '14 months', t.expires_at, t.used_at
  from (values
    ('old',     'ret-old@example.invalid',     now() - interval '12 months' - interval '1 month', null::timestamptz),
    ('recent',  'ret-recent@example.invalid',  now() + interval '1 day',                          now() - interval '11 months'),
    ('pending', 'ret-pending@example.invalid', now() + interval '1 day',                          null::timestamptz),
    ('expired', 'ret-expired@example.invalid', now() - interval '12 months' - interval '1 month', null::timestamptz)
  ) as t(k, email, expires_at, used_at);

-- old-used: invitation used 13 months ago -> closed 13 months ago.
-- Stored with status invited; its invitation is the 'old' one with used_at set below.
update public.invitations set used_at = now() - interval '13 months'
 where token = 'retold' || repeat('x', 40);

insert into public.candidate_recommendations
  (referrer_id, candidate_name, candidate_company, candidate_email, how_known,
   commodities, agreed_contact, own_experience, status, invitation_id, created_at, decided_at, decided_by)
select rf.id, v.name, 'Ret Co', v.email, 'known', 'Copper', true, 'exp', v.status,
       (select id from public.invitations where token = v.tok),
       v.decided - interval '1 day', v.decided, op.id
  from public.profiles rf, public.profiles op,
       (values
         ('Ret Declined Old',    'ret-d-old@example.invalid',    'declined', now() - interval '13 months', null),
         ('Ret Declined Recent', 'ret-d-recent@example.invalid', 'declined', now() - interval '11 months', null),
         ('Ret Invited Used Old','ret-i-old@example.invalid',    'invited',  now() - interval '13 months', 'retold' || repeat('x', 40)),
         ('Ret Invited Recent',  'ret-i-recent@example.invalid', 'invited',  now() - interval '11 months', 'retrecent' || repeat('x', 40)),
         ('Ret Invited Pending', 'ret-i-pending@example.invalid','invited',  now() - interval '13 months', 'retpending' || repeat('x', 40)),
         ('Ret Invited Expired', 'ret-i-expired@example.invalid','invited',  now() - interval '13 months', 'retexpired' || repeat('x', 40)),
         ('Ret Still Open Old',  'ret-o-old@example.invalid',    'open',     now() - interval '13 months', null)
       ) as v(name, email, status, decided, tok)
 where rf.email = 'ret-ref@example.invalid' and op.email = 'ret-op@example.invalid';

-- Set the invitations' own dates to match the story above.
update public.invitations set used_at = null where token like 'retpending%' or token like 'retexpired%';
update public.invitations set expires_at = now() - interval '13 months' where token like 'retexpired%';
update public.invitations set expires_at = now() + interval '1 day' where token like 'retpending%';

-- A recommendation whose invitation was deleted, closed 13 months ago.
insert into public.candidate_recommendations
  (referrer_id, candidate_name, candidate_company, candidate_email, how_known,
   commodities, agreed_contact, own_experience, status, invitation_id, created_at, decided_at, decided_by)
select rf.id, 'Ret Invited Deleted', 'Ret Co', 'ret-i-deleted@example.invalid', 'known', 'Copper', true, 'exp',
       'invited', null, now() - interval '14 months', now() - interval '13 months', op.id
  from public.profiles rf, public.profiles op
 where rf.email = 'ret-ref@example.invalid' and op.email = 'ret-op@example.invalid';

\echo
\echo '=========== ONLY THE SERVICE ROLE MAY PURGE ==========='

-- Captures what each caller was told.
create temp table t28 (msg text, n integer);
grant all on t28 to authenticated, anon, service_role;

set role authenticated; set test.uid = 'f8f80001-0001-0001-0001-000000000001';
do $$ begin
  perform public.purge_closed_candidate_recommendations();
  insert into t28 (msg) values ('OPERATOR_RAN');
exception when others then insert into t28 (msg) values ('ERR ' || sqlerrm); end $$;
reset role; reset test.uid;

set role anon;
do $$ begin
  perform public.purge_closed_candidate_recommendations();
  insert into t28 (msg) values ('ANON_RAN');
exception when others then insert into t28 (msg) values ('ERR ' || sqlerrm); end $$;
reset role;

select case when exists (select 1 from t28 where msg = 'ERR permission denied for function purge_closed_candidate_recommendations')
             and not exists (select 1 from t28 where msg in ('OPERATOR_RAN', 'ANON_RAN'))
            then 'PASS' else 'FAIL' end
  as "T1 Retention the purge cannot be run by an Operator, a member or anonymous callers";

\echo
\echo '=========== THE PURGE REMOVES ONLY CLOSED RECOMMENDATIONS OVER 12 MONTHS OLD ==========='

set role service_role;
insert into t28 (msg, n) values ('RUN', public.purge_closed_candidate_recommendations());
reset role;

select case when not exists (select 1 from public.candidate_recommendations
                              where candidate_name in ('Ret Declined Old', 'Ret Invited Used Old',
                                                        'Ret Invited Expired', 'Ret Invited Deleted'))
            then 'PASS' else 'FAIL an old closed recommendation was kept' end
  as "T2 Retention a closed recommendation is purged 12 months after it closed";

select case when exists (select 1 from public.candidate_recommendations
                          where candidate_name in ('Ret Declined Recent', 'Ret Invited Recent',
                                                    'Ret Invited Pending', 'Ret Still Open Old'))
            then 'PASS' else 'FAIL a recent, pending or open recommendation was purged' end
  as "T3 Retention open, pending and recent recommendations are kept";

select case when (select n from t28 where msg = 'RUN') = 4
            then 'PASS' else 'FAIL purged ' || coalesce((select n::text from t28 where msg = 'RUN'), 'nothing') end
  as "T4 Retention the purge reports exactly the four it removed";

select case when (select count(*) from public.invitations where email in
                    ('ret-old@example.invalid', 'ret-recent@example.invalid',
                     'ret-pending@example.invalid', 'ret-expired@example.invalid')) = 4
            then 'PASS' else 'FAIL an invitation was removed' end
  as "T5 Retention the invitations themselves are not purged here";
