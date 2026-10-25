-- Undo 035. Refuses while any deal file exists: those are records of real
-- negotiations, and removing the feature must not silently destroy them.
begin;
do $$ begin
  if exists (select 1 from public.deals) then
    raise exception 'Refusing to revert 035: % deal file(s) exist. Export them first.', (select count(*) from public.deals);
  end if;
end $$;
drop trigger if exists trg_open_deal_on_forward on public.message_forward_log;
drop trigger if exists trg_guard_deal_update on public.deals;
drop function if exists public.open_deal_on_forward();
drop function if exists public.guard_deal_update();
drop table if exists public.deal_history;
drop table if exists public.deals;
commit;
