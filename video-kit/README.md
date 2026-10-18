# The explainer-film kit

Make a narrated walkthrough of a web app, in code, so it can be remade from
scratch every time the app changes. No screen recorder, no microphone, no
editing timeline, and nothing to pay for.

The film you get is an MP4 with a real voice, a drawn pointer that moves and
presses, a ring round whatever is being talked about, a zoom into each button
before it is pressed, and captions. It is filmed against throwaway records
that are deleted afterwards.

**Everything here has been run** on the project it came from. What has and has
not been tested *in this packaged form* is listed at the bottom, honestly.

---

## 1. Where the voice comes from

Two free engines, and the licence of a voice matters more than how it sounds.

### Kokoro — the default

| | |
|---|---|
| What | 82M-parameter TTS, runs on a **CPU**, no GPU anywhere |
| Licence | **Apache-2.0**, trained on permissive and public-domain audio |
| Checked | `huggingface.co/hexgrad/Kokoro-82M`, 17 Oct 2026 |
| Install | `pip install kokoro-onnx soundfile` |
| Model files | two downloads, 325MB + 28MB, URLs in `video/make-narration.js` |
| Voices | 54, including Spanish, French, Italian, Portuguese, Hindi, Japanese, Chinese |

Voice grades come from Kokoro's own `VOICES.md`, which is worth reading before
you pick:

| Voice | Who | Its own grade |
|---|---|---|
| `af_heart` | US woman | **A** |
| `af_bella` | US woman | A− |
| `af_nicole`, `bf_emma` | US / British woman | B− |
| `am_michael`, `am_puck`, `am_fenrir` | US man | C+ |
| `am_adam` | US man | F+ — avoid |

Note the shape of that table: **the best male voice Kokoro has is a C+.** If
you want the most natural voice available, it is a female one. The project
this came from chose `am_michael` anyway, by ear, which is the right way to
decide.

### Piper — the fallback

Smaller, faster, far more languages, and audibly more robotic. Kept because
some languages only exist here. Set `voice.engine` to `"piper"` in
`video/script.json`.

### The licence trap — the one thing to actually remember

A voice that sounds good is not a voice you may use.

| Voice | Licence | Usable? |
|---|---|---|
| Kokoro, all voices | Apache-2.0 | yes |
| `en_US-joe-medium` (Piper) | CC0 | yes |
| `en_GB-cori-high`, `en_US-ljspeech-high` | public domain | yes |
| `en_US-ryan-high` | CC **BY-NC-SA** | **no** — non-commercial |
| `en_US-lessac-*` | **research only** | **no** |

Nothing warns you. The model files carry **no licence field at all** — the
licence lives in a model card two hops away, and `lessac` sounds completely
fine. Read the card before you ship a film:
`huggingface.co/rhasspy/piper-voices/resolve/main/<lang>/<voice>/<quality>/MODEL_CARD`

---

## 2. How it works

Four steps, each one a script you can run on its own.

1. **`video/make-narration.js`** speaks every line, and writes **how long each
   one took** into `video/audio/timings.json`.
2. **`video/record.js`** drives a real browser with Playwright and records it,
   holding each shot for exactly as long as its line takes to speak.
3. **`video/assemble.js`** joins voice to picture with ffmpeg.
4. **`video/check-film.js`** proves the result is watchable: a picture, a
   soundtrack, and a length that matches the measured narration.

**The whole design rests on one idea: the film is cut to the voice, not the
voice squeezed into the film.** `video/script.json` is the single source for
both, so they cannot drift apart. Two files would, and a film where the
pointer presses the next button while the sentence is still finishing is worse
than no film at all.

`video/overlay.js` is injected into the page before any of its own scripts
run, and draws the pointer, the ring, the captions and the zoom. Playwright
records the *page* and there is no mouse cursor in the recording at all, so
the pointer is drawn — which is honest to say out loud rather than let anyone
believe they are watching a hand.

---

## 3. Installing it

```
cp -r video            <your project>/
cp .github/workflows/video.yml  <your project>/.github/workflows/
cd <your project>
npm install -D @playwright/test
npx playwright install chromium
cp video/world.example.js video/world.js
```

Then four edits:

1. **`video/world.js`** — the one file the kit cannot write for you. It creates
   the records the film needs, returns the values the script refers to, and
   deletes them. The contract is documented inside it.
2. **`video/script.json`** — replace the three demo scenes with your film.
3. **`.github/workflows/video.yml`** — replace the `MY_APP_*` secrets and the
   line that serves your app locally.
4. **`video/script.json` → `screens`** — your app's nav-button and panel
   selectors, or delete that block and use `press:` and `wait:`.

Run it from the Actions tab: **Record the films** → Run workflow. It takes
about seven minutes and commits the MP4 to `films/` on the branch you ran it
from, because artifact downloads are awkward to get at.

### Before `setUp()` ever runs, prove `tearDown()`

Make some junk records by hand, run `tearDown()`, and look with your own eyes
that they are gone. Only then write `setUp()`. Otherwise the first thing this
kit does to a live system is leave litter in it that nobody knows how to
remove.

---

## 4. The five rules — each one learned by showing a film to somebody

This is the part worth more than the code. Every rule below exists because a
film passed every automated check and a person watching it said "no".

**1. Never talk at a still screen.** The first cut opened with five
explanation scenes on the sign-in page: 58 seconds in which the voice
explained everything and the picture never moved. Nobody survives that,
however good the words are. Say it over something happening — explain how
somebody gets an account *while* the sign-in form is being typed.
*Enforced:* over 20 seconds of still shots in a row and `record.js` refuses to
film.

**2. Zoom no closer than 2×, and always come back out.** Nav buttons were
filmed at 2.8× and eight scenes zoomed in and stayed there. At 2.8× the frame
holds one word and nothing around it — but **a button is identified by its
neighbours**, so a tight crop says *less* about which button it is than a wide
shot with a ring round it. And a zoom that never releases leaves the whole
line playing over a magnified fragment.
*Enforced:* `record.js` refuses a zoom over 2.0× or a zoom with no way out.

**3. One idea per beat.** A form was one scene called "fill in the form", and
the voice listed seven fields over a blur. It is now seven scenes, each
zoomed, each explaining one field. Scene count went 14 → 22 and the film got
*shorter* to watch.

**4. Only claim what is on the screen.** The first film filled a form, jumped
to the records list, and the voice said *"your offer appears with its own
reference number"* over an empty screen — because nothing had ever pressed
Save. If the line says it appears, the film must press the button.

**5. Keep the examples ordinary.** An early draft offered 25,000 tonnes of
copper cathode — roughly a quarter of a billion dollars of metal. Anybody in
that trade reads it as a fantasy. 500 tonnes is one parcel. An inflated number
is the first thing an expert notices and the last thing they forget.

### And the bug underneath all of them

The loop performed each scene's clicking **and then** held for the whole line,
so every scene's picture ran long by however many seconds its typing took —
and the error *accumulated*, scene after scene, until the voice was describing
something several scenes ahead of the picture. `assemble.js` then hid it by
cutting the tail off with `-shortest`, so the total length looked perfect.

The hold is now the line **minus** the time the actions took. A scene whose
actions outrun its line is reported by name, and the fix for that is a longer
line — never a faster camera.

---

## 5. What has been tested, and what has not

In this packaged form, in a container:

- ✅ `make-narration.js` run end to end with Kokoro on this kit's own template
  — three lines spoken and measured.
- ✅ Both of `record.js`'s pre-flight gates run and refuse correctly.
- ✅ The missing-`world.js` message, which is the first thing you will see.
- ✅ Every JavaScript file parses; `video.yml` is valid YAML.
- ✅ `:has()` selectors work in the bundled Chromium (141).

Not tested in this packaged form:

- ❌ A **complete film** from this kit. Filming needs a running app and a
  `world.js`, neither of which a generic kit can supply. The same code has
  produced seven films on the project it came from.
- ❌ `video.yml` as edited here. Its parent runs; the placeholder names will
  need your real ones.

A kit about not overclaiming should not open by overclaiming.
