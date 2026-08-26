# Database test suite

These tests execute the real `sql/` scripts against a local PostgreSQL and
assert the security rules actually hold. They are not a substitute for testing
against the live Supabase project, but they catch what code review misses —
two genuine bugs were found this way:

1. A `current_user` check inside a `SECURITY DEFINER` function evaluated to the
   function's owner rather than the caller, which let a participant promote
   themselves to Operator.
2. `messages_select` correlated on a bare `id`, which bound to
   `message_forward_log.id` instead of `messages.id`, so forwarded messages
   never reached their recipient.

## Running them

Requires PostgreSQL 16 locally (no Supabase needed).

```sh
export PATH=/usr/lib/postgresql/16/bin:$PATH
initdb -D /tmp/pgtest -A trust
pg_ctl -D /tmp/pgtest -o '-k /tmp/pgsock -p 5433' -l /tmp/pg.log start
psql -h /tmp/pgsock -p 5433 -d postgres -c 'create database jericho;'

for f in sql/tests/00_supabase_stub.sql sql/schema.sql sql/rls_policies.sql \
         sql/002_updates.sql sql/003_email_notifications.sql \
         sql/004_email_outbox_retry.sql sql/005_confirmed_updates.sql \
         sql/seed_commodities.sql; do
  psql -h /tmp/pgsock -p 5433 -d jericho -v ON_ERROR_STOP=1 -q -f "$f"
done

psql -h /tmp/pgsock -p 5433 -d jericho -f sql/tests/01_security_suite.sql
```

Expect **38 PASS, 0 FAIL**. Always run against a freshly created database —
the tests mutate data, so a re-run on a dirty database reports false failures.

`00_supabase_stub.sql` stands in for the Supabase-managed pieces the scripts
depend on (`auth.users`, `auth.uid()`, and the `anon` / `authenticated` /
`service_role` roles). Locally `auth.uid()` reads a `test.uid` session setting
so a test can act as a specific user.

Several `ERROR:` lines in the output are expected — they are the security
controls firing (participant blocked from an Operator-only status, anon denied
the invitations table, expired and already-used tokens rejected).
