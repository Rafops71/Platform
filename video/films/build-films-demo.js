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


// extra made-up rows for the Operator film only: two registrations waiting for approval, and a message that carries
// contact details (so the forward box can highlight them). Fake data; nothing here is a real person or company.
{
  const sp = path.join(OUT, 'js', 'demo', 'seed.js');
  let seed = fs.readFileSync(sp, 'utf8');
  const hook = '  const commodityNames = [';
  if (!seed.includes(hook)) throw new Error('seed.js changed: the commodity hook was not found');
  const extra = `
  profiles.push(
    { id: uid(21), user_id: uid(121), first_name: 'Jordan', last_name: 'Ellis', company: 'Meridian Metals Ltd', email: 'jordan.ellis@example.com',
      phone: '+44 7700 900121', country: 'United Kingdom', role: 'participant', status: 'pending', language: 'en', job_title: 'Director',
      address_line1: '4 Sample Row', address_line2: null, city: 'Exampleton', postal_code: 'EX2 2BB', signing_capacity: 'company',
      welcome_seen_at: null, created_at: ago(0, 5), updated_at: ago(0, 5) },
    { id: uid(22), user_id: uid(122), first_name: 'Priya', last_name: 'Nair', company: 'Coastal Agri Trading', email: 'priya.nair@example.com',
      phone: '+44 7700 900122', country: 'United Kingdom', role: 'participant', status: 'pending', language: 'en', job_title: null,
      address_line1: '9 Demo Wharf', address_line2: null, city: 'Demoville', postal_code: 'DM3 3CC', signing_capacity: 'individual',
      welcome_seen_at: null, created_at: ago(0, 9), updated_at: ago(0, 9) });
  messages.push({ id: uid(3004), sender_id: IDS.memberB, listing_id: listings[0].id, in_reply_to: null, subject: null,
    body: 'We would like to take the copper cathodes. Can you confirm the loading window? You can call me on +27 82 555 0147 or write to sam.okafor@northvale.example to arrange it.',
    status: 'pending_review', created_at: ago(0, 1), reviewed_at: null });
`;
  seed = seed.replace(hook, extra + hook);
  fs.writeFileSync(sp, seed);
}

// no ribbon and no demo sign-in panel (it holds the trailer): the films show the normal sign-in form
for (const f of fs.readdirSync(OUT).filter((n) => n.endsWith('.html'))) {
  const fp = path.join(OUT, f);
  fs.writeFileSync(fp, fs.readFileSync(fp, 'utf8').replace(/<script src="js\/demo\/demo-ui\.js"><\/script>\r?\n?/g, ''));
}

// the Terms gate: the demo says every signed-in member has accepted the Terms. For the film one member has not
// (sessionStorage 'films.unsigned' = that member's profile id), and signing clears it.
{
  const a = "has_accepted_current_terms() { return !!me(); },";
  const b = "accept_terms() { return null; },";
  let m = fs.readFileSync(mockPath, 'utf8');
  if (!m.includes(a) || !m.includes(b)) throw new Error('mock-supabase.js changed: the Terms lines were not found');
  m = m.replace(a, "has_accepted_current_terms() { try { if (me() && sessionStorage.getItem('films.unsigned') === me().id) return false; } catch (e) {} return !!me(); },")
       .replace(b, "accept_terms() { try { sessionStorage.removeItem('films.unsigned'); sessionStorage.setItem('films.signed', '1'); } catch (e) {} return null; },");
  fs.writeFileSync(mockPath, m);
}

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
