-- 020_foreign_key_indexes.sql
--
-- Indexes on ten foreign keys that had none.
--
-- PostgreSQL indexes the parent of a foreign key, never the child. So every
-- one of these columns was a full table scan: once per cascade when the parent
-- row is deleted, and once per lookup whenever anything joined on it.
--
-- Found by scripts/stress-test.js, which measured deleting 200 members with
-- their listings, messages and trails at 198 seconds - about a second per
-- member, on an otherwise idle local server with 2000 listings. The work was
-- almost all in scans that an index removes. It is not a bug and nothing is
-- wrong today, with one real listing on the platform; it is the difference
-- between a deletion that stays instant and one that gets slower every month.
--
-- matches.listing_b_id is the clearest case: listing_a_id was indexed and
-- listing_b_id was not, so deleting a listing used the index for half the
-- matches it had to clear and scanned the whole table for the other half.
--
-- Also included: the lookup the matcher does on every single listing posted.
-- generate_matches_for_listing() scans listings for the same commodity with
-- the opposite type on each insert, case-insensitively, which no plain index
-- on commodity can serve.

begin;

-- Children of profiles: these decide how fast a member can be removed.
create index if not exists idx_commodities_created_by          on public.commodities (created_by);
create index if not exists idx_invitations_created_by          on public.invitations (created_by);
create index if not exists idx_invitations_used_by             on public.invitations (used_by);
create index if not exists idx_document_requests_requester     on public.document_requests (requester_id);
create index if not exists idx_message_forward_log_operator    on public.message_forward_log (operator_id);
create index if not exists idx_message_forward_log_to_user     on public.message_forward_log (to_user_id);

-- Children of listings and messages: these decide how fast a listing can be
-- withdrawn, which members do themselves.
create index if not exists idx_document_requests_listing       on public.document_requests (listing_id);
create index if not exists idx_email_outbox_related_listing    on public.email_outbox (related_listing_id);
create index if not exists idx_matches_listing_b               on public.matches (listing_b_id);
create index if not exists idx_message_forward_log_message     on public.message_forward_log (message_id);

-- The matcher's own lookup, on every listing posted. Partial, because the
-- function excludes archived and closed listings and there is no reason to
-- carry them in the index.
create index if not exists idx_listings_match_lookup
  on public.listings (lower(commodity), type)
  where status not in ('archived', 'closed');

commit;
