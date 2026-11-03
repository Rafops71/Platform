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
//      `jericho` client name in memory.
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
const OUT = path.join(ROOT, 'dist-demo');

const SUPABASE_CDN_TAG = /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^"]*"><\/script>\r?\n?/g;
const REAL_CONFIG_TAG = /<script src="js\/supabase-config\.js"><\/script>/g;
const DEMO_CLIENT_TAGS = '<script src="js/demo/seed.js"></script>\n<script src="js/demo/mock-supabase.js"></script>';
const DEMO_UI_TAG = '<script src="js/demo/demo-ui.js"></script>';

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

function rewritePage(html, file) {
  let out = html.replace(SUPABASE_CDN_TAG, '');
  if (REAL_CONFIG_TAG.test(out)) {
    REAL_CONFIG_TAG.lastIndex = 0;
    out = out.replace(REAL_CONFIG_TAG, DEMO_CLIENT_TAGS);
  } else {
    // A page that never talked to the database (terms.html, help.html) still
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
  copyDir(path.join(ROOT, 'films'), path.join(OUT, 'films'));
  copyDir(path.join(ROOT, 'js'), path.join(OUT, 'js'),
    (src) => path.basename(src) === 'supabase-config.js');

  const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).sort();
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
    if (!/\.(html|js|css|json|txt|md|svg)$/i.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const bad of forbidden) {
      if (text.includes(bad)) problems.push(`${path.relative(OUT, file)} contains "${bad}"`);
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
console.log(`Demo built in dist-demo/: ${count} files, ${pages.length} pages. No Supabase address or key found in it.`);
