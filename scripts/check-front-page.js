#!/usr/bin/env node
'use strict';
// Checks the front page's trailer before it is published.
//
// The front page (www/) is deployed on its own to the Cloudflare project
// platform-www, which serves only the www/ folder. So the trailer file and its
// poster must sit inside www/. Cloudflare Pages refuses any single file over
// 25 MiB (26,214,400 bytes), so the file is checked against that limit here.
//
// Also checked: the video has the controls and attributes the owner asked for,
// and it does not autoplay.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'www');
const LIMIT = 25 * 1024 * 1024;
const problems = [];

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const videos = [...html.matchAll(/<video\b[^>]*>[\s\S]*?<\/video>/g)].map((m) => m[0]);
if (videos.length !== 1) {
  problems.push(`www/index.html must have exactly one <video> (found ${videos.length}).`);
}
const v = videos[0] || '';
const open = (v.match(/<video\b[^>]*>/) || [''])[0];

for (const attr of ['controls', 'playsinline', 'preload="metadata"', 'poster="']) {
  if (!open.includes(attr)) problems.push(`the <video> is missing ${attr}.`);
}
if (/\bautoplay\b/.test(open)) problems.push('the <video> must not autoplay.');

// The trailer must sit right under the MyPlatform title, at the top of the page.
const title = html.indexOf('<p class="title">');
const at = html.indexOf(v);
const headline = html.indexOf('<h1');
if (title === -1 || at === -1 || !(title < at && at < headline)) {
  problems.push('the trailer must sit under the MyPlatform title, above the headline.');
}

// Both languages: English (the default in the markup) and Spanish, switched by
// apply(lang) in the page script. Each film and poster must be inside www/.
const srcAttr = (open.match(/\ssrc="([^"]+)"/) || [])[1];
if (srcAttr !== 'films/trailer-en.mp4') problems.push(`the <video> must default to films/trailer-en.mp4 (found ${srcAttr}).`);
if (!/'films\/trailer-' \+ lang \+ '\.mp4'/.test(html)) problems.push('the page does not switch the trailer by language.');
const files = [
  'films/trailer-en.mp4', 'films/trailer-en-poster.jpg',
  'films/trailer-es.mp4', 'films/trailer-es-poster.jpg',
];
for (const rel of files) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    problems.push(`${rel} is not inside www/, so the platform-www project will not serve it.`);
    continue;
  }
  const size = fs.statSync(file).size;
  if (size > LIMIT) problems.push(`${rel} is ${size} bytes, over the 25 MiB Cloudflare Pages limit (${LIMIT}).`);
}

if (problems.length) {
  console.error('Front page check: FAIL\n' + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log('Front page check: OK. The trailer is under the title, has controls, does not autoplay, switches EN/ES, and both films and posters are inside www/ under the 25 MiB limit.');
