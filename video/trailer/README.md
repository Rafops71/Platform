# The trailer (made with OpenMontage)

The animated opening of every film: what the platform is, the idea, three
benefits, "Where opportunity meets discretion". Agreed with the owner on
2026-10-28: the trailer is made with OpenMontage, the walkthroughs with this
repository's own pipeline (`video/`). Version 3 is the current one; the
owner's comments on it are still to come.

- `MyPlatformScenes.tsx` - the five bespoke Remotion scenes (bright "sky"
  look, routes, goods, the Operator, the benefit cards, the tagline).
- `explainer.patch` - two lines that let OpenMontage's `Explainer`
  composition draw them (`type: "mp_scene"`).
- `trailer-en.json` - the English cut list and timings.
- `script.md` - the words, English and Spanish.

Voice: Google Gemini TTS, voice "algieba" (the owner's choice from five
samples), through OpenMontage's `gemini_tts` tool, style "Calm, confident,
warm narrator for a premium private trading platform. Unhurried, discreet,
trustworthy." Free tier ("Free of charge", Gemini API pricing page, checked
2026-10-28). The key is the owner's and is NOT in this repository, which
is public: it goes in OpenMontage's own `.env` as `GEMINI_API_KEY`.

To rebuild: clone OpenMontage and run its setup (README there), copy
`MyPlatformScenes.tsx` into `remotion-composer/src/components/`, apply
`explainer.patch`, make the five narration lines with `gemini_tts`, join
them (1.0 s lead, 0.9 s between, 1.5 s tail) into
`remotion-composer/public/mp/narration-en2.wav`, put `trailer-en.json` in
`remotion-composer/public/mp/`, and run
`npx remotion render src/index.tsx Explainer out.mp4 --props public/mp/trailer-en.json --codec h264`.
