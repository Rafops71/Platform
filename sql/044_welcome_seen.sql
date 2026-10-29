-- 044: the welcome page is shown once, at a member's first sign-in (owner's
-- ask, 2026-10-29). One column records that the member pressed "I understand -
-- continue". A member writes it on their own profile row through the same
-- self-service update every other profile field uses (profiles_update:
-- user_id = auth.uid()); no function, no new door. Everybody who exists today
-- has NULL and sees the page once.
-- Revert: sql/revert/044_welcome_seen_revert.sql
begin;

alter table public.profiles add column if not exists welcome_seen_at timestamptz;

commit;
