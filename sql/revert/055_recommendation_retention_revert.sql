-- Reverts 055: removes the retention purge function. Recommendations already
-- purged stay purged; nothing else is touched.
drop function if exists public.purge_closed_candidate_recommendations(timestamptz);
