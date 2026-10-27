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
of truth, not a summary of the tests. 37 of the items are prohibitions: this
platform's product is controlled disclosure, so proving something *did not*
happen is worth more than proving a button worked.

- One test per item, titled `ItemNN_what_it_checks`, tagged `@checklist`.
- `npm run checklist` runs the group and prints one line per function.
- It fails three ways: an item with no test, an item whose test failed, and a
  test claiming an `ItemNN` the checklist does not list.
- `.github/workflows/ci.yml` gates the build on it. A crossed function produces
  no artifact **and publishes nothing**: the site is deployed only by ci.yml's
  `deploy` job, which waits for every check (see HANDOFF, "Publishing is behind
  the gate"). `npm run check:deploy` fails the build if that wiring is ever
  weakened - one `always()` would undo it.

Adding a function to the checklist without a test breaks the build on purpose.

## The second opinion

`.github/workflows/review.yml` asks a model that did not write the code to read
every pull request and comment. It exists because the owner said the obvious
thing out loud: Claude cannot be judge, jury and executioner on its own work.

It is an opinion and nothing more. It cannot fail a build, and promoting it to
a gate would be a mistake: its first review raised five points, of which one
was worth acting on and two were confidently wrong — stated as plainly as the
true one. Read what it says, check each claim against the code, and act on what
survives. The same standard applies to it as to Claude: nothing is true because
something fluent said it.

## Reporting rules

- **Nothing from memory. Ever.** Not a function name, not a column, not a menu,
  not a limit, not a price. If it has not been checked in this session with a
  tool that can see the thing itself, it is not known - and the honest sentence
  is "I cannot check that from here", not a confident guess. The owner said
  this in those words on 2026-10-13, after a session in which three separate
  failures were all the same mistake: a thing that felt like recall and was
  not. `initLanguage()` felt like recall. It had never existed.

- Never say something works unless a check was run and its output said so.
  "It should work now" is not acceptable. A clean parse proves nothing.
- The same standard applies to every factual claim, not only to code. Where a
  menu is in a third-party dashboard, what a service's current limits are, what
  a product calls a thing this month — look it up with a tool that can see it
  now, or say plainly that it cannot be checked from here. A confident sentence
  about a button that moved last quarter costs the owner more time than
  admitting the uncertainty, and the owner reads on a small screen with little
  patience for being sent somewhere that does not exist.
- Prefer a route that needs no screen at all. A verifiable value, a direct URL
  taken from current documentation, or a command beats a described click path,
  because the first three can be checked before they are handed over and the
  last cannot.
- Before pushing, run the suites the change could have disturbed and show the
  output. Where they cannot be run — no `.env`, or a cloud container where
  PostgreSQL will not start as root — say so plainly and do not tick anything.
- When a test fails, decide whether the test or the application is wrong, and
  say which. Never weaken a test to make it pass. Never skip, disable or
  quarantine one to get green.
- When something many tests depend on changes, find every dependant in one
  search before pushing, not one failed run at a time.
- **A test that never ran is not a pass.** `npm run test:sql` compares the
  assertions each file declares (`as "T..."`) with those that reported, and
  fails on any that did not. Until 2026-10-25 an assertion that errored simply
  vanished: three had (T8 and T18 in 01, T22 in 14), one of them a security
  prohibition, while every run said "All assertions passed".
- **Work reaches main through a pull request.** CI runs on the pull request
  before anything merges, and the second-opinion reviewer only runs there. A
  direct push to main skips both.
- **Every pull request says what it serves.** Its description names a
  checklist item ("Item 70") or the decisions file it carries out
  (`docs/AGREED-....md`). `scripts/check-pr-purpose.js` fails the pull
  request otherwise, and fails it for naming an item the checklist lacks.
- When a failure turns out to be a real bug: fix it, and say plainly that the
  checklist caught it.

## Running things

- `npm run serve` — static server. Playwright starts it itself; nothing needs
  to be open beforehand.
- `npm run test:sql` — database suite, needs no credentials (it downloads its
  own PostgreSQL). Will not run as root — **but that is not a dead end**. In a
  cloud container, make an ordinary user once and run it as them:

      useradd -m pgtest && chown -R pgtest:pgtest node_modules/@embedded-postgres
      su pgtest -c "cd /home/user/Platform && npm run test:sql"

  Verified working on 2026-10-13. This matters more than it looks: before it,
  every database question cost a fifteen-minute CI run, which is why changes
  went out half-checked. Run it before pushing, and run it on the previous
  commit too when something fails, so "my change broke this" is established
  rather than assumed.
- `npm run e2e` / `npm run checklist` — browser suites, need `.env` and the
  live Supabase project.

## Documents

`HANDOFF.md` and `docs/` drift out of date the moment a session ends without
updating them. Two of its "still open" items were already done in later commits.
If a change closes something a document claims is open, update the document in
the same commit.

## How to work with the owner (his words, 2026-10-25)

- **One block at a time.** He reads on a 13-inch screen and cannot hold a long
  list. Give one block; wait for his answer; then the next. Format each block
  as **asked → you answered → my feedback**. Give no feedback until every
  block has been answered, unless he says "respond now". The feedback comes in
  blocks as well.
- **No "ask a lawyer".** He has said so plainly. Research statutes, case law
  and court rules directly, check each against the primary source, and mark
  anything that could not be verified. Say the limit once, then do the work.
- **Standing permission for safe database changes (his yes, 2026-10-25).**
  A live database change that only ADDS (a column, a table, a function, a
  check, a lock, a new Terms version) and whose revert has been run and
  proven locally may be applied without asking first. Tell him afterwards:
  what changed, and that the checks passed. Still ask first, every time, for
  anything that deletes, changes or removes members' data, or that could
  stop an existing member from doing what they could do before.
- **Plain words, toddler style, with an example** whenever something is
  explained. Start progress replies with a status line: "⏱ Now: … · time
  left · need you: yes/no". Say how long each step takes, so he knows how
  long to stay at the PC.
- **Notify his phone** (push notification) when something finishes or needs
  him.
- **Passwords or keys pasted in chat:** he does not care who sees them. Do
  not warn him or suggest rotating them.
- **Grok** was given access to his GitHub and projects by him. Do not raise
  it.
- **Answers meant for another AI** (ChatGPT, Mistral, Grok) are written
  addressed to that AI, not to him.
- **His domain: intercommodities.net** (his, and the website is his too;
  his email ends in @intercommodities.net). The platform's own domain is
  now **myplatform.trade** (placeholder, 2026-10-27): platform mail goes out
  from noreply@mail.myplatform.trade, and his platform address is
  rafael@myplatform.trade. The .trade name is his own deliberate,
  one-year placeholder, not a breach of the rule below. New domains bought
  later: .com only.
- **Company placeholder:** until incorporation, the Terms use his own name
  and address, as an independent broker trades under his own name.
- **Domains: .com only. Nothing Belgian** - no .eu/.be, no Belgian company
  forms or wording.
- **Films are on hold** and cost his usage; do not start them or use
  multi-agent "arena" approaches. Plan in HANDOFF.md.
- **Latest information as of the day.** Re-check anything time-sensitive on
  the day it is asked, not from an earlier session.

## Audience

The owner is not a developer, reads on a small screen, and wants short answers
without jargon. Plain words, few lines, no walls of text.
