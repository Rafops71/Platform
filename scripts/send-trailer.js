#!/usr/bin/env node
/**
 * Email the new English trailer to the owner as an attachment, through Resend (same key and sender as
 * scripts/send-films.js). ONE address, written here; no input can change it. The size after base64 is checked
 * against Resend's "max 40MB per email" first.
 *
 *   node scripts/send-trailer.js FILE.mp4
 */
const fs = require('fs');

const TO = 'rafael.e@intercommodities.net';
const SUBJECT = 'MyPlatform trailer (v8)';
const LIMIT = 38 * 1024 * 1024;

async function main() {
  const file = process.argv[2];
  const key = process.env.RESEND_API_KEY;
  const from = process.env.LISTING_EMAIL_FROM;
  if (!file || !fs.existsSync(file)) throw new Error('usage: node scripts/send-trailer.js FILE.mp4');
  if (!key || !from) throw new Error('RESEND_API_KEY and LISTING_EMAIL_FROM must be set');
  const content = fs.readFileSync(file).toString('base64');
  console.log(`${SUBJECT}: trailer-en.mp4, ${(content.length / 1048576).toFixed(1)} MB after base64`);
  if (content.length > LIMIT) throw new Error('over the size limit: nothing was sent');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [TO], subject: SUBJECT, text: 'The new English trailer is attached (trailer-en.mp4).', attachments: [{ filename: 'trailer-en.mp4', content }] }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Resend answered ${res.status}: ${text.slice(0, 400)}`);
  console.log(`SENT "${SUBJECT}" -> ${text}`);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
