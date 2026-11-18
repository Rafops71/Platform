-- Reverts 055: removes the retention purge function ONLY. It cannot restore the
-- recommendations the purge already deleted: those rows are gone for good.
drop function if exists public.purge_closed_candidate_recommendations(timestamptz);
