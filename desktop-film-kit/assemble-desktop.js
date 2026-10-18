#!/usr/bin/env node
'use strict';

// Turn raw footage of a desktop app into the finished film.
//
// WHY THE ZOOM HAPPENS HERE AND NOT WHILE FILMING
//
// A web page can be zoomed live, because a browser will scale it for you. A
// WPF window cannot: making it bigger changes its layout, which is the thing
// being explained. So Filmer records the window untouched and writes down
// WHERE each control was and WHEN it was pressed, and the zoom is a crop
// applied afterwards.
//
// That turns out to be better, not worse. Footage that was never zoomed can be
// re-cut to a different zoom, a different ring, different words, without going
// anywhere near Windows again.
//
// WHAT IT DOES, PER SCENE
//
//   wide, with a ring round the control  ->  zoom in  ->  wide again
//
// which is the rule the web films arrived at after the owner watched one that
// zoomed in and never came back out: show the control, use it, pull back and
// show what it did.
//
// The zoom is a short ladder of crops rather than a continuous push. It is a
// few frames of stepping rather than a glide - honest about what it is, and
// it cannot go wrong in the way a zoompan expression can.
//
// USAGE
//   node assemble-desktop.js --film demo --lang en

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'out');
const AUDIO = path.join(ROOT, 'audio');
const SCRIPT = JSON.parse(fs.readFileSync(path.join(ROOT, 'script.json'), 'utf8'));
const PAUSE = SCRIPT.pacing.pauseSeconds;

// The finished frame. The footage is whatever size the app window was, and
// every segment is scaled to this so they can be concatenated at all.
const W = 1280, H = 720;

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

function run(cmd, args) {
  const res = spawnSync(cmd, args, { encoding: 'utf8' });
  if (res.status === 0) return res.stdout;
  const parts = [`${cmd} ${args.join(' ')}`];
  if (res.error) parts.push(`could not be run at all: ${res.error.message}`);
  parts.push(`exit status: ${res.status === null ? 'none (never started)' : res.status}`);
  const err = (res.stderr || '').trim();
  parts.push(err ? `stderr:\n${err.slice(-1500)}` : 'stderr: (empty)');
  throw new Error(parts.join('\n'));
}

/** One sub-clip: a slice of the raw footage, cropped to a zoom level, with a
 *  ring drawn round the control when the shot is wide enough to show it. */
function segment(raw, index, start, duration, rect, zoom, ring) {
  const file = path.join(OUT, `seg-${String(index).padStart(3, '0')}.mp4`);
  const filters = [];

  if (zoom > 1.001 && rect) {
    // A crop the same shape as the output, centred on the control, then
    // scaled back up: that IS a zoom. Clamped inside the frame so a control
    // near an edge does not produce a crop that falls off it, which ffmpeg
    // rejects outright.
    const cw = Math.round(W / zoom), ch = Math.round(H / zoom);
    const cx = Math.min(Math.max(Math.round(rect.x + rect.w / 2 - cw / 2), 0), Math.max(W - cw, 0));
    const cy = Math.min(Math.max(Math.round(rect.y + rect.h / 2 - ch / 2), 0), Math.max(H - ch, 0));
    filters.push(`crop=${cw}:${ch}:${cx}:${cy}`, `scale=${W}:${H}`);
  } else {
    filters.push(`scale=${W}:${H}`);
  }

  if (ring && rect) {
    // Drawn AFTER the scale, in output coordinates, so the ring is the same
    // thickness whether the shot is wide or close.
    const x = Math.max(rect.x - 6, 0), y = Math.max(rect.y - 6, 0);
    filters.push(`drawbox=x=${x}:y=${y}:w=${rect.w + 12}:h=${rect.h + 12}:` +
                 `color=0x27618F@0.95:thickness=3`);
  }

  run('ffmpeg', ['-y', '-ss', String(start), '-t', String(duration), '-i', raw,
                 '-vf', filters.join(','), '-an',
                 '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
                 '-pix_fmt', 'yuv420p', '-r', '25', file]);
  return file;
}

/** Seconds as an SRT timestamp. */
function stamp(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`;
}

function main() {
  const film = arg('film', 'demo');
  const lang = arg('lang', 'en');

  const raw = path.join(OUT, 'raw.mp4');
  const shotsPath = path.join(OUT, 'shots.json');
  for (const needed of [raw, shotsPath]) {
    if (!fs.existsSync(needed)) {
      throw new Error(`${needed} is missing. Run the Filmer on Windows first.`);
    }
  }

  const shots = JSON.parse(fs.readFileSync(shotsPath, 'utf8'));
  const scenes = SCRIPT.films[film].scenes;
  const byId = new Map(scenes.map(s => [s.id, s]));

  // ---- picture ------------------------------------------------------------
  const segments = [];
  let cues = [];
  let clock = 0;
  let index = 0;

  for (const shot of shots) {
    const scene = byId.get(shot.id);
    if (!scene) throw new Error(`out/shots.json has a scene "${shot.id}" that script.json does not`);
    const zoom = scene.zoomScale || 0;
    const rect = shot.rect;
    const total = shot.seconds;

    // The caption covers the whole scene, whatever the camera does inside it.
    cues.push({ from: clock, to: clock + total, text: scene.say[lang] });

    if (zoom > 1.001 && rect) {
      // wide (with ring) -> two short steps in -> close -> wide again.
      // Fractions, not fixed seconds, so a short line still gets the shape.
      const wideIn   = total * 0.30;
      const step     = Math.min(total * 0.06, 0.18);
      const close    = total * 0.34;
      const wideOut  = total - wideIn - step * 2 - close;
      const plan = [
        [wideIn, 1, true],
        [step, 1 + (zoom - 1) * 0.45, false],
        [step, 1 + (zoom - 1) * 0.8, false],
        [close, zoom, false],
        [Math.max(wideOut, 0.2), 1, true],
      ];
      let at = shot.start;
      for (const [dur, z, ring] of plan) {
        if (dur <= 0.04) continue;
        segments.push(segment(raw, index++, at, dur, rect, z, ring));
        at += dur;
      }
    } else {
      segments.push(segment(raw, index++, shot.start, total, rect, 1, Boolean(rect)));
    }
    clock += total;
  }

  const listFile = path.join(OUT, 'segments.txt');
  fs.writeFileSync(listFile, segments.map(f => `file '${f}'`).join('\n') + '\n');
  const picture = path.join(OUT, `${film}-${lang}-picture.mp4`);
  run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', picture]);

  // ---- voice --------------------------------------------------------------
  const silence = path.join(OUT, 'pause.wav');
  run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono',
                 '-t', String(PAUSE), silence]);
  const lines = shots.flatMap(shot => {
    const line = path.join(AUDIO, `${film}-${lang}-${shot.id}.wav`);
    if (!fs.existsSync(line)) throw new Error(`missing narration for ${shot.id}`);
    return [`file '${line}'`, `file '${silence}'`];
  });
  const trackList = path.join(OUT, `${film}-${lang}-audio.txt`);
  fs.writeFileSync(trackList, lines.join('\n') + '\n');
  const track = path.join(OUT, `${film}-${lang}.wav`);
  run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', trackList, track]);

  // ---- captions -----------------------------------------------------------
  const srt = cues.map((c, i) =>
    `${i + 1}\n${stamp(c.from)} --> ${stamp(c.to)}\n${c.text}\n`).join('\n');
  const srtPath = path.join(OUT, `${film}-${lang}.srt`);
  fs.writeFileSync(srtPath, srt);

  // ---- together -----------------------------------------------------------
  const final = path.join(OUT, `${film}-${lang}.mp4`);
  run('ffmpeg', ['-y', '-i', picture, '-i', track,
                 // Burned in, not a subtitle track: this gets sent over
                 // WhatsApp, where a separate track is simply lost.
                 '-vf', `subtitles=${srtPath}:force_style=` +
                        `'FontSize=20,PrimaryColour=&H00FFFFFF,BorderStyle=3,` +
                        `BackColour=&HB0000000,Outline=0,Shadow=0,MarginV=24'`,
                 '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
                 '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
                 '-shortest', final]);

  // The measurements travel with the film, so check-film.js can never be
  // comparing it against a different voice's timings.
  fs.copyFileSync(path.join(AUDIO, 'timings.json'),
                  path.join(OUT, `${film}-${lang}.timings.json`));

  for (const f of segments) fs.unlinkSync(f);
  const size = (fs.statSync(final).size / 1e6).toFixed(1);
  console.log(`\n${path.basename(final)} — ${size} MB, ${segments.length} segments joined`);
  console.log(`Now check it:  node check-film.js --film ${film} --lang ${lang} --file ${final}`);
}

try { main(); } catch (err) {
  console.error('\nAssembly failed:', err.message);
  process.exit(1);
}
