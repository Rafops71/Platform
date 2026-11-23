-- Revert of sql/074: puts back the five privileges live held for anon and authenticated before it
-- (UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES; SELECT was never removed). No data is involved. Safe to run twice.
begin;
grant update, delete, truncate, trigger, references on public.activity_log to anon, authenticated;
commit;
