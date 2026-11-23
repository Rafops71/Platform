#!/usr/bin/env node
'use strict';
// Builds the DEMO site into dist-demo/: the same screens, with fake data and
// no connection to Supabase. Run with `npm run build:demo`.
//
// WHAT IT DOES
//
//   1. Copies css/, js/, films/ and the HTML pages, exactly as the live site
//      ships them (scripts/assemble-site.sh), except:
//   2. js/supabase-config.js is NOT copied. In its place each page loads
//      js/demo/seed.js and js/demo/mock-supabase.js, which define the same
//      `myplatform` client name in memory.
//   3. The Supabase script from the CDN is removed from every page, so the
//      demo never asks the CDN for it.
//   4. js/demo/demo-ui.js is added to every page: the "example data" ribbon,
//      and on the sign-in page the three demo sign-in buttons.
//
// WHY THE REAL CONFIG IS READ, NOT COPIED
//
// The real project address and publishable key live only in
// js/supabase-config.js. This script reads them from there and then refuses
// to finish if either one, or any "supabase.co" address, appears anywhere in
// dist-demo/. A demo that quietly talks to the live database is the one
// mistake this build must not make, so it is checked, not hoped for.
//
// The real site is untouched: nothing here changes a file in the repository.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// THE TWO DEMOS. The member demo (dist-demo/) is the default and is unchanged.
// DEMO_KIND=operator builds the Operator demo (dist-demo-operator/): the
// Operator console on the same fake data, with one sign-in button and no
// member screens. It is published to its own project and is never linked from
// the member demo. Item 42 (owner's decision).
const KIND = process.env.DEMO_KIND === 'operator' ? 'operator' : 'member';
const OUT = path.join(ROOT, KIND === 'operator' ? 'dist-demo-operator' : 'dist-demo');
// The Operator demo carries only these pages. Nothing member-only is copied.
const OPERATOR_PAGES = ['index.html', 'operator.html', 'terms.html'];

const SUPABASE_CDN_TAG = /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^"]*"><\/script>\r?\n?/g;
const REAL_CONFIG_TAG = /<script src="js\/supabase-config\.js"><\/script>/g;
const DEMO_CLIENT_TAGS = '<script src="js/demo/seed.js"></script>\n<script src="js/demo/mock-supabase.js"></script>';
const DEMO_UI_TAG = '<script src="js/demo/demo-ui.js"></script>';

// The demo is for members only. The Operator console is not part of it at all:
// not its page, not its script, and no way into it from the demo's sign-in.
// (Owner's correction, 3 Nov: no Operator entry in the demo.)
const EXCLUDED_PAGES = KIND === 'operator' ? [] : ['operator.html'];
const EXCLUDED_FILES = KIND === 'operator' ? ['js/app.js'] : ['js/operator.js'];

// ------------------------------------------------ the values that must not ship
function forbiddenValues() {
  const real = fs.readFileSync(path.join(ROOT, 'js', 'supabase-config.js'), 'utf8');
  const url = (real.match(/https:\/\/[a-z0-9-]+\.supabase\.co/) || [])[0];
  const key = (real.match(/sb_publishable_[A-Za-z0-9_-]+/) || [])[0];
  if (!url || !key) throw new Error('could not read the Supabase URL and key from js/supabase-config.js');
  const ref = url.replace('https://', '').split('.')[0];
  return [url, key, ref, 'supabase.co', 'sb_publishable_', 'sb_secret_'];
}

// ------------------------------------------------------------------- build --
function copyDir(from, to, skip) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (skip && skip(src)) continue;
    if (entry.isDirectory()) copyDir(src, dst, skip);
    else fs.copyFileSync(src, dst);
  }
}

/** The MEMBER demo's first page (owner, 23 Nov 2026, docs/AGREED-2026-11-23-demo-one-member.md): the name, ONE entry button
 *  and the language switch. Taken out of the copy of index.html, never out of the real page: the tagline, the whole
 *  sign-in card (email, password, forgotten-password panel), the walkthrough film card and the invitation-only line.
 *  A slot is left where the button goes (js/demo/demo-ui.js fills it). Refuses to build if the page no longer has the
 *  pieces it expects, rather than quietly shipping a page that still has a password box or a film. */
function memberFirstPage(html) {
  let out = html;
  const cut = (start, end, label, insert = '') => {
    const a = out.indexOf(start);
    const b = a === -1 ? -1 : out.indexOf(end, a);
    if (a === -1 || b === -1) throw new Error(`the member demo's first page: could not find the ${label} in index.html`);
    out = out.slice(0, a) + insert + out.slice(b + end.length);
  };
  cut('<p data-i18n="login.tagline">', '</p>', 'tagline');
  // From the sign-in card to the end of the walkthrough film's card: both go, and the slot takes their place.
  cut('<div class="card">\n    <form id="login-form">', '</video>\n  </div>', 'sign-in card and walkthrough film', '<div id="demo-enter-slot"></div>');
  cut('<p class="text-center text-muted" style="font-size:var(--text-base);" data-i18n="login.noAccount">', '</p>', 'invitation-only line');
  return out;
}

function rewritePage(html, file) {
  let out = html.replace(SUPABASE_CDN_TAG, '');
  if (KIND === 'member' && file === 'index.html') out = memberFirstPage(out);
  if (KIND === 'operator') {
    // Before any other script, so the demo's seed and sign-in panel can read it.
    out = out.replace('<head>', '<head>\n<script>window.DEMO_KIND = "operator";</script>');
  }
  if (REAL_CONFIG_TAG.test(out)) {
    REAL_CONFIG_TAG.lastIndex = 0;
    out = out.replace(REAL_CONFIG_TAG, DEMO_CLIENT_TAGS);
  } else {
    // A page that never talked to the database (terms.html) still
    // gets the ribbon, but not the client.
  }
  const at = out.lastIndexOf('</body>');
  out = at === -1 ? out + '\n' + DEMO_UI_TAG + '\n' : out.slice(0, at) + DEMO_UI_TAG + '\n' + out.slice(at);
  return out;
}

function build() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  copyDir(path.join(ROOT, 'css'), path.join(OUT, 'css'));
  // No film in the member demo (owner, 23 Nov 2026): no page of it points at one, so the 91 MB are not shipped. The film files stay
  // in the repository. The Operator demo is untouched.
  if (KIND !== 'member') copyDir(path.join(ROOT, 'films'), path.join(OUT, 'films'));
  copyDir(path.join(ROOT, 'js'), path.join(OUT, 'js'),
    (src) => path.basename(src) === 'supabase-config.js'
      || EXCLUDED_FILES.some((f) => src === path.join(ROOT, f)));

  const pages = fs.readdirSync(ROOT)
    .filter((f) => f.endsWith('.html') && !EXCLUDED_PAGES.includes(f))
    .filter((f) => KIND !== 'operator' || OPERATOR_PAGES.includes(f))
    .sort();
  for (const page of pages) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    fs.writeFileSync(path.join(OUT, page), rewritePage(html, page));
  }

  let revision = process.env.GITHUB_SHA || 'unknown';
  try { revision = process.env.GITHUB_SHA || execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch (e) { /* not a checkout */ }
  fs.writeFileSync(path.join(OUT, 'REVISION'), revision + ' (demo build)\n');
  return pages;
}

// ------------------------------------------------------------------ check --
function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

function check(pages) {
  const problems = [];
  const forbidden = forbiddenValues();
  const files = listFiles(OUT);

  for (const file of files) {
    // Every file, whatever its extension: a key in a video or a map file would still ship.
    const text = fs.readFileSync(file).toString('latin1');
    for (const bad of forbidden) {
      if (text.includes(bad)) problems.push(`${path.relative(OUT, file)} contains "${bad}"`);
    }
  }
  for (const f of [...EXCLUDED_PAGES, ...EXCLUDED_FILES]) {
    if (fs.existsSync(path.join(OUT, f))) problems.push(`${f} was copied into ${path.basename(OUT)} (not allowed in this demo)`);
  }
  if (KIND === 'member') {
    for (const page of pages) {
      const html = fs.readFileSync(path.join(OUT, page), 'utf8');
      if (/js\/operator\.js/.test(html)) problems.push(`${page} loads the Operator console script`);
    }
    // The member demo's first page: the name, one button, no password, no film.
    const first = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
    if (/type="password"|id="login-form"|<video|walkthrough|login\.tagline|login\.noAccount/.test(first)) problems.push('index.html (member demo) still has a password box, a film, the tagline or the invitation line');
    if (!/id="demo-enter-slot"/.test(first)) problems.push('index.html (member demo) has no slot for the entry button');
    if (fs.existsSync(path.join(OUT, 'films'))) problems.push('films/ was copied into the member demo (no film in it)');
  } else {
    // The Operator demo has no member pages, and no member film on its pages.
    for (const page of ['app.html', 'register.html', 'reset.html']) {
      if (fs.existsSync(path.join(OUT, page))) problems.push(`${page} was copied into the Operator demo`);
    }
    for (const page of pages) {
      if (!OPERATOR_PAGES.includes(page)) problems.push(`${page} is not allowed in the Operator demo`);
      if (!/window\.DEMO_KIND = "operator"/.test(fs.readFileSync(path.join(OUT, page), 'utf8'))) {
        problems.push(`${page} does not declare the Operator demo`);
      }
    }
  }
  if (fs.existsSync(path.join(OUT, 'js', 'supabase-config.js'))) {
    problems.push('js/supabase-config.js was copied into dist-demo (it holds the real project address)');
  }

  for (const page of pages) {
    const html = fs.readFileSync(path.join(OUT, page), 'utf8');
    if (/cdn\.jsdelivr\.net\/npm\/@supabase/.test(html)) problems.push(`${page} still loads the Supabase library`);
    if (/js\/supabase-config\.js/.test(html)) problems.push(`${page} still loads the real client configuration`);
    if (/js\/demo\/demo-ui\.js/.test(html) === false) problems.push(`${page} has no demo ribbon`);
    const usesClient = /js\/demo\/mock-supabase\.js/.test(html);
    const originallyUsed = /js\/supabase-config\.js/.test(fs.readFileSync(path.join(ROOT, page), 'utf8'));
    if (originallyUsed && !usesClient) problems.push(`${page} talks to the database but has no demo client`);
  }

  // Every local file a page points at must exist in the demo, as in assemble-site.sh.
  const refs = new Set();
  for (const page of pages) {
    const html = fs.readFileSync(path.join(OUT, page), 'utf8');
    for (const m of html.matchAll(/(?:src|href|poster)="([^"#?]+)/g)) {
      if (/^(https?:|mailto:|tel:|\/\/|data:)/.test(m[1])) continue;
      refs.add(m[1].replace(/^\.\//, ''));
    }
  }
  for (const ref of refs) {
    if (!fs.existsSync(path.join(OUT, ref))) problems.push(`a page points at ${ref}, which is not in the demo`);
  }

  return problems;
}

const pages = build();
const problems = check(pages);
if (problems.length) {
  console.error('DEMO BUILD REFUSED - these must be fixed before anything is published:');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
const count = listFiles(OUT).length;
console.log(`Demo built in ${path.basename(OUT)}/: ${count} files, ${pages.length} pages. No Supabase address or key found in it.`);
