# AGREED 22 Nov 2026: the nightly database backup goes to a second, private repository (owner's decision)
Relayed by Supervisor 2, who read the repository and its README; the owner stored the two repository secrets himself.

**Why.** The live database had no backups of any kind (Supabase free plan: `HANDOFF.md`, "There were no backups at all", 22 Oct 2026). The first design, an encrypted artifact on this PUBLIC repository, needed a passphrase the owner would have to keep, which he asked not to rely on; a session cannot remember it for him.

**The route (owner-approved, free plan).** The encrypted dump goes to a second, PRIVATE repository, `Rafops71/platform-backups`, as `db-YYYY-MM-DD.dump.enc` on its `main` branch, pushed with a fine-grained token that reads and writes Contents on that repository only (secret `BACKUP_REPO_TOKEN`). The dump is still encrypted first with `BACKUP_PASSPHRASE`: this repository is public, and a private repository is one more lock, not the only one. The owner reads the backups with his own GitHub login; recovering the passphrase is still on him.

**What the workflow does** (`.github/workflows/database-backup.yml`, moved from `docs/drafts/`): daily at 03:17 UTC and on demand; refuses to run (red, never skipped) when `SUPABASE_DB_URL`, `BACKUP_PASSPHRASE` or `BACKUP_REPO_TOKEN` is missing, or when the backup repository is not confirmed private; dumps `public` and `auth` with a PostgreSQL 17 client; encrypts; decrypts again and restores into a throwaway PostgreSQL 17 and checks the data came back; pushes; reads the pushed file back from a fresh clone and compares its sha256; deletes dated files older than 30 days in that repository only, printing what it deleted.

**Before the first real run:** run the workflow by hand with mode `teardown-test`: it pushes a harmless dummy file to the backup repository and deletes it again, proving write and delete with the real token, and touches no backup and not the database.

**What it still is not:** the claim "there were no backups" stays in `HANDOFF.md` until a green real run proves the new one. Deleting a file removes it from the repository, not from git's history of it. The 30 days is a retention of files in the repository, not an archive.
