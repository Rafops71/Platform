#!/usr/bin/env node
'use strict';

// Join the voice to the picture.
//
// The recorder held each shot for exactly as long as its line takes to speak,
// plus a fixed pause. So the soundtrack is simply those same lines in the same
// order, with the same pauses between them - no alignment pass, no nudging,
// because the two were built from one script and one set of measurements.
//
// NOT RUNNABLE IN A SESSION CONTAINER. The ffmpeg there is Playwright's
// stripped build: it cannot read a WAV at all, and a full one is not
// installable. This runs on a GitHub runner, which has a real ffmpeg - checked
// by a step in .github/workflows/video.yml before this is called, so a missing
// ffmpeg fails with a plain message rather than a wall of codec errors.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = JSON.parse(fs.readFileSync(path.join(__dirname, 'script.json'), 'utf8'));
const AUDIO = path.join(__dirname, 'audio');
const OUT = path.join(__dirname, 'out');
const PAUSE_SECONDS = SCRIPT.pacing.pauseSeconds;   // one number, shared with video/record.js

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

function run(cmd, args) {
  const res = spawnSync(cmd, args, { encoding: 'utf8' });
  if (res.status === 0) return res.stdout;

  // Everything known about the failure, because the first version of this
  // printed "ffmpeg failed:" and then nothing at all - which is what an
  // ENOENT looks like through spawnSync: status is null, stderr is empty, and
  // the real cause sits in res.error where nobody was looking. A diagnostic
  // that cannot tell "ffmpeg is not here" from "this command was wrong" costs
  // a fifteen-minute run per guess.
  const parts = [`${cmd} ${args.join(' ')}`];
  if (res.error) parts.push(`could not be run at all: ${res.error.message}`);
  parts.push(`exit status: ${res.status === null ? 'none (killed or never started)' : res.status}`);
  if (res.signal) parts.push(`killed by signal: ${res.signal}`);
  const err = (res.stderr || '').trim();
  const out = (res.stdout || '').trim();
  parts.push(err ? `stderr:\n${err.slice(-1500)}` : 'stderr: (empty)');
  if (!err && out) parts.push(`stdout:\n${out.slice(-800)}`);
  throw new Error(parts.join('\n'));
}

function main() {
  const film = arg('film', 'member');
  const lang = arg('lang', 'en');
  const scenes = SCRIPT.films[film].scenes;

  const picture = path.join(OUT, `${film}-${lang}.webm`);
  if (!fs.existsSync(picture)) {
    throw new Error(`No recording at ${picture}. Run video/record.js first.`);
  }

  // One list file: silence, line, silence, line… in script order. Written
  // rather than piped so that a failure can be read afterwards.
  const silence = path.join(OUT, 'pause.wav');
  run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=22050:cl=mono',
                 '-t', String(PAUSE_SECONDS), silence]);

  const list = scenes.flatMap(scene => {
    const line = path.join(AUDIO, `${film}-${lang}-${scene.id}.wav`);
    if (!fs.existsSync(line)) {
      throw new Error(`missing narration for ${scene.id} - run video/make-narration.js`);
    }
    return [`file '${line}'`, `file '${silence}'`];
  }).join('\n');

  const listFile = path.join(OUT, `${film}-${lang}.txt`);
  fs.writeFileSync(listFile, list + '\n');

  const track = path.join(OUT, `${film}-${lang}.wav`);
  run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', track]);

  // -shortest: the picture ends when the last line does. Without it a
  // recording that ran a second long leaves a frozen frame at the end, which
  // reads as the film having crashed.
  const final = path.join(OUT, `${film}-${lang}.mp4`);
  run('ffmpeg', ['-y', '-i', picture, '-i', track,
                 '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
                 '-pix_fmt', 'yuv420p',
                 '-c:a', 'aac', '-b:a', '128k',
                 '-shortest', final]);

  const size = (fs.statSync(final).size / 1_000_000).toFixed(1);
  const duration = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
                                   '-of', 'default=nw=1:nk=1', final]).trim();
  console.log(`\n${path.basename(final)} — ${Number(duration).toFixed(1)}s, ${size} MB`);
}

try {
  main();
} catch (err) {
  console.error('\nAssembly failed:', err.message);
  process.exit(1);
}
