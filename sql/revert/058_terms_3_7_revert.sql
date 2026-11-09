-- Revert 058: take Terms 3.7 back out of terms_versions.
-- Only for a version that was never published to members: once members have
-- signed 3.7, removing it would undo signatures that were made against it, and
-- that needs the owner's say-so, not this file. Proven locally before merge.
-- Touches only version '3.7'; the 3.6 rows (sql/049) are left as they are.
begin;

delete from public.terms_versions where version = '3.7';

commit;
