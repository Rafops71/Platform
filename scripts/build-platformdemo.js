#!/usr/bin/env node
'use strict';
// Builds the white-label member demo "platformdemo" into dist-platformdemo/.
//
// It starts from the member demo (scripts/build-demo.js -> dist-demo/), copies it,
// and then changes ONLY the copy:
//   - films/ is removed, and every <video> element and the card or section around it;
//   - the word "MyPlatform" is removed from every visible text and every comment,
//     with the sentence around it rewritten so it still reads cleanly;
//   - the scan at the end refuses the build if "myplatform", ".mp4" or "<video"
//     is still anywhere in the copy (case-insensitive).
// The member demo itself is not changed. Run with `npm run build:platformdemo`.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'dist-demo');
const OUT = path.join(ROOT, 'dist-platformdemo');

// Exact changes, in English and Spanish, so each sentence still reads cleanly.
// Applied to the text files of the copy, in this order.
const PAIRS = [
  // Page titles and headings
  [/<title>MyPlatform — /g, '<title>'],
  [/<h1>MyPlatform<\/h1>\s*/g, ''],
  // Help
  [/How does MyPlatform work\?/g, 'How does it work?'],
  [/¿Cómo funciona MyPlatform\?/g, '¿Cómo funciona?'],
  [/What is MyPlatform’s role\?/g, 'What is its role?'],
  [/¿Cuál es el papel de MyPlatform\?/g, '¿Cuál es su papel?'],
  [/MyPlatform is a facilitator\./g, 'It is a facilitator.'],
  [/MyPlatform es un facilitador\./g, 'Es un facilitador.'],
  [/, or email info@myplatform\.trade\./g, '.'],
  [/, o envíe un correo a info@myplatform\.trade\./g, '.'],
  // Register and welcome
  [/Before you register — how MyPlatform works/g, 'Before you register'],
  [/Antes de registrarse — cómo funciona MyPlatform/g, 'Antes de registrarse'],
  [/Welcome to MyPlatform/g, 'Welcome'],
  [/Le damos la bienvenida a MyPlatform/g, 'Le damos la bienvenida'],
  [/MyPlatform is a private, invitation-only place/g, 'It is a private, invitation-only place'],
  [/MyPlatform es un espacio privado, solo por invitación/g, 'Es un espacio privado, solo por invitación'],
  // Offers
  [/MyPlatform accepts offers/g, 'It accepts offers'],
  [/MyPlatform acepta ofertas/g, 'Acepta ofertas'],
  // Terms: the notice address is removed, so the sentence names only the registered office
  [/to rafael@myplatform\.trade and to the registered office above/g, 'to the registered office above'],
  [/por escrito a rafael@myplatform\.trade y al domicilio social indicado/g, 'por escrito al domicilio social indicado'],
  // The privacy contact address is removed from the copy, with the sentence.
  [/should be sent to rafael@myplatform\.trade\./g, 'should be sent in writing to the registered office above.'],
  [/deben dirigirse a rafael@myplatform\.trade\./g, 'deben dirigirse por escrito al domicilio social indicado.'],
  // Names of things and comments
  [/Jericho Platform — /g, ''],
  [/MyPlatform — /g, ''],
  [/\/\/ front page at www\.myplatform\.trade links to the app as \/\?lang=es\./g, '// The front page links to the app with ?lang=es.'],
  [/www\.myplatform\.trade/g, 'the front page'],
  [/myplatform-demo-session/g, 'platformdemo-session'],
  [/'MyPlatform trailer'/g, "'trailer'"],
  [/aria-label="MyPlatform member walkthrough"/g, 'aria-label="member walkthrough"'],
  [/how MyPlatform works/g, 'how it works'],
  [/cómo funciona MyPlatform/g, 'cómo funciona'],
  [/'brand': 'MyPlatform',/g, "'brand': '',"],
];
// Words left over after the sentence rules: removed, with the spacing tidied.
const LEFTOVER = [/\s*MyPlatform’s\s*/g, /\s*MyPlatform\s*/g];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name), d = path.join(to, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

// Removes a <video> with the card or section that holds it, in an HTML page.
function stripVideoCards(html) {
  // The walkthrough card under the sign-in box (index.html).
  html = html.replace(/\s*<!-- The member walkthrough[\s\S]*?<\/video>\s*<\/div>/g, '');
  // The registration walkthrough card (register.html).
  html = html.replace(/\s*<!-- The walkthrough, shown ONLY[\s\S]*?<div id="intro-video-card"[\s\S]*?<\/video>\s*<\/div>/g, '');
  html = html.replace(/\s*<div id="intro-video-card"[\s\S]*?<\/video>\s*<\/div>/g, '');
  return html;
}

// The member demo's sign-in trailer (js/demo/demo-ui.js) and the two film
// functions in js/auth.js are removed from the copy.
function stripFilmScripts(file, js) {
  if (file.endsWith('demo-ui.js')) {
    js = js.replace(/  if \(!OPERATOR_DEMO\) \{\n    \/\/ The trailer[\s\S]*?(?=  const buttons = )/, '');
  }
  if (file.endsWith('auth.js')) {
    js = js.replace(/  if \(document\.getElementById\('walkthrough-video'\)\) initWalkthrough\(\);\n/g, '');
    js = js.replace(/\s*showIntroVideo\(\);/g, '');
    js = js.replace(/\/\*\* The walkthrough film, in whichever language[\s\S]*?\n}\n/, '');
    js = js.replace(/\/\*\* The member walkthrough under the sign-in box[\s\S]*?\n}\n\nfunction initWalkthrough\(\) \{[\s\S]*?\n}\n/, '');
    js = js.replace(/function setIntroVideoSource\(\) \{[\s\S]*?\n}\n/, '');
  }
  return js;
}

function build() {
  // 1. The member demo, unchanged, as the starting point.
  execSync('node scripts/build-demo.js', { cwd: ROOT, stdio: 'inherit' });

  // 2. Copy it. Everything below changes the copy only.
  fs.rmSync(OUT, { recursive: true, force: true });
  copyDir(SRC, OUT);
  fs.rmSync(path.join(OUT, 'films'), { recursive: true, force: true });

  for (const file of walk(OUT)) {
    const ext = path.extname(file).toLowerCase();
    if (!['.html', '.js', '.css', '.json', '.txt', '.md'].includes(ext)) continue;
    let text = fs.readFileSync(file, 'utf8');
    const before = text;
    if (ext === '.html') text = stripVideoCards(text);
    if (ext === '.js') text = stripFilmScripts(file, text);
    for (const [from, to] of PAIRS) text = text.replace(from, to);
    for (const re of LEFTOVER) text = text.replace(re, ' ');
    text = text.replace(/ {2,}(?=[^ \n])/g, (m, off) => m); // keep indentation
    if (text !== before) fs.writeFileSync(file, text);
  }
  return OUT;
}

// The scan. It refuses the build if any forbidden text is left in the copy.
function scan(dir) {
  const bad = [];
  for (const file of walk(dir)) {
    const rel = path.relative(dir, file);
    const name = rel.toLowerCase();
    if (name.endsWith('.mp4')) bad.push(`${rel}: a film file`);
    const text = fs.readFileSync(file).toString('latin1');
    if (/myplatform/i.test(text)) bad.push(`${rel}: contains "myplatform"`);
    if (/\.mp4/i.test(text)) bad.push(`${rel}: contains ".mp4"`);
    if (/<video/i.test(text)) bad.push(`${rel}: contains "<video"`);
  }
  return bad;
}

const out = build();
const problems = scan(out);
if (problems.length) {
  console.error('PLATFORMDEMO BUILD REFUSED - these must be removed first:');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log(`Platformdemo built in ${path.basename(out)}/: ${walk(out).length} files. The scan passes: no "myplatform", no ".mp4", no "<video".`);
