-- 27_candidate_recommendations.sql
--
-- Proves sql/054 (items 81-85): a member recommends a candidate and only the
-- Operator sees it; a member never has more than five open recommendations;
-- a member never sees another member's recommendation; the Operator invites
-- from one and the invitation names the referrer; declining tells nobody.

\set QUIET on
\pset pager off

create temp table t27 (msg text, n integer);
grant all on t27 to authenticated, anon;

\echo
\echo '=========== FIXTURES: AN OPERATOR AND THREE MEMBERS ==========='

select public.test_invite('rec-op@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('f7f70001-0001-0001-0001-000000000001'::uuid, 'rec-op@example.invalid',
  jsonb_build_object('first_name','Ola','last_name','Operator','phone','+3200000701',
                     'country','Chile','language','en'));
select public.test_invite('rec-ref@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('f7f70002-0002-0002-0002-000000000002'::uuid, 'rec-ref@example.invalid',
  jsonb_build_object('first_name','Rita','last_name','Referrer','phone','+3200000702',
                     'country','Chile','language','en'));
select public.test_invite('rec-other@example.invalid');
insert into auth.users (id, email, raw_user_meta_data)
values ('f7f70003-0003-0003-0003-000000000003'::uuid, 'rec-other@example.invalid',
  jsonb_build_object('first_name','Oscar','last_name','Other','phone','+3200000703',
                     'country','Chile','language','en'));
update public.profiles set status = 'approved', role = 'operator'
 where email = 'rec-op@example.invalid';
update public.profiles set status = 'approved'
 where email in ('rec-ref@example.invalid', 'rec-other@example.invalid');
select public.test_sign_approved();

-- What the referrer's inbox and the message table hold before anything is
-- recommended, so later checks can prove that nothing was sent to them.
insert into t27 (msg, n)
select 'BASE_MAIL_TO_REFERRER', count(*) from public.email_outbox
 where to_email = 'rec-ref@example.invalid';
insert into t27 (msg, n)
select 'BASE_MESSAGES', count(*) from public.messages;

\echo
\echo '=========== A MEMBER RECOMMENDS; ONLY THE OPERATOR SEES IT ==========='

set role authenticated; set test.uid = 'f7f70002-0002-0002-0002-000000000002';
do $$ begin
  perform public.submit_candidate_recommendation('Carla Candidate', 'Example Trading SA',
    'Carla.Candidate@Example.invalid', 'how-known-marker-0', 'Copper, Cobalt', true,
    'experience-marker-0');
  insert into t27 (msg) values ('SUBMITTED');
exception when others then insert into t27 (msg) values ('ERR ' || sqlerrm); end $$;
insert into t27 (msg, n)
select 'REFERRER_SEES_ROWS', count(*) from public.candidate_recommendations;
reset role; reset test.uid;

select case when exists (select 1 from t27 where msg = 'SUBMITTED') then 'PASS' else 'FAIL' end
  as "T1 Item81 a member can recommend a candidate";

select case when exists (select 1 from t27 where msg = 'REFERRER_SEES_ROWS' and n = 0) then 'PASS' else 'FAIL the referrer can read the table' end
  as "T2 Item81 the referrer cannot read the recommendation back";

set role authenticated; set test.uid = 'f7f70001-0001-0001-0001-000000000001';
insert into t27 (msg, n)
select 'OPERATOR_LIST', count(*) from public.operator_list_candidate_recommendations()
 where candidate_name = 'Carla Candidate' and referrer_name = 'Rita Referrer';
reset role; reset test.uid;

select case when exists (select 1 from t27 where msg = 'OPERATOR_LIST' and n = 1) then 'PASS' else 'FAIL' end
  as "T3 Item81 the Operator sees the recommendation, with the referrer's name";

\echo
\echo '=========== FIVE OPEN, NO MORE ==========='

set role authenticated; set test.uid = 'f7f70002-0002-0002-0002-000000000002';
do $$ declare i integer; begin
  for i in 1..6 loop
    begin
      perform public.submit_candidate_recommendation('Candidate ' || i, 'Example Co',
        'candidate' || i || '@example.invalid', 'how-known-marker-' || i, 'Copper', false,
        'experience-marker-' || i);
      insert into t27 (msg) values ('OK ' || i);
    exception when others then insert into t27 (msg) values ('ERR ' || sqlerrm); end;
  end loop;
end $$;
reset role; reset test.uid;

select case when (select count(*) from t27 where msg like 'OK %') = 4
             and (select count(*) from t27 where msg = 'ERR You can have up to 5 open recommendations at a time.') = 2
             and (select count(*) from public.candidate_recommendations r
                   join public.profiles p on p.id = r.referrer_id
                  where p.email = 'rec-ref@example.invalid' and r.status = 'open') = 5
            then 'PASS' else 'FAIL' end
  as "T4 Item82 a member can never have more than 5 open recommendations";

\echo
\echo '=========== ANOTHER MEMBER AND ANONYMOUS SEE NOTHING ==========='

set role authenticated; set test.uid = 'f7f70003-0003-0003-0003-000000000003';
insert into t27 (msg, n)
select 'OTHER_SEES_ROWS', count(*) from public.candidate_recommendations;
do $$ begin
  perform * from public.operator_list_candidate_recommendations();
  insert into t27 (msg) values ('OTHER_LISTED');
exception when others then insert into t27 (msg) values ('ERR ' || sqlerrm); end $$;
do $$ begin
  perform public.operator_decline_candidate_recommendation(
    (select id from public.candidate_recommendations limit 1));
  insert into t27 (msg) values ('OTHER_DECLINED');
exception when others then insert into t27 (msg) values ('ERR ' || sqlerrm); end $$;
do $$ begin
  update public.candidate_recommendations set status = 'declined';
  insert into t27 (msg) values ('OTHER_UPDATED');
exception when others then insert into t27 (msg) values ('ERR ' || sqlerrm); end $$;
reset role; reset test.uid;

set role anon;
do $$ begin
  perform count(*) from public.candidate_recommendations;
  insert into t27 (msg) values ('ANON_READ');
exception when others then insert into t27 (msg) values ('ANON_ERR ' || sqlerrm); end $$;
reset role;

select case when exists (select 1 from t27 where msg = 'OTHER_SEES_ROWS' and n = 0) then 'PASS' else 'FAIL' end
  as "T5 Item83 another member sees none of the referrer's recommendations";

select case when exists (select 1 from t27 where msg = 'ERR Only an Operator may list candidate recommendations')
             and not exists (select 1 from t27 where msg = 'OTHER_LISTED') then 'PASS' else 'FAIL' end
  as "T6 Item83 a member cannot list recommendations";

select case when not exists (select 1 from t27 where msg in ('OTHER_DECLINED', 'OTHER_UPDATED'))
             and exists (select 1 from t27 where msg = 'ERR Only an Operator may decline a candidate recommendation')
             and exists (select 1 from t27 where msg like 'ERR permission denied%')
            then 'PASS' else 'FAIL' end
  as "T7 Item83 a member cannot decline or change a recommendation";

select case when exists (select 1 from t27 where msg like 'ANON_ERR %permission denied%')
             and not exists (select 1 from t27 where msg = 'ANON_READ') then 'PASS' else 'FAIL' end
  as "T8 Item83 an anonymous caller cannot read the recommendations";

\echo
\echo '=========== THE OPERATOR INVITES; THE INVITATION NAMES THE REFERRER ==========='

set role authenticated; set test.uid = 'f7f70001-0001-0001-0001-000000000001';
do $$ declare v_id uuid; begin
  select id into v_id from public.operator_list_candidate_recommendations()
   where candidate_name = 'Candidate 2';
  perform public.operator_invite_from_recommendation(v_id,
    'tok84' || repeat('b', 40), 'https://example.invalid/register.html?token=tok84' || repeat('b', 40), 'en');
  insert into t27 (msg) values ('INVITED');
exception when others then insert into t27 (msg) values ('ERR ' || sqlerrm); end $$;
reset role; reset test.uid;

select case when exists (select 1 from t27 where msg = 'INVITED')
             and exists (select 1 from public.invitations
                          where token = 'tok84' || repeat('b', 40)
                            and email = 'candidate2@example.invalid' and used_at is null
                            and language = 'en'
                            and created_by = (select id from public.profiles where email = 'rec-op@example.invalid'))
            then 'PASS' else 'FAIL' end
  as "T9 Item84 an Operator can invite from a recommendation, with a single-use invitation";

select case when exists (select 1 from public.email_outbox
                          where to_email = 'candidate2@example.invalid'
                            and body_text like '%Rita Referrer has recommended you%'
                            and body_text like '%' || 'tok84' || repeat('b', 40) || '%')
            then 'PASS' else 'FAIL' end
  as "T10 Item84 the invitation email names the referrer and carries the link";

select case when not exists (select 1 from public.email_outbox
                              where to_email = 'candidate2@example.invalid'
                                and (body_text like '%how-known-marker%' or body_text like '%experience-marker%'))
            then 'PASS' else 'FAIL' end
  as "T11 Item84 the candidate's email carries none of the recommendation's own texts";

select case when exists (select 1 from public.candidate_recommendations r
                          join public.invitations i on i.id = r.invitation_id
                          where r.candidate_name = 'Candidate 2' and r.status = 'invited'
                            and i.email = 'candidate2@example.invalid')
            then 'PASS' else 'FAIL' end
  as "T12 Item84 the recommendation is marked invited and linked to its invitation";

\echo
\echo '=========== DECLINING TELLS NOBODY, AND FREES A PLACE ==========='

set role authenticated; set test.uid = 'f7f70001-0001-0001-0001-000000000001';
do $$ declare v_id uuid; begin
  select id into v_id from public.operator_list_candidate_recommendations()
   where candidate_name = 'Candidate 1';
  perform public.operator_decline_candidate_recommendation(v_id);
  insert into t27 (msg) values ('DECLINED');
exception when others then insert into t27 (msg) values ('ERR ' || sqlerrm); end $$;
reset role; reset test.uid;

insert into t27 (msg, n)
select 'AFTER_MAIL_TO_REFERRER', count(*) from public.email_outbox
 where to_email = 'rec-ref@example.invalid';
insert into t27 (msg, n)
select 'AFTER_MESSAGES', count(*) from public.messages;

select case when exists (select 1 from t27 where msg = 'DECLINED')
             and exists (select 1 from public.candidate_recommendations
                          where candidate_name = 'Candidate 1' and status = 'declined')
            then 'PASS' else 'FAIL' end
  as "T13 Item85 an Operator can decline a recommendation, and it leaves the open list";

select case when (select n from t27 where msg = 'AFTER_MAIL_TO_REFERRER')
               = (select n from t27 where msg = 'BASE_MAIL_TO_REFERRER')
             and (select n from t27 where msg = 'AFTER_MESSAGES')
               = (select n from t27 where msg = 'BASE_MESSAGES')
            then 'PASS' else 'FAIL the referrer was told' end
  as "T14 Item85 declining sends the referrer no email and no message";

select case when not exists (select 1 from public.email_outbox
                              where to_email = 'candidate1@example.invalid')
            then 'PASS' else 'FAIL' end
  as "T15 Item85 declining invites nobody";

set role authenticated; set test.uid = 'f7f70002-0002-0002-0002-000000000002';
do $$ begin
  perform public.submit_candidate_recommendation('Candidate 7', 'Example Co',
    'candidate7@example.invalid', 'how-known-marker-7', 'Copper', true, 'experience-marker-7');
  insert into t27 (msg) values ('REPLACEMENT_OK');
exception when others then insert into t27 (msg) values ('ERR ' || sqlerrm); end $$;
reset role; reset test.uid;

select case when exists (select 1 from t27 where msg = 'REPLACEMENT_OK')
            then 'PASS' else 'FAIL' end
  as "T16 Item82 a declined recommendation frees one of the five places";
