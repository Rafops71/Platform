# Plan: real stock pictures for acts 2 and 6 (no purchase, $0)

Status 2026-11-03: a plan only. Nothing is downloaded or rendered. Written by the film builder session for the supervisor.
Serves docs/AGREED-2026-11-01-owner-changes.md (the trailer pictures).

## What is blocked or unknown (checked today)
- **Stock API keys**: not yet available (owner is getting PEXELS_API_KEY / PIXABAY_API_KEY as repo secrets). Without a key neither site can be searched from here.
- **Licence pages**: `https://www.pexels.com/license/` and `https://pixabay.com/service/license-summary/` both returned HTTP 403 from this container. So the exact licence wording (attribution, people in pictures, brand use) is NOT checked. OpenMontage's own tool labels Pexels "free, no attribution required" - that is the tool author's text, not the licence. Read both pages (owner's screen, or a runner) before use.
- **OpenMontage in this session**: cloned (read only) at the pinned commit `195eab24478dc9363326aec437aefc3701635ddf` (the one the trailer jobs use). Running its `make setup` here was refused by the session's permission check (third-party code), so it is NOT installed here. It already has `tools/video/pexels_video.py` and Pixabay tools (env vars as above). The same commit's composer is installed on GitHub runners by `voice-test.yml`; stock fetch and grading can run there with the repo secrets, which keeps the keys out of chat.

## Act 2 (ships, daylight, haze) - what to search
Two shots, or one shot plus our drawn radar dials on top:
1. Wide: one container ship, side or three-quarter view, in morning mist/haze on a calm sea, sun low. Queries: `container ship fog`, `cargo ship morning mist`, `container vessel sea haze`, `ship in fog sunrise`, `container ship aerial haze`. Need: the stacks readable, a pale sky, no readable ship name or flag if possible (so no real company shows).
2. The reveal: the same or a similar ship with sun breaking through (`sun rays through mist sea ship`, `ship sunlight break clouds sea`); or a close shot of container stacks in sun (`container stack close up sunlight`).
3. Optional cut-in for the radar idea: `ship radar screen`, `radar sweep close up`. Our drawn light dials are already approved; a real radar shot only if it fits the light palette.
Prefer VIDEO (slow drift) for the wide shots, a still for the reveal.

## Act 6 (handshake, suits, both light skin) - what to search
Close shots of two hands and suit sleeves, faces out of frame, light or white background: `business handshake close up`, `handshake suits white background`, `shaking hands businessmen close-up`, `handshake two men suits`, `handshake slow motion`. Need: two shakes visible (video) or a still we animate; both hands the same light tone; cuffs and dark/blue suit sleeves; no logos, watches with visible brands. Keep the pose and the "two calm shakes, then hold" motion plan; if only stills are found, we move them (two gentle 20 px shakes) as in the table.

## Grading to the app-light look (done by us, not by the stock site)
- Lift blacks toward `#e2ebf3`, mild desaturation, blue bias toward `#27618f`, highlights toward `#f0f6fb` (ffmpeg `curves`/`eq`, or CSS filters in the Remotion scene).
- Our haze on top: the same layered, textured fog used in the storyboard (soft white, drifting at 2-3 speeds), so a stock shot and the drawn parts match.
- Act 2 reveal: a warm light patch and our sparkle on the water over the real cargo.
- Act 6: the dimmed picture under the fee card is the same shot at about 26 % opacity (card stays crisp, dark text on white).
- Key words and the written card stay ours (Spectral, `#15202b`); no stock text.

## Records to keep for every asset (so licence can be audited)
`video/stock/assets.json`: site, asset page URL, asset id, photographer/creator, the licence page URL and the date it was read, the search query that found it, file used, grade applied. Nothing enters the trailer without a row.

## Sample first
When keys arrive: fetch 6 candidates per act, make 1920x1080 graded stills (one per candidate), list them in a storyboard-style table, owner picks; only then any video.

## Open questions for the owner
1. Faces in stock footage: if a person's face is visible, is that acceptable? (Plan avoids faces.)
2. OK to run OpenMontage setup on a GitHub runner (as the trailer jobs already do), instead of in this container?
