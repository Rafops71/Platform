# The self-checking starter kit

Copy these files into a new project and Claude will hold itself to the same
standard it does here.

Nothing in here is clever. It is five small things that between them stop the
one failure that costs you the most time: **being told something works when
nobody checked.**

## What to copy, and what each piece does

| Copy this | To | What it does for you |
|---|---|---|
| `CLAUDE.md` | project root | The rules. Claude reads it at the start of every session. |
| `.claude/hooks/verify-reminder.js` | same path | Puts two rules in front of Claude on **every single turn**. |
| `.claude/settings.json` | same path | Switches that hook on. Merge it if you already have one. |
| `docs/CHECKLIST.md` | same path | Every function in plain words, each with a number. |
| `scripts/checklist-report.js` | same path | Refuses to go green unless every numbered function has a test that passed. |
| `.github/workflows/ci.yml` | same path | Runs that gate on a server, on push, with nobody watching. |
| `.github/workflows/review.yml` | same path | Asks a different model to read each pull request. Optional. |

Then do three things:

1. In `CLAUDE.md`, replace everything in ANGLE BRACKETS with your real commands.
2. In `docs/CHECKLIST.md`, delete the five example rows and write your own.
3. In `ci.yml`, replace the setup block if the project is not Node, and change
   `npm test` to your test command.

To check the hook is working: start Claude Code and ask it anything. If the
hook is live, the two standing rules arrive with your message.

## Why each piece exists

These are not best practices copied from somewhere. Each one is the scar of a
specific failure on the project it came from.

**`CLAUDE.md` — the rules.** The important one is *nothing from memory, ever*.
It was added after a session where three separate mistakes turned out to be
the same mistake: a thing that felt like recall and was not. A function was
called that had never existed. It felt completely familiar.

**The hook — because the rules file was not enough.** The same rules were in
`CLAUDE.md` and were broken three messages after being written. A file read at
the start of a session stops binding once a long conversation has drifted away
from it. The hook does not rely on remembering to re-read anything. If you
take one thing from this kit, take the hook.

**`docs/CHECKLIST.md` — plain words, not test names.** A test suite tells you
which tests passed. It cannot tell you about a function nobody wrote a test
for: that function is simply absent, and absence looks exactly like success.
The checklist is written by hand, by you, in words you understand, and the
tests then have to earn each line.

**Write prohibitions.** On the original project nearly half the checklist is
things that must NOT happen — nobody's name leaks, a suspended account cannot
read, a signed-out visitor reaches nothing. This is the highest-value idea in
the kit. A broken button is visible on the first try. A leak is not.

**`checklist-report.js` — and the four ways it fails.** An item with no test;
an item whose test failed; a result it cannot read (treated as unproven, not
as a pass); and a test claiming an item the checklist does not list, which is
usually a typo and means a function everybody believes is covered is not.

**`review.yml` — because Claude wrote the code.** It is an opinion, it cannot
fail a build, and roughly one point in three it raises is worth acting on. The
wrong ones are stated just as confidently as the right ones.

## The two rules that matter most

Everything else here is scaffolding for these:

> **Never weaken a test to make it pass.** Never skip, disable or quarantine
> one to get green. If a test fails, either the test is wrong or the code is —
> decide which, say which, and fix that one.

> **A check that cries wolf is worse than no check.** It teaches you to widen
> the tolerance. If a gate fails wrongly, fix the gate; never loosen it.

## What this kit cannot do

Being straight with you, since that is the whole point of it:

- It does not stop Claude being wrong. It stops Claude being wrong *quietly*.
- The checklist is only as good as what you write in it. A function you never
  thought of is not covered by anything here.
- `checklist-report.js` reads `ItemNN` out of your test runner's output. It was
  tested against all four of its failure modes, with a fake test command — not
  against every test runner in the world. Run it once and read what it prints
  before trusting it.
- `review.yml` has not been run from this kit. It is the shape of the one on
  the original project, adapted. The rest of the kit has been run.
