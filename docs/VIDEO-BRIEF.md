# The two films: brief, tabled until the app is fully tested

**Do not start this.** The owner was explicit on 2026-10-13: it waits until
testing is finished. It is written down here so the brief survives the session,
not as work to pick up.

## What he asked for

Two films, **about two minutes each** — not ninety seconds. He revised the
length himself after seeing the first scripts: ninety seconds was not enough
room to actually show the thing working.

- **One for members.** Somebody invited, deciding whether to trade here.
- **One for Operators.** The person running the market.

### A walkthrough, not a trailer

His words: *buttons pressed and examples given for each function, and how they
can connect to us and to each other.* So:

- **Every function gets its moment**, not a montage. A viewer should be able to
  do the thing afterwards.
- **Real presses on real screens.** The pointer visibly lands on the control,
  the screen responds. No still images with captions over them.
- **A worked example each time**, with real commodity-trade values — copper
  cathode, 25,000 MT, CIF Rotterdam — never "Item 1" or lorem filler.
- **How people reach each other** is the spine of both films: a member reaches
  the Operator, the Operator reaches the other member, and the two members
  never reach each other directly. The films exist to make that legible.

### Narration

A text-to-speech voice, which the owner is arranging. The scripts are written
and the timings will need redoing for two minutes:
https://claude.ai/artifact/LtKEDq7KjWRNCFtMc4RjhN — member and Operator, English
and Spanish, with a copy button per script.

## What the recording will need

- Playwright can drive and film the real platform; `/opt/pw-browsers/ffmpeg-1011`
  can turn the recording into a file. Checked on 2026-10-13, not assumed.
- It cannot be filmed from a session container: the browser there has no clean
  route to the CDN the pages load. A workflow on a GitHub runner can, and that
  is also where the throwaway accounts are already created and deleted.
- It must film the CURRENT code. The live site serves `main`, which is behind.
- Fixtures first: film against throwaway accounts that `cleanup()` removes, and
  never against a real member's data.

## What stays out

No trading volumes, no company details, no promises about fees. Those wait for
the company to exist and for a lawyer to have read the Terms.
