-- 10_rate_limits.sql
--
-- The limits in sql/016 are worth testing for one reason above the others: a
-- rate limit that is wrong in the tight direction breaks honest use silently,
-- and nobody reports "the platform stopped me doing something I was allowed to
-- do" as a bug — they just stop.
--
-- So these assertions pin both halves: the limit stops the 31st message, and
-- it does NOT stop the 30th, is per-sender rather than global, and does not
-- apply to Operators at all.

\set QUIET on
\pset pager off

\echo
\echo '=========== RATE LIMITS ==========='

insert into auth.users (id, email, raw_user_meta_data)
values (
  '1a1a1a1a-1a1a-1a1a-1a1a-1a1a1a1a1a1a'::uuid,
  'rl-flooder@example.invalid',
  jsonb_build_object('first_name', 'Flo', 'last_name', 'Oder',
                     'phone', '+3200000051', 'country', 'Belgium', 'language', 'en')
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '2b2b2b2b-2b2b-2b2b-2b2b-2b2b2b2b2b2b'::uuid,
  'rl-bystander@example.invalid',
  jsonb_build_object('first_name', 'By', 'last_name', 'Stander',
                     'phone', '+3200000052', 'country', 'Spain', 'language', 'en')
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c3c'::uuid,
  'rl-operator@example.invalid',
  jsonb_build_object('first_name', 'Rate', 'last_name', 'Op',
                     'phone', '+3200000053', 'country', 'Belgium', 'language', 'en')
);

update public.profiles set status = 'approved'
where email in ('rl-flooder@example.invalid', 'rl-bystander@example.invalid',
                'rl-operator@example.invalid');

update public.profiles set role = 'operator', status = 'approved'
where email = 'rl-operator@example.invalid';

-- ---------------------------------------------------------------- messages --
-- 30 is the limit, so 30 must succeed. Inserted directly: RLS is suite 01's
-- job, and a session-scoped insert ... select reads nothing here (see the note
-- in 03_message_threading.sql).
insert into public.messages (sender_id, body, status)
select (select id from public.profiles where email = 'rl-flooder@example.invalid'),
       'flood ' || g, 'pending_review'
from generate_series(1, 30) g;

select case when count(*) = 30 then 'PASS' else 'FAIL — got ' || count(*) end
  as "T1 thirty messages in an hour are allowed"
from public.messages m
join public.profiles p on p.id = m.sender_id
where p.email = 'rl-flooder@example.invalid';

-- The 31st must not.
savepoint before_flood;
do $$
begin
  insert into public.messages (sender_id, body, status)
  values ((select id from public.profiles where email = 'rl-flooder@example.invalid'),
          'one too many', 'pending_review');
  raise exception 'NOTLIMITED';
exception
  when sqlstate '53400' then null;   -- the rate limit: what we want
  when others then
    if sqlerrm = 'NOTLIMITED' then
      raise exception 'the 31st message was accepted';
    end if;
    raise;
end $$;
rollback to savepoint before_flood;

select case when count(*) = 30 then 'PASS' else 'FAIL — got ' || count(*) end
  as "T2 the thirty-first is refused and nothing is stored"
from public.messages m
join public.profiles p on p.id = m.sender_id
where p.email = 'rl-flooder@example.invalid';

-- Per sender, not global: someone else's quota is untouched by the flood.
insert into public.messages (sender_id, body, status)
values ((select id from public.profiles where email = 'rl-bystander@example.invalid'),
        'unaffected', 'pending_review');

select case when count(*) = 1 then 'PASS' else 'FAIL — got ' || count(*) end
  as "T3 the limit is per sender, not platform-wide"
from public.messages m
join public.profiles p on p.id = m.sender_id
where p.email = 'rl-bystander@example.invalid';

-- An Operator brokers every conversation and is exempt.
insert into public.messages (sender_id, body, status)
select (select id from public.profiles where email = 'rl-operator@example.invalid'),
       'operator ' || g, 'forwarded'
from generate_series(1, 40) g;

select case when count(*) = 40 then 'PASS' else 'FAIL — got ' || count(*) end
  as "T4 an Operator is not rate limited"
from public.messages m
join public.profiles p on p.id = m.sender_id
where p.email = 'rl-operator@example.invalid';

-- Old messages fall out of the window, so a limit is a rate and not a cap.
update public.messages set created_at = now() - interval '2 hours'
where sender_id = (select id from public.profiles where email = 'rl-flooder@example.invalid');

insert into public.messages (sender_id, body, status)
values ((select id from public.profiles where email = 'rl-flooder@example.invalid'),
        'an hour later', 'pending_review');

select case when count(*) = 31 then 'PASS' else 'FAIL — got ' || count(*) end
  as "T5 the window slides: yesterday's messages do not count against today"
from public.messages m
join public.profiles p on p.id = m.sender_id
where p.email = 'rl-flooder@example.invalid';

-- ---------------------------------------------------------------- listings --
insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number)
select (select id from public.profiles where email = 'rl-flooder@example.invalid'),
       'sell', 'Flood Copper', 'FOB', 'Belgium', 'SELL-FLOOD-' || lpad(g::text, 3, '0')
from generate_series(1, 20) g;

select case when count(*) = 20 then 'PASS' else 'FAIL — got ' || count(*) end
  as "T6 twenty listings in an hour are allowed"
from public.listings l
join public.profiles p on p.id = l.user_id
where p.email = 'rl-flooder@example.invalid';

savepoint before_listing_flood;
do $$
begin
  insert into public.listings (user_id, type, commodity, incoterm, origin, reference_number)
  values ((select id from public.profiles where email = 'rl-flooder@example.invalid'),
          'sell', 'Flood Copper', 'FOB', 'Belgium', 'SELL-FLOOD-999');
  raise exception 'NOTLIMITED';
exception
  when sqlstate '53400' then null;
  when others then
    if sqlerrm = 'NOTLIMITED' then
      raise exception 'the 21st listing was accepted';
    end if;
    raise;
end $$;
rollback to savepoint before_listing_flood;

select case when count(*) = 20 then 'PASS' else 'FAIL — got ' || count(*) end
  as "T7 the twenty-first listing is refused"
from public.listings l
join public.profiles p on p.id = l.user_id
where p.email = 'rl-flooder@example.invalid';

-- ------------------------------------------------------------------ shape --
select case when count(*) = 2 then 'PASS' else 'FAIL — got ' || count(*) end
  as "T8 both triggers are installed"
from pg_trigger
where tgname in ('trg_limit_message_rate', 'trg_limit_listing_rate')
  and not tgisinternal;

-- The counting index matters: without it every insert sequentially scans the
-- table it is protecting.
select case when count(*) = 2 then 'PASS' else 'FAIL — got ' || count(*) end
  as "T9 the supporting indexes exist"
from pg_indexes
where schemaname = 'public'
  and indexname in ('messages_sender_created_idx', 'listings_user_created_idx');
