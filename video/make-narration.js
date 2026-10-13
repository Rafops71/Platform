#!/usr/bin/env node
'use strict';

// Speak every line of the script, and measure exactly how long each one takes.
//
// WHY THE MEASUREMENT IS THE POINT
//
// The film is cut to the voice, not the other way round. If the recorder holds
// a shot for a guessed three seconds and the line takes four and a half, the
// pointer presses the next button while the sentence is still finishing - and
// it does that fourteen times, drifting further each scene. So each line is
// spoken first, its duration read from the file itself, and the recorder then
// holds that shot for precisely that long.
//
// VOICES
//
// en_US-joe-medium and es_ES-davefx-medium, chosen by the owner on 2026-10-13.
// Both are CC0: nothing is owed to anybody for either. That was not the first
// pair tried - en_US-lessac sounded perfectly good and is licensed for
// RESEARCH ONLY, which is the kind of thing that ends up in a finished film
// because no tool warns you. See docs/VIDEO-BRIEF.md for the licence table.
//
// USAGE
//
//   pip install piper-tts
//   python3 -m piper.download_voices en_US-joe-medium es_ES-davefx-medium
//   node video/make-narration.js [--lang en|es] [--film member]

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPT = JSON.parse(fs.readFileSync(path.join(__dirname, 'script.json'), 'utf8'));
const OUT = path.join(__dirname, 'audio');

const VOICES = {
  en: process.env.PIPER_VOICE_EN || 'en_US-joe-medium',
  es: process.env.PIPER_VOICE_ES || 'es_ES-davefx-medium',
};

/** Where the voice model lives. Piper downloads into the working directory by
 *  default, so both the local and the CI layout are checked rather than one
 *  assumed. */
function modelFor(lang) {
  const name = `${VOICES[lang]}.onnx`;
  for (const dir of [process.env.PIPER_VOICE_DIR, OUT, ROOT, '/tmp']) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `voice ${name} not found. Run:\n` +
    `  python3 -m piper.download_voices ${VOICES[lang]}\n` +
    `and set PIPER_VOICE_DIR if it landed somewhere unexpected.`
  );
}

/** Seconds of audio in a RIFF/WAVE file, read from its own header.
 *
 *  Deliberately not asking ffmpeg: the ffmpeg in a session container is
 *  Playwright's stripped build and cannot read a WAV at all. A PCM header is
 *  forty-four bytes and says everything needed. */
function wavSeconds(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${file} is not a WAV file`);
  }
  let pos = 12;
  let rate = null;
  let bytesPerSecond = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === 'fmt ') {
      rate = buf.readUInt32LE(pos + 12);
      bytesPerSecond = buf.readUInt32LE(pos + 16);
    } else if (id === 'data') {
      if (!bytesPerSecond) throw new Error(`${file}: data before fmt`);
      return size / bytesPerSecond;
    }
    pos += 8 + size + (size % 2);
  }
  throw new Error(`${file}: no data chunk, and ${rate ? 'a' : 'no'} format chunk`);
}

function speak(text, model, outFile) {
  const res = spawnSync('python3', ['-m', 'piper', '-m', model, '-f', outFile], {
    input: text,
    encoding: 'utf8',
  });
  if (res.status !== 0 || !fs.existsSync(outFile)) {
    throw new Error(`piper failed for "${text.slice(0, 40)}…": ${res.stderr || 'no output'}`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const langArg = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : null;
  const filmArg = args.includes('--film') ? args[args.indexOf('--film') + 1] : null;

  const languages = langArg ? [langArg] : ['en', 'es'];
  const films = filmArg ? [filmArg] : Object.keys(SCRIPT.films);

  fs.mkdirSync(OUT, { recursive: true });
  const timings = {};

  for (const film of films) {
    const scenes = SCRIPT.films[film].scenes;
    for (const lang of languages) {
      const model = modelFor(lang);
      let total = 0;

      for (const scene of scenes) {
        const text = scene.say[lang];
        if (!text) throw new Error(`${film}/${scene.id} has no ${lang} line`);
        const file = path.join(OUT, `${film}-${lang}-${scene.id}.wav`);
        speak(text, model, file);
        const seconds = wavSeconds(file);
        timings[`${film}-${lang}-${scene.id}`] = Number(seconds.toFixed(3));
        total += seconds;
        console.log(`  ${lang}  ${scene.id.padEnd(14)} ${seconds.toFixed(2)}s`);
      }

      // A line's worth of breath between scenes, which is also what stops the
      // film feeling like a machine reading a list.
      const withPauses = total + scenes.length * 0.8;
      console.log(
        `\n${film} (${lang}): ${scenes.length} lines, ${total.toFixed(1)}s spoken, ` +
        `${withPauses.toFixed(1)}s with pauses\n`
      );
    }
  }

  fs.writeFileSync(path.join(OUT, 'timings.json'), JSON.stringify(timings, null, 2));
  console.log(`Wrote ${Object.keys(timings).length} lines and their durations to video/audio/.`);
}

main();
