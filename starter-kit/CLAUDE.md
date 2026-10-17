# Working on this project

Copy this file to the root of a project. Claude Code reads it at the start of
every session. The three sections below are the ones that actually changed
Claude's behaviour on the project they came from; everything else is yours to
add.

Replace the words in ANGLE BRACKETS with your project's real commands.

## Verification: the rule

**The test suite, the tick/cross table and the CI gate are the verification
system. Claude is never the verification system.**

Claude's shell and browser are for *maintaining* that system, not replacing
it: writing and repairing tests, exploring for problems nobody thought to
check, diagnosing a red run, and helping run the suites. Nothing else.

Three reasons this is not negotiable:

1. The gate runs on a server, on push, with nobody watching. Claude is not
   there. A gate that needs Claude present is not a gate.
2. Claude writes the code here. Claude judging whether that code works is the
   author marking their own homework — the exact thing the checklist exists to
   prevent.
3. A gate must give the same answer every time. A test's assertions do. A
   model's judgement does not.

So: **never report a function as working because Claude looked at it.** A
function is proven when a named test passed and the table ticked it. Anything
else is "written, not yet run" — say that instead.

## Reporting rules

- **Nothing from memory. Ever.** Not a function name, not a column, not a
  menu, not a limit, not a price. If it has not been checked in this session
  with a tool that can see the thing itself, it is not known — and the honest
  sentence is "I cannot check that from here", not a confident guess.

- Never say something works unless a check was run and its output said so.
  "It should work now" is not acceptable. A clean parse proves nothing.

- The same standard applies to every factual claim, not only to code. Where a
  menu is in somebody else's dashboard, what a service's current limits are,
  what a product calls a thing this month — look it up with a tool that can
  see it now, or say plainly that it cannot be checked from here.

- Prefer a route that needs no screen at all. A verifiable value, a direct URL
  taken from current documentation, or a command beats a described click path,
  because the first three can be checked before they are handed over and the
  last cannot.

- Before pushing, run the suites the change could have disturbed and show the
  output. Where they cannot be run, say so plainly and do not tick anything.

- When a test fails, decide whether the test or the application is wrong, and
  say which. **Never weaken a test to make it pass. Never skip, disable or
  quarantine one to get green.**

- When something many tests depend on changes, find every dependant in one
  search before pushing, not one failed run at a time.

- When a failure turns out to be a real bug: fix it, and say plainly that the
  checklist caught it.

- A check that cries wolf is worse than no check: it teaches whoever reads it
  to widen the tolerance. If a gate fails wrongly, fix the gate, do not widen
  it.

## Running things

- `<HOW TO RUN THE FAST CHECKS>` — lint, types, unit tests.
- `<HOW TO RUN THE FULL SUITE>` — the slow one.
- `<ANYTHING THAT NEEDS CREDENTIALS, AND WHAT HAPPENS WITHOUT THEM>`

If a suite cannot run in this environment, write down here WHY and what the
workaround is. On the project this came from, the database suite refused to
run as root, and the two-line recipe for running it as an ordinary user was
worth more than any other note in this file: before it, every database
question cost a fifteen-minute CI run, which is why changes went out
half-checked.

## Audience

<WHO IS READING THE ANSWERS, AND HOW.> On the project this came from: the
owner is not a developer, reads on a small screen, and wants short answers
without jargon. Plain words, few lines, no walls of text.
