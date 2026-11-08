-- 054 (items 81-85): a member recommends a candidate. The recommendation goes
-- to the Operators only. The Operator may invite the candidate from it, or
-- decline it. Declining tells nobody.
--
-- WHAT IS NEW
--   candidate_recommendations   one row per recommendation. No client can
--                               read or write the table directly.
--   submit_candidate_recommendation()          a member files one (max 5 open)
--   operator_list_candidate_recommendations()  Operators list open ones
--   operator_decline_candidate_recommendation() Operators decline one
--   operator_invite_from_recommendation()      Operators invite from one: the
--                               invitation row is made, the recommendation is
--                               marked invited, and the invitation email (which
--                               names the referrer) is queued - all in one
--                               transaction.
--   email template 'invitation_recommended' (English and Spanish)
--
-- OPEN = status 'open'. Invited and declined recommendations are not open, so
-- they free a place. (Owner question, see the report: confirm this reading.)
--
-- RETENTION: none is set. The rows stay until the referrer is deleted (see
-- the cascade below). The owner has not decided a retention period.

begin;

-- ---- the table -------------------------------------------------------------
create table if not exists public.candidate_recommendations (
  id                 uuid primary key default gen_random_uuid(),
  referrer_id        uuid not null references public.profiles(id) on delete cascade,
  candidate_name     text not null check (length(btrim(candidate_name)) between 1 and 200),
  candidate_company  text not null check (length(btrim(candidate_company)) between 1 and 200),
  candidate_email    text not null check (position('@' in candidate_email) > 1
                                          and length(btrim(candidate_email)) <= 320),
  how_known          text not null check (length(btrim(how_known)) between 1 and 2000),
  commodities        text not null check (length(btrim(commodities)) between 1 and 500),
  agreed_contact     boolean not null,
  own_experience     text not null check (length(btrim(own_experience)) between 1 and 2000),
  status             text not null default 'open'
                       check (status in ('open', 'invited', 'declined')),
  invitation_id      uuid references public.invitations(id) on delete set null,
  created_at         timestamptz not null default now(),
  decided_at         timestamptz,
  decided_by         uuid references public.profiles(id) on delete set null
);

create index if not exists idx_candidate_recs_referrer_open
  on public.candidate_recommendations(referrer_id) where status = 'open';
create index if not exists idx_candidate_recs_invitation
  on public.candidate_recommendations(invitation_id);
create index if not exists idx_candidate_recs_decided_by
  on public.candidate_recommendations(decided_by);

-- ---- row-level security ----------------------------------------------------
-- Members see nothing in this table, not even their own rows: the owner's
-- rule is that only the Operator lists, invites or declines. The one policy
-- below lets an Operator read the table directly; every write goes through a
-- function. Nobody else has any grant on it.
alter table public.candidate_recommendations enable row level security;

drop policy if exists candidate_recs_operator_select on public.candidate_recommendations;
create policy candidate_recs_operator_select on public.candidate_recommendations
  for select to authenticated
  using (public.is_operator());

revoke all on public.candidate_recommendations from public, anon, authenticated;
grant select on public.candidate_recommendations to authenticated;

-- ---- a member files a recommendation ---------------------------------------
create or replace function public.submit_candidate_recommendation(
  p_candidate_name    text,
  p_candidate_company text,
  p_candidate_email   text,
  p_how_known         text,
  p_commodities       text,
  p_agreed_contact    boolean,
  p_own_experience    text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me   uuid;
  v_open integer;
  v_id   uuid;
begin
  -- An approved member who has signed the newest Terms (sql/034). Operators
  -- do not recommend; they invite.
  if not public.is_approved_participant() then
    raise exception 'Only an approved member who has signed the current Terms can recommend a candidate';
  end if;

  select p.id into v_me from public.profiles p where p.user_id = auth.uid();

  -- Counted under a per-member lock, so two presses at once cannot both see
  -- four open and both add a fifth (the same pattern as sql/019).
  perform pg_advisory_xact_lock(hashtext('jericho_candidate_rec'), hashtext(v_me::text));

  select count(*) into v_open
    from public.candidate_recommendations r
   where r.referrer_id = v_me and r.status = 'open';

  if v_open >= 5 then
    raise exception 'You can have up to 5 open recommendations at a time.'
      using errcode = '53400';
  end if;

  insert into public.candidate_recommendations
    (referrer_id, candidate_name, candidate_company, candidate_email,
     how_known, commodities, agreed_contact, own_experience)
  values
    (v_me, btrim(p_candidate_name), btrim(p_candidate_company),
     lower(btrim(p_candidate_email)), btrim(p_how_known), btrim(p_commodities),
     p_agreed_contact, btrim(p_own_experience))
  returning id into v_id;

  return v_id;
end;
$$;

-- ---- the Operator's list ---------------------------------------------------
-- Open recommendations only, with what the Invitations page shows. The
-- "how known" and "own experience" texts are not returned: the owner's page
-- does not show them, and nothing returns more than the page needs.
create or replace function public.operator_list_candidate_recommendations()
returns table (
  id                uuid,
  referrer_name     text,
  candidate_name    text,
  candidate_company text,
  candidate_email   text,
  commodities       text,
  created_at        timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_operator() then
    raise exception 'Only an Operator may list candidate recommendations';
  end if;

  return query
    select r.id,
           (p.first_name || ' ' || p.last_name)::text,
           r.candidate_name, r.candidate_company, r.candidate_email,
           r.commodities, r.created_at
      from public.candidate_recommendations r
      join public.profiles p on p.id = r.referrer_id
     where r.status = 'open'
     order by r.created_at desc;
end;
$$;

-- ---- the Operator declines -------------------------------------------------
-- Marks it declined. Nothing is sent to the referrer: no email, no message,
-- no notification. The row stays, marked declined, for the record.
create or replace function public.operator_decline_candidate_recommendation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
begin
  if not public.is_operator() then
    raise exception 'Only an Operator may decline a candidate recommendation';
  end if;

  select p.id into v_me from public.profiles p where p.user_id = auth.uid();

  update public.candidate_recommendations
     set status = 'declined', decided_at = now(), decided_by = v_me
   where id = p_id and status = 'open';

  if not found then
    raise exception 'No open candidate recommendation has that id';
  end if;
end;
$$;

-- ---- the Operator invites from a recommendation ----------------------------
-- p_link is built by the browser, as queue_invitation_email() already expects.
-- The invitation is made exactly as an Operator makes one (token, five days
-- from the table default, single use, language), and the email is rendered
-- from the outbox template with the referrer's name in it.
create or replace function public.operator_invite_from_recommendation(
  p_id           uuid,
  p_token        text,
  p_link         text,
  p_lang         text default 'en',
  p_privacy_link text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me        uuid;
  v_rec       public.candidate_recommendations%rowtype;
  v_referrer  text;
  v_lang      text;
  v_inv       uuid;
  v_subject   text;
  v_body      text;
begin
  if not public.is_operator() then
    raise exception 'Only an Operator may invite from a candidate recommendation';
  end if;
  if p_token is null or length(p_token) < 32 then
    raise exception 'An invitation token is required';
  end if;
  if p_link is null or position(p_token in p_link) = 0 then
    raise exception 'The invitation link must contain its token';
  end if;
  if p_privacy_link is null or length(btrim(p_privacy_link)) = 0 then
    raise exception 'A link to the Privacy Notice is required';
  end if;

  select p.id into v_me from public.profiles p where p.user_id = auth.uid();
  v_lang := public.norm_lang(p_lang);

  select * into v_rec
    from public.candidate_recommendations r
   where r.id = p_id
   for update;

  if not found or v_rec.status <> 'open' then
    raise exception 'No open candidate recommendation has that id';
  end if;

  insert into public.invitations (token, email, language, created_by)
  values (p_token, v_rec.candidate_email, v_lang, v_me)
  returning id into v_inv;

  update public.candidate_recommendations
     set status = 'invited', invitation_id = v_inv,
         decided_at = now(), decided_by = v_me
   where id = p_id;

  select (p.first_name || ' ' || p.last_name) into v_referrer
    from public.profiles p where p.id = v_rec.referrer_id;

  select r.subject, r.body_text into v_subject, v_body
    from public.render_email('invitation_recommended', v_lang,
           jsonb_build_object('link', p_link,
                              'referrer_name', v_referrer,
                              'candidate_name', v_rec.candidate_name,
                              'privacy_link', p_privacy_link)) r;

  insert into public.email_outbox (to_email, subject, body_text)
  values (v_rec.candidate_email, v_subject, v_body);
end;
$$;

-- ---- the email template ----------------------------------------------------
-- Subjects are the existing invitation subjects, unchanged: the owner has not
-- supplied a new one. Bodies are the owner's approved English text, and a
-- Spanish translation written for this change (owner to check).
insert into public.email_templates (template_key, lang, subject, body_text)
values
('invitation_recommended', 'en',
 (select subject from public.email_templates where template_key = 'invitation' and lang = 'en'),
 $body$Dear {{candidate_name}},
{{referrer_name}} has recommended you as a prospective member of MyPlatform, a private, invitation-only marketplace for physical commodities. We are pleased to invite you to join.
To register, please use your personal link below. It is valid for five days and can be used once.
{{link}}
Yours sincerely,
The Operator, MyPlatform
Privacy Notice: {{privacy_link}}$body$),
('invitation_recommended', 'es',
 (select subject from public.email_templates where template_key = 'invitation' and lang = 'es'),
 $body$Estimado/a {{candidate_name}},
{{referrer_name}} le ha recomendado como posible miembro de MyPlatform, un mercado privado y solo por invitación para materias primas físicas. Nos complace invitarle a unirse.
Para registrarse, utilice su enlace personal que figura a continuación. Es válido durante cinco días y solo puede utilizarse una vez.
{{link}}
Atentamente,
El Operador, MyPlatform
Aviso de privacidad: {{privacy_link}}$body$)
on conflict (template_key, lang) do update
  set subject = excluded.subject, body_text = excluded.body_text;

-- ---- who may call what -----------------------------------------------------
revoke execute on function public.submit_candidate_recommendation(text, text, text, text, text, boolean, text) from public, anon;
grant  execute on function public.submit_candidate_recommendation(text, text, text, text, text, boolean, text) to authenticated;
revoke execute on function public.operator_list_candidate_recommendations() from public, anon;
grant  execute on function public.operator_list_candidate_recommendations() to authenticated;
revoke execute on function public.operator_decline_candidate_recommendation(uuid) from public, anon;
grant  execute on function public.operator_decline_candidate_recommendation(uuid) to authenticated;
revoke execute on function public.operator_invite_from_recommendation(uuid, text, text, text, text) from public, anon;
grant  execute on function public.operator_invite_from_recommendation(uuid, text, text, text, text) to authenticated;

commit;
