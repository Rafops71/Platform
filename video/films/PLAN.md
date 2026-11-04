# Walkthrough films: timing plan (draft, builder)

Source: `docs/films-2026-11/*` on branch `claude/great-allen-5xl0gm` (commit 6f0e419). Words are the owner's; nothing here rewords them.

Voice length at 140 wpm (words / 140 x 60), against the visual plan's scene lengths:

| film | block | words | voice s | visual plan s |
|---|---|---|---|---|
| Member EN | 1 | 53 | 22.7 | 35 |
| | 2 | 37 | 15.9 | 30 |
| | 3 | 40 | 17.1 | 30 |
| | 4 | 71 | 30.4 | 40 |
| | total | 201 | 86 | 135 |
| Member ES | 1-4 | 59 / 36 / 47 / 84 | 25.3 / 15.4 / 20.1 / 36.0 | same pictures |
| | total | 226 | 97 | 135 |
| Operator EN | 1 | 50 | 21.4 | 45 |
| | 2 | 68 | 29.1 | 60 |
| | 3 | 64 | 27.4 | 40 |
| | 4 | 52 | 22.3 | 35 |
| | total | 234 | 100 | 180 |

Reading: at 140 wpm the voice fills about 85 s of the 135 s member plan and 100 s of the 180 s Operator plan. Pictures are longer
than speech in every scene. Options (owner/supervisor to choose, I do not decide): (a) keep the plan lengths and let the picture
breathe between sentences (voice placed on the action it names, silence between); (b) tighten each scene to its voice length
(+ about 15 %), giving about 1:35 / 1:45 / 1:55; (c) speak slower (about 100 wpm) - not recommended, it drags.
My default until told otherwise: (a) for scene lengths, with each sentence starting on the picture action it names.

## How it is built
- Screens: `video/films/build-films-demo.js` makes `dist-demo-films/` (demo build, fake data, no Supabase, plus the Operator console
  and Operator sign-in, never published). Playwright captures named states (stills + element boxes), no live database.
- Pictures: Remotion composition per film, time-driven, stills with zoom/cursor/highlight; diagrams from `filmDiagrams.ts`
  (relay through the Operator, documents directly between the parties, commission agreement then introduction).
- Voice: Gemini Algieba EN, a Google Gemini Spanish voice for ES, whisper gate (WER <= 0.15), batched requests (10/day free tier).
- Order: silent low-res drafts, supervisor checks, then 1080p with voice. No music in any render.

## Waiting on
- Item 36 (no Documents tab anywhere) and item 38 (editable forward box) merged, then the screen captures are taken.
