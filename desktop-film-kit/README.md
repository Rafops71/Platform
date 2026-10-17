# Explainer films of a Windows desktop app

Make a narrated walkthrough of a WPF or WinForms app, in code, so it can be
remade whenever the app changes. The result is an ordinary MP4 — send it on
WhatsApp or email.

Free, end to end. Nothing here costs anything.

## Why this is not the web kit

The web version drives a browser, which will happily scale a page and record
itself. A WPF window has no page to drive and no engine to ask, so the job
splits into three parts:

| Part | What it does | Runs on |
|---|---|---|
| `make-narration.js` | speaks every line, measures how long each takes | anywhere |
| `Filmer` (C#) | drives the app, records where each control was and when it was pressed | **Windows only** |
| `assemble-desktop.js` | does the zoom, the ring and the captions afterwards | anywhere |

**The zoom happens afterwards, and that is deliberate.** A WPF window cannot be
zoomed live — making it bigger changes the layout you are explaining. So the
footage is recorded untouched and cropped later. Which turns out better, not
worse: the same footage can be re-cut to a different zoom, a different ring, or
different words without going near Windows again.

## What you need on the Windows machine

| | Why | Check it with |
|---|---|---|
| .NET 8 SDK | the Filmer is C# | `dotnet --version` |
| Node 20+ | the narration and the assembler | `node --version` |
| Python 3.11+ | the voice | `python --version` |
| ffmpeg on PATH | records the window, builds the film | `ffmpeg -version` |

## The pieces, and the licences

| | What | Licence | Checked |
|---|---|---|---|
| **FlaUI.UIA3** 5.0.0 | finds and clicks Windows controls | **MIT** | nuget.org + repo LICENSE.txt, 17 Oct 2026 |
| **ffmpeg** `gdigrab` | records one window | LGPL/GPL build-dependent | ffmpeg.org/ffmpeg-devices.html |
| **Kokoro** 82M | the voice | **Apache-2.0** | huggingface.co/hexgrad/Kokoro-82M |

**The licence trap, worth two minutes:** a voice that sounds good is not a
voice you may use. Piper's `ryan-high` is CC BY-NC-SA — no commercial use — and
`lessac` is research-only. Both sound completely fine. The model files carry
**no licence field at all**; the licence lives two hops away in a model card.
Kokoro is the default precisely because all of its voices are Apache-2.0.

Kokoro's own `VOICES.md` grades `af_heart` A and `af_bella` A−. **Its best male
voice is a C+** (`am_michael`), which is worth knowing before asking for one.

## Doing it

**1. Install**

```
pip install kokoro-onnx soundfile
curl -L -o kokoro-v1.0.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.onnx
curl -L -o voices-v1.0.bin  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/voices-v1.0.bin
```

**2. Find the real names of the controls**

Install **FlaUInspect** or **Accessibility Insights for Windows**, point it at
your app, and read each control's `AutomationId`. Write those into
`script.json`.

Do not guess them. A guessed id is how a film ends up pressing the wrong
button — and the Filmer refuses to continue rather than guessing for you.

**3. Write the film**

Copy `script.example.json` to `script.json` and replace the demo scenes.

**4. Make it**

```
set KOKORO_DIR=.
node make-narration.js --film demo --lang en
dotnet run --project Filmer -- --app "C:\path\to\YourApp.exe" --film demo --lang en
node assemble-desktop.js --film demo --lang en
node check-film.js --film demo --lang en --file out/demo-en.mp4
```

`out/demo-en.mp4` is the film. Captions are **burned in**, not a subtitle
track, because WhatsApp drops a separate track.

## The five rules

Every one of these exists because a film passed all its automated checks and a
person watching it said no.

**1. Never talk at a still screen.** One cut opened with 58 seconds of
explanation over a motionless window. Nobody survives that, however good the
words. Say it over something happening.
*Enforced:* over 20 seconds of still shots and the Filmer refuses to film.

**2. Zoom no closer than 2×, and always come back out.** Controls were filmed
at 2.8× and some scenes zoomed in and stayed there. At 2.8× the frame holds one
word and nothing around it — but **a control is identified by its neighbours**,
so a tight crop says *less* about which one it is than a wide shot with a ring
round it.
*Enforced:* the Filmer refuses a `zoomScale` over 2.0, and the assembler always
returns to the wide shot, so it cannot get stuck.

**3. One idea per beat.** A form was one scene called "fill in the form", with
the voice listing seven fields over a blur. Split into seven scenes it got
*easier* to watch and shorter in feel.

**4. Only claim what is on the screen.** One film said *"your record appears
with its own reference number"* over an empty list — because nothing had ever
pressed Save. If the line says it appears, the film must press the button.

**5. Keep the example data ordinary.** An early draft quoted 25,000 tonnes of
copper cathode, about a quarter of a billion dollars of metal. Anybody in that
trade reads it as a fantasy. An inflated number is the first thing an expert
notices and the last thing they forget.

## The bug underneath all of them

The web version performed each scene's clicking **and then** held for the whole
line, so every scene ran long by however many seconds its typing took — and it
*accumulated*, until the voice was describing something several scenes ahead of
the picture. The assembler hid it by trimming the end, so the total length
looked perfect.

Both versions now hold for the line **minus** the time the actions took, and
report by name any scene whose actions outran its line. The fix for that is a
longer line, never a faster camera.

## What is tested, and what is not

**Verified on a Linux runner, 17 Oct 2026** — the whole chain after the Windows
step, using synthetic footage, a hand-written `shots.json` and silent clips of
known length:

- ✅ `assemble-desktop.js` produced a real MP4 — segments cropped, joined,
  ringed, captioned, voiced.
- ✅ `check-film.js` passed it: picture, sound, and a length matching the
  measured narration.
- ✅ A control placed hard against the **right edge** of the frame, which is
  the case where a careless crop falls outside the picture and ffmpeg refuses
  it. Clamped correctly.
- ✅ The caption burn-in, which needs `libass` present in ffmpeg.

**Not tested, because it cannot be from Linux:**

- ❌ `Filmer` — it needs a real Windows window, a real cursor and `gdigrab`. It
  has never been run. It compiles against FlaUI 5.0.0's documented API, and the
  versions and licences were checked against nuget.org, but **expect to fix
  something the first time you run it.** The likeliest spots: a control your
  app exposes under a different name than you expect, and the window title
  `gdigrab` needs matching exactly.
- ❌ The four Windows prerequisites above. Run the check commands.

A kit about not overclaiming should not open by overclaiming.
