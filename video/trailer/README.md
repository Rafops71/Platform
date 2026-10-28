# The trailer (made with OpenMontage)

The animated opening of every film. Agreed with the owner on 2026-10-28:
the trailer is made with OpenMontage; the walkthroughs with this
repository's own pipeline (`video/`). Current version: 5 (60 s, English).
Every word in `script.md` was chosen by the owner, scene by scene - do not
reword anything without asking him, and never suggest the platform checks
or verifies anything (his rule).

## Files

- `script.md` - the agreed text and the owner's wording rules.
- `MyPlatformScenes.tsx` - the bespoke Remotion scenes: spinning globe with
  routes, port (ship, crane, ore trucks), the operator, the three cards,
  the tagline. Colours are the constants at the top (NAVY, BLUE, SKY1,
  SKY2, GOLD, GREEN, RED): change those to restyle without touching voice
  or timing.
- `explainer.patch` - lets OpenMontage's `Explainer` composition draw them
  (`type: "mp_scene"`).
- `trailer-en.json` - the cut list and timings (scene boundaries follow
  the voice).
- `narration-en.mp3` - the finished English voice track (Gemini TTS, voice
  "algieba", style "Confident, warm, polished narrator for a premium
  private trading platform. Brisk, engaging pace, energetic but discreet.
  Do not drag."). Keep it: re-making it needs the owner's Gemini key and
  the free tier is slow (one request hung for 35 minutes on 2026-10-28;
  call it one line at a time with a time limit).
- `build.py` - how the voice lines were joined and the cut list made.

## Not in this repository, on purpose

- **The Gemini key** - the owner's; the repository is public. It goes in
  OpenMontage's own `.env` as `GEMINI_API_KEY`.
- **The music** - "Corporate advertising" by Nastelbom, from Pixabay
  (file `nastelbom-corporate-corporate-advertising-617069.mp3`, 1:52). The
  Pixabay licence allows use in the film without credit but forbids
  distributing the track on its own, so it is not committed. The owner
  keeps the file and uploads it again for a render. Mixed at volume 0.13,
  1.5 s fade in, 2.5 s fade out.

## To re-render (for example after a colour change)

1. Clone OpenMontage and run its setup (its README).
2. Copy `MyPlatformScenes.tsx` to `remotion-composer/src/components/` and
   apply `explainer.patch`.
3. Put the voice in `remotion-composer/public/mp/narration-en5.wav`
   (`ffmpeg -i narration-en.mp3 narration-en5.wav`), the music in
   `public/mp/music.mp3`, and `trailer-en.json` in `public/mp/`.
4. `npx remotion render src/index.tsx Explainer out.mp4 --props public/mp/trailer-en.json --codec h264 --crf 24`
5. Check a still from every scene and that sound is present before sending.

## Still to do

Spanish version (text to be agreed with the owner scene by scene first),
Operator film, and the walkthroughs (GitHub pipeline; to keep one voice,
switch it from Kokoro to Gemini "algieba" - needs the key as a repository
secret).
