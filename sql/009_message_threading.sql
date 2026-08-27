-- Jericho Platform — 009: make a reply routable back to the person who asked.
--
-- The bug (found 2026-08-27 while automating the mailbox flow, pinned by a
-- test in tests/e2e/mailbox-flow.spec.js):
--
--   Every forward target was derived from listings.user_id. That is correct
--   for an enquiry — the listing owner is exactly who should receive it — and
--   wrong for a reply, because on a reply the listing owner IS the sender.
--   "Forward to Owner" would have handed the message back to its own author,
--   and the operator's Reply button targets messages.sender_id, which was the
--   owner too. Nothing routed the owner's answer back to the enquirer, so a
--   conversation could go exactly one way and then stop.
--
-- The fix: record what a message is a reply TO, and derive the forward target
-- from that instead of from the listing.
--
--   in_reply_to null  -> an opening enquiry; forward to the listing owner.
--   in_reply_to set   -> forward to the sender of the message being replied
--                        to, whoever that is.
--
-- That makes the thread alternate correctly for any number of turns without
-- special-casing who is "the owner" and who is "the enquirer": the enquirer
-- replying to the owner's answer targets the owner again, and so on. It also
-- lets a message with no listing at all still be routed, which the old
-- listing-derived target could not do.
--
-- Anonymity is untouched. in_reply_to links two messages, not two people; the
-- operator still brokers every hop, and neither participant is ever shown the
-- other's identity. The routing decision moves from "who owns the listing" to
-- "who wrote the message being answered", and both are operator-side facts.
--
-- on delete set null rather than cascade: losing the parent message must
-- orphan the thread link, never silently delete the reply itself.
-- ----------------------------------------------------------------------------

alter table public.messages
  add column if not exists in_reply_to uuid references public.messages(id) on delete set null;

-- Operators read the mailbox newest-first and resolve each reply's parent, so
-- the lookup is by parent id.
create index if not exists messages_in_reply_to_idx
  on public.messages (in_reply_to) where in_reply_to is not null;

-- A message may not be a reply to itself. Cheap guard against a malformed
-- client insert turning into a forward that targets the sender.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'messages_no_self_reply') then
    alter table public.messages
      add constraint messages_no_self_reply check (in_reply_to is null or in_reply_to <> id);
  end if;
end $$;

-- No RLS change is needed. messages_insert already restricts a participant to
-- inserting rows where sender_id is their own profile, and in_reply_to is an
-- ordinary column on a row they are already allowed to create. A participant
-- naming a message they cannot see gains nothing: the value is only ever read
-- by the operator UI when deciding a forward target, and the forward itself
-- stays operator-only through message_forward_log.
