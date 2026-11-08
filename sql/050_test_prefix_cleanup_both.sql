-- 050: the test-data cleanup and the test-mail skip rule match BOTH prefixes.
--
-- Test accounts were created with the old prefix 'jericho-e2e-' and are now
-- created with 'myplatform-e2e-'. sql/027 (purge: unsent test mail) and sql/047
-- (no Operator mail for test accounts) matched only the old prefix, so mail and
-- accounts made under the new prefix would not have been caught.
--
-- This migration only REPLACES two function bodies. It deletes nothing and
-- changes no row. The only difference from sql/027 and sql/047 is the added
-- 'myplatform-e2e-%' pattern; the old pattern is kept.

create or replace function public.purge_orphaned_activity()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_activity integer;
  v_notifications integer;
  v_mail integer;
  v_total integer;
begin
  -- Operators only, and only Operators who are still active (sql/026).
  if not exists (select 1 from public.profiles p
                  where p.id = public.current_profile_id()
                    and p.role = 'operator'
                    and p.status = 'approved') then
    raise exception 'Operators only' using errcode = '42501';
  end if;

  -- 1. The audit trail. Unchanged from 021.
  delete from public.activity_log a
   where a.user_id is null
     and (
       (jsonb_exists(a.details, 'profile_id')
         and not exists (select 1 from public.profiles p
                          where p.id = (a.details->>'profile_id')::uuid))
       or
       (jsonb_exists(a.details, 'listing_id')
         and not exists (select 1 from public.listings l
                          where l.id = (a.details->>'listing_id')::uuid))
     );
  get diagnostics v_activity = row_count;

  -- 2. The Operator feed. Unchanged from 023.
  delete from public.notifications n
   where n.related_id is not null
     and not exists (select 1 from public.listings l where l.id = n.related_id)
     and not exists (select 1 from public.profiles p where p.id = n.related_id)
     and not exists (select 1 from public.messages m where m.id = n.related_id);
  get diagnostics v_notifications = row_count;

  -- 3. Mail that was never going to reach anybody. New in 027.
  delete from public.email_outbox e
   where e.sent_at is null
     and (e.to_email like 'myplatform-e2e-%'
       or e.to_email like 'jericho-e2e-%'
       or e.to_email like '%@example.invalid'
       or e.to_email like '%@example.com'
       or e.to_email like '%@example.org'
       or e.to_email like '%@example.net');
  get diagnostics v_mail = row_count;

  v_total := v_activity + v_notifications + v_mail;

  insert into public.activity_log (user_id, action, details)
    values (public.current_profile_id(), 'activity_log_purged',
            jsonb_build_object('rows_removed', v_total,
                               'activity_log', v_activity,
                               'notifications', v_notifications,
                               'test_mail', v_mail));

  return v_total;
end;
$$;

create or replace function public.trg_mail_operators_new_member_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role    text;
  v_email   text;
  v_subject text;
  v_body    text;
  r         record;
begin
  select p.role, p.email into v_role, v_email from public.profiles p where p.id = new.sender_id;
  if v_role is distinct from 'participant' then return new; end if;

  -- Test accounts send no Operator mail. The marker is the one sql/027 uses to
  -- decide what is test mail: the reserved domains (RFC 2606) and the e2e prefix.
  -- Nothing is deleted; the trigger simply does not queue these.
  if v_email ~* '@example\.(invalid|com|org|net)$' or (lower(v_email) like 'myplatform-e2e-%' or lower(v_email) like 'jericho-e2e-%') then
    return new;
  end if;

  select t.subject, t.body_text into v_subject, v_body
    from public.render_email('operator_new_message', 'en', '{}'::jsonb) t;

  for r in
    select p.email from public.profiles p
     where p.role = 'operator' and p.status = 'approved' and p.email is not null
  loop
    insert into public.email_outbox (to_email, subject, body_text)
      values (r.email, v_subject, v_body);
  end loop;
  return new;
end;
$$;
