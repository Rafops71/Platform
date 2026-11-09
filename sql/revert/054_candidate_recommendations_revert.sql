-- Reverts 054: removes the candidate-recommendation functions, the table (and
-- every recommendation in it) and the invitation_recommended email templates.
-- Invitations already created from a recommendation are ordinary invitation
-- rows and are left alone. Run only if 054 must be withdrawn: the table's
-- contents are lost.
begin;

drop function if exists public.operator_invite_from_recommendation(uuid, text, text, text, text);
drop function if exists public.operator_decline_candidate_recommendation(uuid);
drop function if exists public.operator_list_candidate_recommendations();
drop function if exists public.submit_candidate_recommendation(text, text, text, text, text, boolean, text);
drop table if exists public.candidate_recommendations;
delete from public.email_templates where template_key = 'invitation_recommended';

commit;
