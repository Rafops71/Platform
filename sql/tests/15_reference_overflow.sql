-- 15_reference_overflow.sql
--
-- Proves sql/022: the reference number does not collide past 999.
--
-- next_reference() used lpad(v_seq::text, 3, '0'), and PostgreSQL's lpad
-- truncates rather than overflowing: lpad('1012', 3, '0') is '101'. Since
-- listings.reference_number is UNIQUE, the 1000th sell listing of a year and
-- every one after it was refused outright. Nobody could post again.
--
-- Nothing caught it for seven weeks because no suite had ever issued a
-- thousand references. The live counter only crossed 1000 because the volume
-- tests pushed it there, and five browser tests failed the next morning.
--
-- So this file does the one thing none of them did: it walks the counter over
-- the cliff and checks both sides of it.

\set QUIET on
\pset pager off

\echo
\echo '=========== REFERENCE NUMBERS SURVIVE THE THOUSANDTH LISTING ==========='

-- Start just below the boundary rather than calling the function a thousand
-- times: the counter is an ordinary row and the function reads whatever it
-- holds, so 997 behaves exactly as it would after 997 real listings.
insert into public.reference_counters (key, last_value)
values ('SELL-' || to_char(now(), 'YY'), 997)
on conflict (key) do update set last_value = 997;

create temporary table refs as
select public.next_reference('sell') as ref, g
from generate_series(1, 8) g;

select case when count(*) = 8 then 'PASS' else 'FAIL only ' || count(*) end
  as "T1 eight references were issued"
from refs;

-- The point of the whole file.
select case when count(distinct ref) = 8 then 'PASS'
            else 'FAIL only ' || count(distinct ref) || ' distinct of 8' end
  as "T2 all eight are distinct, across the 999/1000 boundary"
from refs;

-- Below the boundary the format must not have changed: references already
-- issued, printed and quoted to counterparties stay valid.
select case when ref = 'SELL-' || to_char(now(), 'YY') || '-998' then 'PASS'
            else 'FAIL got ' || ref end
  as "T3 998 still renders as three padded digits"
from refs where g = 1;

select case when ref = 'SELL-' || to_char(now(), 'YY') || '-999' then 'PASS'
            else 'FAIL got ' || ref end
  as "T4 999 still renders as three padded digits"
from refs where g = 2;

-- Above it, the number grows a digit instead of losing one.
select case when ref = 'SELL-' || to_char(now(), 'YY') || '-1000' then 'PASS'
            else 'FAIL got ' || ref end
  as "T5 1000 grows a digit rather than truncating to 100"
from refs where g = 3;

select case when ref = 'SELL-' || to_char(now(), 'YY') || '-1004' then 'PASS'
            else 'FAIL got ' || ref end
  as "T6 1004 is itself, not 100"
from refs where g = 7;

-- And the references are actually usable: UNIQUE is what the old function
-- tripped over, so insert them rather than only comparing strings.
insert into auth.users (id, email, raw_user_meta_data)
values ('b0b0b0b0-0000-4000-8000-00000000000a'::uuid,
        'ref-overflow@example.invalid',
        jsonb_build_object('first_name', 'Ref', 'last_name', 'Overflow',
                           'phone', '+3200000081', 'country', 'Belgium', 'language', 'en'));
update public.profiles set status = 'approved', role = 'operator'
 where email = 'ref-overflow@example.invalid';

insert into public.listings
  (user_id, reference_number, type, commodity, quantity, unit, incoterm, origin, status)
select (select id from public.profiles where email = 'ref-overflow@example.invalid'),
       ref, 'sell', 'Wheat', 100, 'MT', 'FOB', 'belgium', 'available'
from refs;

select case when count(*) = 8 then 'PASS' else 'FAIL stored ' || count(*) end
  as "T7 all eight were accepted by the unique constraint"
from public.listings
where user_id = (select id from public.profiles where email = 'ref-overflow@example.invalid');
