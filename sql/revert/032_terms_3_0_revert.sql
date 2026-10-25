-- Undo 032: unpublish Terms 3.0. Refuses once anyone has signed it - a
-- signature points at that text, and removing the text would orphan the proof.
begin;
do $$ begin
  if exists (select 1 from public.terms_acceptances where version = '3.0' and signed_name is not null) then
    raise exception 'Terms 3.0 has been signed; it cannot be unpublished';
  end if;
end $$;
delete from public.terms_versions where version = '3.0';
commit;
