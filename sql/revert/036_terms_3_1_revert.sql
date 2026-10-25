-- Undo 036: unpublish Terms 3.1, leaving 3.0 current. Refuses once anyone has
-- signed 3.1 - a signature points at that text.
begin;
do $$ begin
  if exists (select 1 from public.terms_acceptances where version = '3.1' and signed_name is not null) then
    raise exception 'Terms 3.1 has been signed; it cannot be unpublished';
  end if;
end $$;
delete from public.terms_versions where version = '3.1';
commit;
