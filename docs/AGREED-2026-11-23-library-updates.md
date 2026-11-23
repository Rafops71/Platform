# Library updates (23 Nov 2026)

Job 3 of the 23 Nov batch (owner: BATCH GO, 23 Nov; the supervisor's brief). Four commits, lowest risk first, each one revertable alone; a commit that turns CI red is dropped and reported.

1. `pg` 8.23.0 to 8.23.1 (break-fix; lockfile only).
2. The Node 20 warning on GitHub Actions: `checkout` 5, `setup-node` 5, `cache` 5, `upload-artifact` 6, `download-artifact` 7, `setup-python` 6 (each the first major whose `action.yml` says `node24`, read at the tag). `deploy-pages@v4` is left alone on purpose: it is the publish step.
3. Playwright 1.62.1 to 1.65.1. Release notes 1.63 to 1.65 read; nothing in this repository uses the changed behaviour except `screen` now being passed from device descriptors (watch the picture job).
4. `embedded-postgres` 18.4.0-beta.17 to 18.7.0-beta.19 (the test database only). The PostgreSQL 19 beta is not taken.

No application code, no migration, no member-visible wording.
