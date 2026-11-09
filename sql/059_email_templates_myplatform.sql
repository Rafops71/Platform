-- 059: the stored email templates say "MyPlatform", not "Jericho" (owner's decision,
-- 2026-11-09: "Change them to MyPlatform"). Old, already-sent emails are not touched.
--
-- WHAT IT CHANGES: public.email_templates, only the rows whose subject or body
-- carries the old name (the invitation, the recommended-candidate invitation, the
-- new-listing, and the three registration emails, in English and Spanish: 12 rows).
-- Nothing else is read or written: no member data, no outbox row, no other template.
--
-- THE WORDING: the name is replaced together with the words that went with it, so
-- the sentence still reads cleanly (the same wording the recommended-candidate
-- invitation, sql/054, already used in its body):
--   "the Jericho Platform"  -> "MyPlatform"       "Jericho Platform"  -> "MyPlatform"
--   "la Plataforma Jericho" -> "MyPlatform"       "Plataforma Jericho" -> "MyPlatform"
--   any other "Jericho"     -> "MyPlatform"
--
-- IDEMPOTENT: a row that no longer carries the old name matches nothing, so a second
-- run changes no row. Revert: sql/revert/059_email_templates_myplatform_revert.sql.
-- Proof: sql/tests/30_email_templates_myplatform.sql.

begin;

update public.email_templates
   set subject = replace(replace(replace(replace(replace(subject,
         'the Jericho Platform', 'MyPlatform'), 'Jericho Platform', 'MyPlatform'),
         'la Plataforma Jericho', 'MyPlatform'), 'Plataforma Jericho', 'MyPlatform'),
         'Jericho', 'MyPlatform'),
       body_text = replace(replace(replace(replace(replace(body_text,
         'the Jericho Platform', 'MyPlatform'), 'Jericho Platform', 'MyPlatform'),
         'la Plataforma Jericho', 'MyPlatform'), 'Plataforma Jericho', 'MyPlatform'),
         'Jericho', 'MyPlatform')
 where subject like '%Jericho%' or body_text like '%Jericho%';

commit;
