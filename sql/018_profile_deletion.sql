-- 018_profile_deletion.sql
--
-- Makes deleting a member possible. It was not.
--
-- Nine foreign keys pointing at public.profiles were left at the PostgreSQL
-- default, NO ACTION, so the first row referencing a member refused the
-- delete. Signing in writes to activity_log, which means every member who had
-- ever signed in was undeletable:
--
--   update or delete on table "profiles" violates foreign key constraint
--   "activity_log_user_id_fkey" on table "activity_log"
--
-- Confirmed against live on 2026-10-11 by creating an account, signing in as
-- it, and deleting it through the Auth admin API: HTTP 500 with exactly that
-- message. The same error reached the owner through the Supabase dashboard as
-- "Database error loading user", and the Auth logs hold ten of them.
--
-- This is not only a housekeeping problem. The platform cannot honour an
-- erasure request it is unable to perform, the test suite's teardown reports
-- failure on accounts it did in fact remove, and no volume or stress test can
-- responsibly create data it has no proven way to remove.
--
-- Two different answers, because a member's rows are not all the same kind of
-- thing:
--
--   CASCADE  for what belongs to them — their listings, the messages they
--            sent, the invitations they issued, their document requests, the
--            forwarding records naming them. Deleting the member deletes it.
--
--   SET NULL for the record of what happened. activity_log keeps its rows with
--            the person unlinked, so the history and the Operator's figures
--            survive a departure while the identity does not. commodities does
--            the same: the list is shared reference data and an operator
--            leaving must not take a traded commodity with them.
--
-- Only the nullable columns can take SET NULL, and the two that need it —
-- activity_log.user_id and commodities.created_by — already are. Nothing here
-- changes a column's nullability.

begin;

-- --------------------------------------------------------- keep the record --

alter table public.activity_log
  drop constraint activity_log_user_id_fkey,
  add  constraint activity_log_user_id_fkey
       foreign key (user_id) references public.profiles(id) on delete set null;

alter table public.commodities
  drop constraint commodities_created_by_fkey,
  add  constraint commodities_created_by_fkey
       foreign key (created_by) references public.profiles(id) on delete set null;

-- An invitation outlives the person who accepted it: it is the evidence that
-- this address was invited and when it was used. created_by is NOT NULL, so an
-- operator's invitations go with the operator.
alter table public.invitations
  drop constraint invitations_used_by_fkey,
  add  constraint invitations_used_by_fkey
       foreign key (used_by) references public.profiles(id) on delete set null;

-- A message about a withdrawn listing is still part of a brokered
-- conversation, and listing_id is nullable precisely because a message can
-- stand without one. Cascading here would delete the enquiry when the listing
-- it asked about was removed, which is the counterparty's record as much as
-- the owner's.
alter table public.messages
  drop constraint messages_listing_id_fkey,
  add  constraint messages_listing_id_fkey
       foreign key (listing_id) references public.listings(id) on delete set null;

-- ------------------------------------------------------ remove what is theirs --

alter table public.invitations
  drop constraint invitations_created_by_fkey,
  add  constraint invitations_created_by_fkey
       foreign key (created_by) references public.profiles(id) on delete cascade;

alter table public.listings
  drop constraint listings_user_id_fkey,
  add  constraint listings_user_id_fkey
       foreign key (user_id) references public.profiles(id) on delete cascade;

alter table public.messages
  drop constraint messages_sender_id_fkey,
  add  constraint messages_sender_id_fkey
       foreign key (sender_id) references public.profiles(id) on delete cascade;

alter table public.document_requests
  drop constraint document_requests_participant_id_fkey,
  add  constraint document_requests_participant_id_fkey
       foreign key (participant_id) references public.profiles(id) on delete cascade;

alter table public.document_requests
  drop constraint document_requests_requester_id_fkey,
  add  constraint document_requests_requester_id_fkey
       foreign key (requester_id) references public.profiles(id) on delete cascade;

alter table public.message_forward_log
  drop constraint message_forward_log_operator_id_fkey,
  add  constraint message_forward_log_operator_id_fkey
       foreign key (operator_id) references public.profiles(id) on delete cascade;

alter table public.message_forward_log
  drop constraint message_forward_log_to_user_id_fkey,
  add  constraint message_forward_log_to_user_id_fkey
       foreign key (to_user_id) references public.profiles(id) on delete cascade;

commit;
