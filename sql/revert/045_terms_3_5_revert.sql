-- Revert 045: take Terms 3.5 back out of terms_versions.
-- Only for a version that was never published to members: once members have
-- signed 3.5, removing it would undo signatures that were made against it, and
-- that needs the owner's say-so, not this file. Proven locally before merge.
begin;

delete from public.terms_versions where version = '3.5';

commit;
