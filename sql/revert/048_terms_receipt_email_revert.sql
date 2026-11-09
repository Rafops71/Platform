-- Reverts 048: removes the trigger, its function and the template rows.
drop trigger if exists trg_terms_receipt_email on public.terms_acceptances;
drop function if exists public.trg_terms_receipt_email();
delete from public.email_templates where template_key = 'terms_receipt';
