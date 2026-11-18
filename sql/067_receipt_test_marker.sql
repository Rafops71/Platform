-- 067: staging's Terms-receipt trigger gets the test-account marker back.
-- applied-probe: select position('myplatform-e2e-' in pg_get_functiondef('public.trg_terms_receipt_email'::regproc)) > 0
--
-- WHY. sql/053 added the 'myplatform-e2e-%' test-account pattern to trg_terms_receipt_email(), and the
-- STAGING ledger records 053 as applied (8 Nov), yet staging's function still carries only the older
-- 'jericho-e2e-%' pattern of sql/048 - something put the older body back, and a ledger that records file
-- names, not contents, cannot see that. Found by comparing staging with live on 16 Nov 2026
-- (docs/AGREED-2026-11-16-tooling.md, item 4). The effect: a test account named myplatform-e2e-... that
-- signs the Terms on staging would queue a real receipt e-mail.
--
-- WHAT IT DOES. Re-creates that one function with the body sql/053 gave it (the current repository text).
-- LIVE ALREADY HOLDS THIS BODY (read back 16 Nov: it contains 'myplatform-e2e-'), so on live this changes
-- nothing; the probe above is true there today. Nothing is deleted or changed in any row; the trigger,
-- owner, security setting and search_path are the same. Idempotent.
-- Revert: sql/revert/067_receipt_test_marker_revert.sql (the 048 body). Proof: sql/tests/38_receipt_test_marker.sql.

begin;

create or replace function public.trg_terms_receipt_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email      text;
  v_first_name text;
  v_lang       text;
  v_subject    text;
  v_body       text;
begin
  -- Only a real signature earns a receipt: an unsigned row is not a signing.
  if new.signed_name is null then return new; end if;
  -- An update of a row that was already signed is not a new signing.
  if tg_op = 'UPDATE' and old.signed_name is not null then return new; end if;

  select p.email, p.first_name, p.language into v_email, v_first_name, v_lang
    from public.profiles p where p.id = new.profile_id;
  if v_email is null then return new; end if;

  -- Test accounts get no receipt (same marker as sql/047 and sql/027).
  if v_email ~* '@example\.(invalid|com|org|net)$' or (lower(v_email) like 'myplatform-e2e-%' or lower(v_email) like 'jericho-e2e-%') then
    return new;
  end if;

  select t.subject, t.body_text into v_subject, v_body
    from public.render_email('terms_receipt', coalesce(v_lang, 'en'),
           jsonb_build_object('first_name', coalesce(v_first_name, ''),
                              'version', new.version,
                              'date', to_char(now() at time zone 'UTC', 'YYYY-MM-DD'))) t;

  insert into public.email_outbox (to_email, subject, body_text)
    values (v_email, v_subject, v_body);
  return new;
end;
$$;

commit;
