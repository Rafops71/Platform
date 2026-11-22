# Backups

## The situation this was built for

Read off the Supabase Management API on 2026-10-21, not recalled:

    organisation   Rafops71's Org
    plan           free
    project        Jericho Platform   (eu-west-3, ACTIVE_HEALTHY, Postgres 17.6)

And from Supabase's own documentation the same day:

> We automatically back up all Pro, Team, and Enterprise Plan projects on a
> daily basis.

> We recommend that free tier plan projects regularly export their data using
> the Supabase CLI `db dump` command and maintain off-site backups.

So before this, the platform had **no backups at all**. Not a short retention
window — nothing. HANDOFF carried "get a screenshot of the Supabase backup
settings" as an item for the owner for weeks; the answer needed no screenshot
and no setting, because there was nothing there to photograph.

## What runs now

**Built 22 Nov 2026, not yet proven by a green run.** `.github/workflows/database-backup.yml` runs daily at 03:17 UTC and on demand. The storage is a second, PRIVATE repository, `Rafops71/platform-backups` (decision: `docs/AGREED-2026-11-22-backup.md`). Until a real run is green, nothing here may be read as "there are backups".

1. Refuses to run (red, never skipped) if `SUPABASE_DB_URL`, `BACKUP_PASSPHRASE` or `BACKUP_REPO_TOKEN` is missing, or if the backup repository is not confirmed private.
2. Dumps `public` and `auth` with `pg_dump --format=custom`, PostgreSQL 17
   client installed from PGDG (the runner ships 16, and pg_dump will not read
   a server newer than itself).
3. Refuses a dump under 20 kB — a dump that connected, found nothing and wrote
   a valid empty file is the failure that looks most like success.
4. Encrypts it with `openssl enc -aes-256-cbc -pbkdf2 -iter 600000`.
5. **Decrypts it again, restores it into a throwaway PostgreSQL 17 beside the
   job, and asserts what came back** (`scripts/verify-restore.sql`).
6. Pushes the encrypted file to the private repository as `db-YYYY-MM-DD.dump.enc` on its `main` branch
   (`scripts/backup-repo.sh`, with the token in the environment only), then reads it back from a fresh clone and
   compares sha256; a mismatch is red.
7. Deletes dated files older than 30 days in that repository only, printing what it deleted. Deleting removes a file
   from the repository, not from git's history of it.

Run it once by hand with mode `teardown-test` before the first real run: it pushes a harmless dummy file to the backup
repository and deletes it again, touching no backup and not the database.

## Why it is encrypted, and why that is not optional

`Rafops71/Platform` is a **public** repository. GitHub's documentation on
downloading artifacts says "Read access to the repository is required", and on
a public repository everybody has read access.

An unencrypted dump here would publish every member's name, company, email,
phone and country, and every message any of them has ever sent. For a platform
whose entire product is controlled disclosure, that is not a slip, it is the
opposite of the thing.

## Why the backup restores itself every time

A backup nobody has restored is a hope, not a backup. `verify-restore.sql`
asserts, on the restored copy:

- all 14 core tables exist;
- there is at least one profile, and at least one approved Operator;
- `auth.users` exists and is not empty — `public.profiles` is only half of a
  member, and a restore with profiles but no auth rows gives everyone an
  account they cannot sign into. This is what keeps `--schema=auth` honest;
- `activity_log` is not empty — it is the evidence behind the 24-month
  commission claim in section 8 of the Terms.

Both halves were proven locally on 2026-10-22 against a real PostgreSQL:
an empty database fails with *"holds no profiles at all"*, and a database with
one member passes. Then the whole cycle — dump, encrypt, decrypt, restore,
verify — was run end to end, 134 kB dumped and restored, profile counts
matching at 1 and 1. The script also refused a populated target (18 tables)
and a wrong passphrase, both deliberately attempted.

## Restoring one

    BACKUP_PASSPHRASE='...' ./scripts/restore-backup.sh backup.dump.enc \
      "postgresql://.../restore_check"

Read the script's header first. It will not touch the live database and has no
option to: it restores into a database you name and refuses one that already
has tables. Overwriting something real is a decision to take awake, by hand,
after restoring to a copy and looking at it.

The encrypted file comes from the private repository `Rafops71/platform-backups` (sign in as the owner; the files are
`db-YYYY-MM-DD.dump.enc`).

## What this is not

- **Not an archive.** 30 days of nightly files; older ones are deleted (from the repository, not from git's history).
  A backup from before this workflow existed does not exist.
- **Not off-site from GitHub.** Both repositories are at the same provider. A private repository on another account
  would be the next step if the platform ever matters enough.
- **Not recoverable without the passphrase.** Not slow to read — unreadable.
  The passphrase is a repository secret and secrets cannot be read back out,
  so a copy has to exist somewhere outside this repository or the backups are
  decoration.
