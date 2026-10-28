// The email sender, made to fail on purpose.
//
// Asked for on 2026-10-28 (docs/AGREED-2026-10-25.md, review Block 3). Runs
// the real scripts/send-listing-emails.js against a throwaway PostgreSQL
// (scripts/pg-harness.js) and a fake Resend on this machine that misbehaves:
//
//   - an answer lost after the provider already sent (timeout): the retry
//     carries the same Idempotency-Key, so the provider sends nothing new;
//   - a provider error (500): retried later, not lost;
//   - a refusal (422): given up at once, not retried forever;
//   - two senders started at the same moment on the same queue: every
//     email still goes out once.
//
// The fake provider behaves as Resend's documentation says Resend does: a
// repeated key within 24 hours is answered without sending again. Nothing
// here touches the live project or the real Resend.

'use strict';

const http = require('http');
const path = require('path');
const { execFile } = require('child_process');
const { start } = require('./pg-harness');

const SENDER = path.join(__dirname, 'send-listing-emails.js');

function fakeResend(plan) {
  const deliveries = new Map();   // key -> times actually "sent"
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const key = req.headers['idempotency-key'];
      const mail = JSON.parse(body);
      requests.push({ key, to: mail.to });
      // A bad address is refused every time; other trouble happens once.
      const step = mail.to.startsWith('refused') ? 'refuse' : (plan[mail.to] || []).shift() || 'ok';
      if (step === 'refuse') { res.writeHead(422); return res.end('{"message":"invalid to"}'); }
      if (step === 'error') { res.writeHead(500); return res.end('{"message":"boom"}'); }
      if (!key) { res.writeHead(400); return res.end('no key'); }
      if (!deliveries.has(key)) deliveries.set(key, mail.to);
      else deliveries.set(`${key}#again`, mail.to);   // would be a duplicate if Resend ignored keys
      if (step === 'lose-answer') return req.socket.destroy();   // sent, but the answer never arrives
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: key }));
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, deliveries, requests, port: server.address().port })));
}

function runSender(env) {
  return new Promise((resolve) => {
    execFile(process.execPath, [SENDER], { env: { ...process.env, ...env } }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code : 0, out: stdout + stderr });
    });
  });
}

async function main() {
  const findings = [];
  const fail = (m) => findings.push(m);
  const pg = await start({ quiet: true });
  const plan = {
    'lost@example.invalid': ['lose-answer'],
    'flaky@example.invalid': ['error'],
  };
  const fake = await fakeResend(plan);
  try {
    const people = ['ok1', 'ok2', 'ok3', 'lost', 'flaky', 'refused'].map((n) => `${n}@example.invalid`);
    for (const to of people) {
      await pg.client.query(
        "insert into public.email_outbox (to_email, subject, body_text) values ($1, 'Test', 'Hello')", [to]);
    }
    const { user, password, port, database } = pg.connection;
    const env = {
      SUPABASE_DB_URL: `postgres://${user}:${password}@localhost:${port}/${database}?sslmode=disable`,
      RESEND_API_KEY: 'test-key',
      LISTING_EMAIL_FROM: 'test@example.invalid',
      RESEND_API_URL: `http://127.0.0.1:${fake.port}/emails`,
    };

    // Two senders at the same moment, then two more runs, as the schedule would.
    const first = await Promise.all([runSender(env), runSender(env)]);
    for (const r of first) if (r.code !== 0) fail(`a sender crashed: ${r.out.slice(0, 300)}`);
    for (let i = 0; i < 2; i += 1) {
      const r = await runSender(env);
      if (r.code !== 0) fail(`a later sender crashed: ${r.out.slice(0, 300)}`);
    }

    const { rows } = await pg.client.query(
      'select id, to_email, sent_at, failed_at, attempts from public.email_outbox');
    const row = (n) => rows.find((x) => x.to_email === `${n}@example.invalid`);

    if (fake.requests.some((q) => !q.key)) fail('a send went out without an Idempotency-Key');
    for (const r of rows) {
      const keys = new Set(fake.requests.filter((q) => q.to === r.to_email).map((q) => q.key));
      if (keys.size > 1) fail(`${r.to_email}: retried under a different key (${[...keys].join(', ')})`);
      if (keys.size === 1 && !String([...keys][0]).includes(r.id)) fail(`${r.to_email}: its key is not its outbox row`);
    }
    // Delivered once each: everyone but the refused address, nobody twice.
    const delivered = [...fake.deliveries.entries()].filter(([k]) => !k.endsWith('#again')).map(([, to]) => to).sort();
    const want = people.filter((p) => !p.startsWith('refused')).sort();
    if (delivered.join() !== want.join()) fail(`delivered to ${delivered.join(' ')}; expected ${want.join(' ')}`);
    const resent = [...fake.deliveries.keys()].filter((k) => k.endsWith('#again'));
    console.log(`  ${fake.requests.length} requests reached the provider; ${resent.length} repeated a key and were not sent again.`);

    if (!row('lost').sent_at) fail('the email whose answer was lost was never marked sent');
    if (!row('flaky').sent_at) fail('the email that met a provider error was not sent on a later run');
    if (row('refused').sent_at || !row('refused').failed_at) fail('the refused email was not given up');
    if (row('refused').attempts !== 1) fail(`the refused email was tried ${row('refused').attempts} times, expected 1`);
    for (const n of ['ok1', 'ok2', 'ok3']) if (!row(n).sent_at) fail(`${n}: not marked sent`);
  } finally {
    fake.server.close();
    await pg.stop();
  }
  if (findings.length) {
    console.log(`FAIL - ${findings.length}:`);
    for (const f of findings) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log('PASS - lost answers, provider errors, refusals and two senders at once: every email went out once, or was given up.');
}

main().catch((err) => { console.error(err); process.exit(1); });
