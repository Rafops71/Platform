-- Revert 044: drop the column. It holds only "when the member pressed
-- continue on the welcome page", so nothing else depends on it.
begin;

alter table public.profiles drop column if exists welcome_seen_at;

commit;
