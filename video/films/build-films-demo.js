#!/usr/bin/env node
'use strict';
// FILMS ONLY. Builds dist-demo-films/: the demo build (fake data, no Supabase) PLUS the Operator console, so the
// Operator film can be captured from fake data. The public demo has no Operator console (owner's rule, 3 Nov);
// this folder is never published and never leaves the runner. It refuses to finish if any Supabase address,
// project key or the live config appears in it.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const DEMO = path.join(ROOT, 'dist-demo');
const OUT = path.join(ROOT, 'dist-demo-films');

execSync('node scripts/build-demo.js', { cwd: ROOT, stdio: 'inherit' });
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(DEMO, OUT, { recursive: true });

// the Operator page, rewritten exactly like the demo rewrites every page
let html = fs.readFileSync(path.join(ROOT, 'operator.html'), 'utf8');
html = html.replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^"]*"><\/script>\r?\n?/g, '');
html = html.replace(/<script src="js\/supabase-config\.js"><\/script>/g,
  '<script src="js/demo/seed.js"></script>\n<script src="js/demo/mock-supabase.js"></script>');
const at = html.lastIndexOf('</body>');
html = html.slice(0, at) + '<script src="js/demo/demo-ui.js"></script>\n' + html.slice(at);
fs.writeFileSync(path.join(OUT, 'operator.html'), html);
fs.copyFileSync(path.join(ROOT, 'js', 'operator.js'), path.join(OUT, 'js', 'operator.js'));

// let the seeded Operator account sign in (the public demo refuses it on purpose)
const mockPath = path.join(OUT, 'js', 'demo', 'mock-supabase.js');
let mock = fs.readFileSync(mockPath, 'utf8');
const needle = "if (!p || p.role === 'operator') return";
if (!mock.includes(needle)) throw new Error('mock-supabase.js changed: the Operator sign-in line was not found');
mock = mock.replace(needle, 'if (!p) return');
fs.writeFileSync(mockPath, mock);

// the safety check
const forbidden = ['supabase.co', 'sb_publishable_', 'sb_secret_'];
const real = fs.readFileSync(path.join(ROOT, 'js', 'supabase-config.js'), 'utf8');
for (const m of [(real.match(/https:\/\/[a-z0-9-]+\.supabase\.co/) || [])[0], (real.match(/sb_publishable_[A-Za-z0-9_-]+/) || [])[0]]) if (m) forbidden.push(m);
const bad = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(html|js|json|css|svg|txt)$/.test(e.name)) {
      const s = fs.readFileSync(p, 'utf8');
      for (const f of forbidden) if (s.includes(f)) bad.push(`${path.relative(OUT, p)} contains ${f}`);
    }
  }
})(OUT);
if (fs.existsSync(path.join(OUT, 'js', 'supabase-config.js'))) bad.push('js/supabase-config.js is present');
if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
console.log('dist-demo-films ready: members + Operator console, fake data, no Supabase.');
