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
// VOICES AND THEIR LICENCES - READ THIS BEFORE CHANGING THE VOICE
//
// The default is Kokoro, Apache-2.0, which is why it is the default. See the
// kit's README for the full table and where each fact was checked.
//
// A WARNING WORTH THE TWO MINUTES: a voice that sounds good is not a voice
// you may use. en_US-lessac sounds perfectly fine and is licensed for
// RESEARCH ONLY. Piper's ryan-high is CC BY-NC-SA - no commercial use. No
// tool warns you, the model files carry no licence field at all, and the
// licence lives two hops away in the voice's own model card. Check it before
// you ship a film, not after.
//
// USAGE
//
//   pip install kokoro-onnx soundfile
//   curl -L -o kokoro-v1.0.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.onnx
//   curl -L -o voices-v1.0.bin  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/voices-v1.0.bin
//   KOKORO_DIR=. node video/make-narration.js [--lang en|es] [--film demo]

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPT = JSON.parse(fs.readFileSync(path.join(__dirname, 'script.json'), 'utf8'));
const OUT = path.join(__dirname, 'audio');

const VOICE = SCRIPT.voice;
const ENGINE = process.env.NARRATION_ENGINE || VOICE.engine;

const VOICES = {
  en: process.env.PIPER_VOICE_EN || VOICE.piper.en,
  es: process.env.PIPER_VOICE_ES || VOICE.piper.es,
};

const KOKORO_VOICES = {
  en: process.env.KOKORO_VOICE_EN || VOICE.kokoro.en,
  es: process.env.KOKORO_VOICE_ES || VOICE.kokoro.es,
};

/** Kokoro's two model files. Three hundred megabytes, so they are downloaded
 *  rather than committed, and looked for in the same places as a Piper voice
 *  rather than one location being assumed. */
function kokoroFiles() {
  const names = ['kokoro-v1.0.onnx', 'voices-v1.0.bin'];
  const dirs = [process.env.KOKORO_DIR, OUT, ROOT, '/tmp'].filter(Boolean);
  for (const dir of dirs) {
    if (names.every(name => fs.existsSync(path.join(dir, name)))) {
      return names.map(name => path.join(dir, name));
    }
  }
  throw new Error(
    'Kokoro\'s model files were not found. Download them with:\n' +
    '  curl -L -o kokoro-v1.0.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.onnx\n' +
    '  curl -L -o voices-v1.0.bin  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/voices-v1.0.bin\n' +
    `and set KOKORO_DIR. Looked in: ${dirs.join(', ')}`
  );
}

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

const PACING = SCRIPT.pacing;

/** Speak one line with Kokoro. */
function speakKokoro(text, lang, outFile) {
  const [model, voices] = kokoroFiles();
  const res = spawnSync('python3', [
    path.join(__dirname, 'kokoro_say.py'),
    model, voices, KOKORO_VOICES[lang], String(VOICE.kokoro.speed),
    lang === 'es' ? 'es' : 'en-us', outFile,
  ], { input: text, encoding: 'utf8' });
  if (res.status !== 0 || !fs.existsSync(outFile)) {
    throw new Error(
      `Kokoro failed on "${text.slice(0, 40)}…"\n` +
      (res.error ? `could not be run at all: ${res.error.message}\n` : '') +
      ((res.stderr || '').trim() || '(no error output)'));
  }
}

function speak(text, model, outFile) {
  // --length-scale above 1.0 slows the delivery; --sentence-silence puts
  // breath between sentences. Both read from script.json's pacing block, so
  // the voice and the camera cannot be set to different speeds. Flag names
  // read off `python3 -m piper --help` on 2026-10-13, not from memory.
  const res = spawnSync('python3', ['-m', 'piper', '-m', model, '-f', outFile,
    '--length-scale', String(PACING.lengthScale),
    '--sentence-silence', String(PACING.sentenceSilence)], {
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

  console.log(`Speaking with ${ENGINE}: ` +
    (ENGINE === 'kokoro'
      ? `${KOKORO_VOICES.en} / ${KOKORO_VOICES.es} at speed ${VOICE.kokoro.speed}`
      : `${VOICES.en} / ${VOICES.es} at length-scale ${PACING.lengthScale}`));

  for (const film of films) {
    const scenes = SCRIPT.films[film].scenes;
    for (const lang of languages) {
      const model = ENGINE === 'kokoro' ? null : modelFor(lang);
      let total = 0;

      for (const scene of scenes) {
        const text = scene.say[lang];
        if (!text) throw new Error(`${film}/${scene.id} has no ${lang} line`);
        const file = path.join(OUT, `${film}-${lang}-${scene.id}.wav`);
        if (ENGINE === 'kokoro') speakKokoro(text, lang, file);
        else speak(text, model, file);
        const seconds = wavSeconds(file);
        timings[`${film}-${lang}-${scene.id}`] = Number(seconds.toFixed(3));
        total += seconds;
        console.log(`  ${lang}  ${scene.id.padEnd(14)} ${seconds.toFixed(2)}s`);
      }

      // A line's worth of breath between scenes, which is also what stops the
      // film feeling like a machine reading a list.
      const withPauses = total + scenes.length * PACING.pauseSeconds;
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
