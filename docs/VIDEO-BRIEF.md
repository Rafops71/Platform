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

## The narration: what was actually tried

Checked on 2026-10-13 rather than assumed:

- **espeak-ng** installs here in seconds and speaks English and Spanish. It
  sounds like a 1980s computer. Useful for getting the TIMING right - a
  placeholder track the real voice can replace without re-cutting the picture -
  and wrong for anything a client sees.
- **Kokoro** (Apache 2.0, so commercially clean, and the best free option
  found) does NOT install in this container. Not the 2GB of GPU libraries it
  drags in, which are merely wasteful on a machine with no GPU: the chain
  kokoro -> misaki -> num2words -> docopt ends at an abandoned package whose
  installer no longer builds on current Python. `setuptools<81`,
  `--no-build-isolation` and `docopt-ng` were all tried; the last satisfies the
  import but not pip's requirement on the distribution name.
- **This container's ffmpeg** is Playwright's stripped build. It cannot read a
  WAV file and has no filters, and a full ffmpeg is not installable here. So
  joining sound to picture CANNOT happen in a session container regardless.

Which settles where this work belongs: **on a GitHub runner**, which has a
clean Python and a real ffmpeg, and which is already where the recording has
to happen because it needs the live project. Test the Kokoro install there
before relying on it; if it fails there too, the fallbacks are Google's free
tier (needs the owner's billing account) or the owner's own voice.

## How the sound will be synchronised

One audio file per spoken line, not one long file. Each file's exact duration
is measured, and the recorder holds each on-screen action for precisely that
long. Picture and sound then line up by construction rather than by nudging.
A single long file can be worked with only if it carries clear pauses between
sentences, and the result is less precise.

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
