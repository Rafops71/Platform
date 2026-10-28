-- Undo 042: unpublish Terms 3.4, leaving 3.3 current. Refuses once anyone has
-- signed 3.4 - a signature points at that text.
begin;
do $$ begin
  if exists (select 1 from public.terms_acceptances where version = '3.4' and signed_name is not null) then
    raise exception 'Terms 3.4 has been signed; it cannot be unpublished';
  end if;
end $$;
delete from public.terms_versions where version = '3.4';
commit;
