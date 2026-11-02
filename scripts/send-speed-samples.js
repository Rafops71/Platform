#!/usr/bin/env node
/**
 * Email the three English voice-speed samples (A/B/C) to the owner as attachments, through Resend.
 *
 * Owner's instruction (2026-11-02, relayed): one email, to ONE address written here (no input can change it),
 * with the repository's RESEND_API_KEY and sender LISTING_EMAIL_FROM (as scripts/send-films.js). The three MP3s
 * are tiny; the size is still checked against Resend's "max 40MB per email, after Base64 encoding".
 *
 *   node scripts/send-speed-samples.js DIR     DIR holds A-140wpm.mp3, B-130wpm.mp3, C-120wpm.mp3
 */
const fs = require('fs');
const path = require('path');

const TO = 'rafael.e@intercommodities.net';
const LIMIT = 38 * 1024 * 1024;
const FILES = ['A-140wpm.mp3', 'B-130wpm.mp3', 'C-120wpm.mp3'];
const SUBJECT = 'MyPlatform voice speed samples (A/B/C)';
const TEXT = 'Same Google voice, same line, three speeds: A about 140, B about 130, C about 120 words per minute. Reply with your pick in the chat.';

async function main() {
  const dir = process.argv[2];
  const key = process.env.RESEND_API_KEY;
  const from = process.env.LISTING_EMAIL_FROM;
  if (!dir) throw new Error('usage: node scripts/send-speed-samples.js DIR');
  if (!key || !from) throw new Error('RESEND_API_KEY and LISTING_EMAIL_FROM must be set');
  const attachments = FILES.map((f) => {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) throw new Error(`missing ${p}`);
    return { filename: f, content: fs.readFileSync(p).toString('base64') };
  });
  const bytes = attachments.reduce((t, a) => t + a.content.length, 0);
  console.log(`${SUBJECT}: ${FILES.join(' + ')}, ${(bytes / 1048576).toFixed(2)} MB after base64`);
  if (bytes > LIMIT) throw new Error('over the size limit: nothing was sent');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [TO], subject: SUBJECT, text: TEXT, attachments }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Resend answered ${res.status}: ${text.slice(0, 400)}`);
  console.log(`SENT "${SUBJECT}" -> ${text}`);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
