-- 23_email_unit_as_typed.sql
--
-- Proves sql/041: a unit the phrase list does not know is written as typed;
-- known units are still translated, and other missing phrases still show.

\set QUIET on
\pset pager off

\echo
\echo '=========== EMAIL UNITS ==========='

select case when public.email_phrase('unit.mt', 'es') = 'mt' then 'PASS' else 'FAIL got ' || public.email_phrase('unit.mt', 'es') end
  as "T1 an unknown unit is written as typed";

select case when public.email_phrase('unit.Metric tons', 'es') = 'Toneladas métricas' then 'PASS' else 'FAIL got ' || public.email_phrase('unit.Metric tons', 'es') end
  as "T2 a known unit is still translated";

select case when public.email_phrase('label.nothing', 'en') = 'label.nothing' then 'PASS' else 'FAIL got ' || public.email_phrase('label.nothing', 'en') end
  as "T3 any other missing phrase still shows its key";
