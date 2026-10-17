#!/usr/bin/env node
'use strict';

// Is this file a watchable film?
//
// WHY THIS IS A SCRIPT AND NOT THREE LINES OF SHELL
//
// The first version of this check lived in the workflow and compared the
// duration against a hard-coded 60-to-120-second window. The moment the
// narration was slowed down and the lines made fuller - which is to say, the
// moment the film got better - the gate failed a perfectly good film. A gate
// whose numbers are copied from last week's film is a gate that has to be
// edited every time the film changes, and one that gets widened rather than
// fixed.
//
// So the expected length is COMPUTED from the same two sources the film is
// built from: the measured narration in audio/timings.json, and the pause in
// script.json. If picture and voice drift apart, that is what this catches.
//
// It reads the MP4 itself rather than calling ffprobe, so it runs anywhere -
// including a session container, whose ffmpeg is Playwright's stripped build
// and cannot read a WAV at all. An MP4's own header carries the duration and
// names its codecs, which is all three questions answered.

const fs = require('fs');
const path = require('path');

const SCRIPT = JSON.parse(fs.readFileSync(path.join(__dirname, 'script.json'), 'utf8'));

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

/** Seconds, read from the movie header. */
function mp4Seconds(buf) {
  const at = buf.indexOf('mvhd');
  if (at === -1) throw new Error('no mvhd box: this is not an MP4');
  const version = buf[at + 4];
  // Version 1 widened the timestamps from 32 to 64 bits, which moves the two
  // fields wanted here. Both layouts are handled rather than one assumed.
  const timescale = version === 0 ? buf.readUInt32BE(at + 16) : buf.readUInt32BE(at + 20);
  const duration = version === 0 ? buf.readUInt32BE(at + 20) : Number(buf.readBigUInt64BE(at + 24));
  if (!timescale) throw new Error('the movie header has a timescale of zero');
  return duration / timescale;
}

function main() {
  const film = arg('film', 'member');
  const lang = arg('lang', 'en');
  const file = arg('file', path.join(__dirname, 'out', `${film}-${lang}.mp4`));

  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    throw new Error(`there is no film at ${file}`);
  }
  const buf = fs.readFileSync(file);

  // 1. A picture, and 2. a soundtrack. Either one missing is a film that
  //    plays and is useless, and both finish a workflow green.
  const hasPicture = buf.includes('avc1');
  const hasSound = buf.includes('mp4a');

  // 3. A length that matches the voice. Anything else means the camera and
  //    the narration are not in step, which is the failure that cannot be
  //    seen in a still frame or a file listing.
  // Prefer the measurements that shipped NEXT TO the film, and fall back to
  // the working ones. A film carries its own narration lengths because the
  // voice can change between films: checking am_michael's film against
  // af_heart's timings reported a 20-second drift that did not exist, and a
  // check that cries wolf is worse than no check.
  const beside = file.replace(/\.mp4$/, '.timings.json');
  const timingsPath = fs.existsSync(beside)
    ? beside
    : path.join(__dirname, 'audio', 'timings.json');
  console.log(`  measured  ${path.relative(process.cwd(), timingsPath)}`);
  const timings = JSON.parse(fs.readFileSync(timingsPath, 'utf8'));
  const scenes = SCRIPT.films[film].scenes;
  const spoken = scenes.reduce((total, scene) => {
    const seconds = timings[`${film}-${lang}-${scene.id}`];
    if (!seconds) throw new Error(`no measured narration for ${film}-${lang}-${scene.id}`);
    return total + seconds;
  }, 0);
  const expected = spoken + scenes.length * SCRIPT.pacing.pauseSeconds;
  const actual = mp4Seconds(buf);
  const drift = actual - expected;

  console.log(`${path.basename(file)}`);
  console.log(`  size      ${(buf.length / 1e6).toFixed(2)} MB`);
  console.log(`  picture   ${hasPicture ? 'H.264' : 'MISSING'}`);
  console.log(`  sound     ${hasSound ? 'AAC' : 'MISSING'}`);
  console.log(`  spoken    ${spoken.toFixed(1)}s over ${scenes.length} lines`);
  console.log(`  expected  ${expected.toFixed(1)}s  (spoken + ${scenes.length} x ${SCRIPT.pacing.pauseSeconds}s pause)`);
  console.log(`  actual    ${actual.toFixed(1)}s  (${drift >= 0 ? '+' : ''}${drift.toFixed(1)}s)`);

  const problems = [];
  if (!hasPicture) problems.push('the film has no picture');
  if (!hasSound) problems.push('the film has no sound');
  // Five seconds covers the closing hold and rounding. It does not cover a
  // recorder that raced the voice, which is the point.
  if (Math.abs(drift) > 5) {
    problems.push(`the film is ${actual.toFixed(1)}s but the voice needs ` +
                  `${expected.toFixed(1)}s - picture and sound are not in step`);
  }
  if (problems.length) {
    for (const problem of problems) console.error(`\n  FAILED: ${problem}`);
    process.exit(1);
  }
  console.log('\n  Verified: picture, sound, and a length that matches the voice.');
}

try {
  main();
} catch (err) {
  console.error(`\nThe film could not be checked: ${err.message}`);
  process.exit(1);
}
