# Films handover (written 2026-11-03, for the next session)

Nothing here is verified by the test suite; these are notes of what was built and learned. Owner's rules: see CLAUDE.md
(BATCH GO, never decide wording for him, "the Operator" never counted, merge own PRs only on all-green head).

## Workflows and scripts
- `.github/workflows/voice-test.yml` (manual, `only` input): voice tests, trailer jobs, film voices
  (`film-voice-member-en|operator-en|member-es`), `trailer-capture`, `trailer-render-en` / `trailer-send-en`
  (sends a REAL email once), `storyboard-v9`, `storyboard-v10` (captures the live app, holds the live-DB queue).
- `.github/workflows/video.yml`: records and assembles a film (inputs film, lang, engine, voice_run; `voice_run` = a run
  whose artifacts `voice-<film>-<lang>-N` hold the checked line WAVs). Record job uses concurrency `ci-live-database`.
- `send-films.yml`, `send-speed-samples.yml` + `scripts/send-films.js`, `send-speed-samples.js`, `send-trailer.js`
  (Resend; run ids and artifacts hard-coded in them).
- `video/film_voice.py` (branch films-brisk): Gemini in 2 requests or Kokoro, Whisper per-line gate (WER <= 0.15).
- `video/chatterbox_say.py` + `make-narration.js`: Chatterbox batch with the same gate. `video/record.js`, `assemble.js`.
- Trailer: `video/trailer2/` (parts.json, voice.py, capture.js, build.py, MyPlatformScenes.tsx), rendered with
  OpenMontage at a pinned commit (see voice-test.yml). Storyboards: `video/storyboard9/make.js`, `video/storyboard10/`.

## Secrets used
GEMINI_API_KEY, RESEND_API_KEY, LISTING_EMAIL_FROM, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
SUPABASE_DB_URL (captures and recordings), GROQ_API_KEY (the second-opinion review).

## Branches and PRs (state as last seen, re-check)
- PR #72 (new English trailer) merged. PR #74 / branch `trailer-v8` (written fee card): open, owner rejected v8 as cartoonish.
- `films-brisk`: film_voice.py, pause 1.4 -> 0.5 s, `actionSpeed` 1.3 in record.js. No PR. Member EN/ES voices were made
  (runs 41460041795, 41460046917) but NO film was recorded; owner's pace decision on EN was pending.
- `storyboard-v9`, `storyboard-v10`: stills only, no PR. `trailer-files-tmp`, `trailer-files-tmp2`: the proxy cannot delete
  branches, owner to decide. `chatterbox` (voice test jobs) unmerged. Speed-sample / `send-*` branches: see `git branch -r`.

## Gotchas
- Gemini TTS free tier: 10 requests/day; ~7 were used on 2026-11-02. Its style prompt does NOT control pace
  ("brisk, about 140 wpm" gave 184 wpm; a calm prompt gave ~130). Pace is set afterwards with ffmpeg `atempo`.
- Chatterbox writes 32-bit float WAV; assembling it with 16-bit pauses broke film length. Convert to 16-bit first.
- A cancelled recording leaves film fixtures in the live DB; the orphan sweep runs only after 2 h and
  operator-overview.spec.js can fail meanwhile. Never cancel a recording; do not push while one is queued
  (the live-DB group keeps one running + one pending, a newer pending cancels the older).
- The sender job and the test "no email sent" (mailbox-flow) can collide; passes on re-run.
- App text has plural "Operators" (62 strings in js/i18n.js) - the owner's wording decision; captures hide those lines.
- The app has no offer detail window (the Browse row is the detail; Contact is the next window).
- `workflow_dispatch` of a NEW workflow file needs it on main, so jobs were added to voice-test.yml with `only`.
- Background shell jobs die when the container idles; run steps in the foreground.
- Resend "accepted" is not "delivered"; there is no bounce visibility from here.
- Artifacts: Free plan 500 MB; everything uses 14-day retention.
- Parked: Terms 3.5 draft (docs/DRAFT-terms-3.5.md, NOT applied), checklist item 12, DB-side job-title rule.
