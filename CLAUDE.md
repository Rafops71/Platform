# Working on this project

## Verification: the rule

**The Playwright suite, the tick/cross table and the CI gate are the
verification system. Claude is never the verification system.**

Claude's browser and shell are for *maintaining* that system, not replacing it:
writing and repairing tests, exploring for problems nobody thought to check,
diagnosing a red run, and helping run the suites locally. Nothing else.

Three reasons this is not negotiable:

1. The gate runs on a GitHub server, on push, with nobody watching. Claude is
   not there. A gate that needs Claude present is not a gate.
2. Claude writes the code here. Claude judging whether that code works is the
   author marking their own homework — the exact thing `docs/CHECKLIST.md`
   exists to prevent.
3. A gate must give the same answer every time. Playwright's assertions do.
   A model's judgement does not.

So: **never report a function as working because Claude looked at it.** A
function is proven when a named `ItemNN_` test passed and the table ticked it.
Anything else is "written, not yet run" — say that instead.

## What the checklist is

`docs/CHECKLIST.md` lists every core function in plain words. It is the source
of truth, not a summary of the tests. 22 of the items are prohibitions: this
platform's product is controlled disclosure, so proving something *did not*
happen is worth more than proving a button worked.

- One test per item, titled `ItemNN_what_it_checks`, tagged `@checklist`.
- `npm run checklist` runs the group and prints one line per function.
- It fails three ways: an item with no test, an item whose test failed, and a
  test claiming an `ItemNN` the checklist does not list.
- `.github/workflows/ci.yml` gates the build on it. A crossed function produces
  no artifact.

Adding a function to the checklist without a test breaks the build on purpose.

## Reporting rules

- Never say something works unless a check was run and its output said so.
  "It should work now" is not acceptable. A clean parse proves nothing.
- Before pushing, run the suites the change could have disturbed and show the
  output. Where they cannot be run — no `.env`, or a cloud container where
  PostgreSQL will not start as root — say so plainly and do not tick anything.
- When a test fails, decide whether the test or the application is wrong, and
  say which. Never weaken a test to make it pass. Never skip, disable or
  quarantine one to get green.
- When something many tests depend on changes, find every dependant in one
  search before pushing, not one failed run at a time.
- When a failure turns out to be a real bug: fix it, and say plainly that the
  checklist caught it.

## Running things

- `npm run serve` — static server. Playwright starts it itself; nothing needs
  to be open beforehand.
- `npm run test:sql` — database suite, needs no credentials (it downloads its
  own PostgreSQL). Will not run as root.
- `npm run e2e` / `npm run checklist` — browser suites, need `.env` and the
  live Supabase project.

## Documents

`HANDOFF.md` and `docs/` drift out of date the moment a session ends without
updating them. Two of its "still open" items were already done in later commits.
If a change closes something a document claims is open, update the document in
the same commit.

## Audience

The owner is not a developer, reads on a small screen, and wants short answers
without jargon. Plain words, few lines, no walls of text.
