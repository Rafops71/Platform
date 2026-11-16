-- Revert 065: take Terms 3.8 back out of terms_versions.
-- Only for a version that was never published to members: once members have
-- signed 3.8, removing it would undo signatures that were made against it, and
-- that needs the owner's say-so, not this file. Proven locally before merge.
-- Touches only version '3.8'; the 3.7 rows (sql/058) are left as they are.
begin;

delete from public.terms_versions where version = '3.8';

commit;
