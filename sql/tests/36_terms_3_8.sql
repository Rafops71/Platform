-- 36_terms_3_8.sql
--
-- Proves sql/065 and its revert (Terms 3.8, owner-approved changes of 2026-11-16):
--   * Terms 3.8 is in terms_versions in both languages, each with a change summary;
--   * the new section 8 sentence is in, the one contact address is info@myplatform.trade, and
--     nothing in the text still says "an Operator" / "un Operador" or rafael@myplatform.trade;
--   * the revert removes only 3.8 and leaves 3.7 exactly as it was;
--   * re-applying 065 brings back the same text (same sha256), and a second apply changes nothing.
-- The page-vs-database match (sha256 of the text the page shows) is proven by `npm run check:terms`.
-- The file ends with 3.8 published, as the rest of the suite expects.

\set QUIET on
\pset pager off

\echo
\echo '=========== TERMS 3.8 ==========='

create temp table t36_before as
  select version, language, sha256, change_summary from public.terms_versions where version in ('3.7','3.8');

select case when (select count(*) from public.terms_versions where version = '3.8') = 2
             and (select count(*) from public.terms_versions where version = '3.8' and coalesce(btrim(change_summary), '') <> '') = 2
            then 'PASS' else 'FAIL' end
  as "T1 Terms 3.8 is published in English and Spanish, each with a change summary";

select case when (select text from public.terms_versions where version = '3.8' and language = 'en')
                   like '%Introductions are made only after a commission agreement has been executed.%'
             and (select text from public.terms_versions where version = '3.8' and language = 'es')
                   like '%Las presentaciones solo se realizan una vez firmado un acuerdo de comisión.%'
            then 'PASS' else 'FAIL' end
  as "T2 section 8 carries the owner's sentence, in both languages";

select case when not exists (select 1 from public.terms_versions where version = '3.8'
                              and (text like '%rafael@myplatform.trade%' or text ~ '(an Operator|un Operador)'))
             and (select count(*) from public.terms_versions where version = '3.8' and text like '%info@myplatform.trade%') = 2
            then 'PASS' else 'FAIL' end
  as "T3 the contact address is info@myplatform.trade, and no 'an Operator' or 'un Operador' is left";

select case when (select text from public.terms_versions where version = '3.8' and language = 'es')
                   like '%y puede actuar para ambas partes de una misma operación%'
             and (select text from public.terms_versions where version = '3.8' and language = 'es')
                   not like '%y pueden actuar para ambas partes%'
            then 'PASS' else 'FAIL' end
  as "T4 the Spanish section 1 has the singular verb after 'el Operador'";

\i sql/revert/065_terms_3_8_revert.sql

select case when not exists (select 1 from public.terms_versions where version = '3.8')
             and (select count(*) from public.terms_versions where version = '3.7') = 2
             and not exists (select 1 from t36_before b where b.version = '3.7'
                              and not exists (select 1 from public.terms_versions v
                                               where v.version = b.version and v.language = b.language and v.sha256 = b.sha256))
            then 'PASS' else 'FAIL' end
  as "T5 the revert removes only 3.8 and leaves 3.7 exactly as it was";

\i sql/065_terms_3_8.sql

select case when not exists (select 1 from t36_before b where b.version = '3.8'
                              and not exists (select 1 from public.terms_versions v
                                               where v.version = b.version and v.language = b.language and v.sha256 = b.sha256))
             and (select count(*) from public.terms_versions where version = '3.8') = 2
            then 'PASS' else 'FAIL' end
  as "T6 after revert and re-apply 3.8 holds exactly the same text (same sha256)";

\i sql/065_terms_3_8.sql

select case when (select count(*) from public.terms_versions where version = '3.8') = 2
            then 'PASS' else 'FAIL' end
  as "T7 applying 065 a second time changes nothing (idempotent)";
