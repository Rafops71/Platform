-- One-off maintenance, run on the owner's say-so on 2026-10-13.
--
-- Clears the backlog the hygiene check found on its first working run:
-- 4,796 notifications and 2 activity rows about things that no longer exist.
-- Seven weeks of CI runs telling the Operator about test accounts that were
-- then deleted. The cause is fixed in tests/e2e/helpers/fixtures.js; this
-- clears what had already built up.
--
-- Exactly the rule the Operator's own purge button uses (sql/023 and 027).
-- Written as a file rather than typed ad hoc so that what was run against the
-- live database is in the repository, with its reason, like every other change.
--
-- It is safe to re-run: on a clean database it removes nothing.

begin;

select count(*) as notifications_before
  from public.notifications n
 where n.related_id is not null
   and not exists (select 1 from public.listings l where l.id = n.related_id)
   and not exists (select 1 from public.profiles p where p.id = n.related_id)
   and not exists (select 1 from public.messages m where m.id = n.related_id);

delete from public.notifications n
 where n.related_id is not null
   and not exists (select 1 from public.listings l where l.id = n.related_id)
   and not exists (select 1 from public.profiles p where p.id = n.related_id)
   and not exists (select 1 from public.messages m where m.id = n.related_id);

delete from public.activity_log a
 where a.user_id is null
   and ((jsonb_exists(a.details, 'profile_id')
         and not exists (select 1 from public.profiles p
                          where p.id = (a.details->>'profile_id')::uuid))
     or (jsonb_exists(a.details, 'listing_id')
         and not exists (select 1 from public.listings l
                          where l.id = (a.details->>'listing_id')::uuid)));

select count(*) as notifications_after
  from public.notifications n
 where n.related_id is not null
   and not exists (select 1 from public.listings l where l.id = n.related_id)
   and not exists (select 1 from public.profiles p where p.id = n.related_id)
   and not exists (select 1 from public.messages m where m.id = n.related_id);

commit;
