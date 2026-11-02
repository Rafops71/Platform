#!/usr/bin/env node
/**
 * Email the two English walkthroughs to the owner, as attachments, through Resend.
 *
 * Owner's instruction (2026-11-02, relayed): the 2 ENGLISH walkthroughs only (no Spanish, no trailer), to ONE address that is written
 * here and nowhere else (no input, no argument, no environment variable can change it), through Resend with the
 * repository's existing RESEND_API_KEY and sender (LISTING_EMAIL_FROM, as scripts/send-listing-emails.js).
 *
 * Resend's limit, read from resend.com/docs/api-reference/emails/send-email on 2026-11-02: "max 40MB per email,
 * after Base64 encoding of the attachments". So the files are packed into one email and its
 * base64 size is checked BEFORE anything is sent; over 38 MB the script fails and sends nothing.
 *
 *   node scripts/send-films.js DIR      DIR holds member-en.mp4 and operator-en.mp4 (already shrunk)
 */
const fs = require('fs');
const path = require('path');

const TO = 'rafael.e@intercommodities.net'; // corrected 2026-11-02: the first address was a typo
const LIMIT = 38 * 1024 * 1024; // under Resend's 40 MB, leaving room for the message itself
// The trailer is NOT sent (owner, 2026-11-02: it is being fixed). One email with the two walkthroughs; the size
// check below fails the job, sending nothing, if the pair is over the limit.
const EMAILS = [
  { subject: 'MyPlatform films: member + operator walkthroughs', files: ['member-en.mp4', 'operator-en.mp4'] },
];

async function main() {
  const dir = process.argv[2];
  const key = process.env.RESEND_API_KEY;
  const from = process.env.LISTING_EMAIL_FROM;
  if (!dir) throw new Error('usage: node scripts/send-films.js DIR');
  if (!key || !from) throw new Error('RESEND_API_KEY and LISTING_EMAIL_FROM must be set');

  // Build and size-check every email first; send nothing unless all of them fit.
  const built = EMAILS.map((e) => {
    const attachments = e.files.map((f) => {
      const p = path.join(dir, f);
      if (!fs.existsSync(p)) throw new Error(`missing ${p}`);
      return { filename: f, content: fs.readFileSync(p).toString('base64') };
    });
    const bytes = attachments.reduce((t, a) => t + a.content.length, 0);
    console.log(`${e.subject}: ${e.files.join(' + ')}, ${(bytes / 1048576).toFixed(1)} MB after base64`);
    if (bytes > LIMIT) throw new Error(`"${e.subject}" is ${(bytes / 1048576).toFixed(1)} MB after base64, over ${LIMIT / 1048576} MB: nothing was sent`);
    return { from, to: [TO], subject: e.subject, text: `Attached: ${e.files.join(', ')}.\n\nEnglish versions only. Sent by the repository workflow "Send the films".`, attachments };
  });

  for (const body of built) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Resend answered ${res.status} for "${body.subject}": ${text.slice(0, 400)}`);
    console.log(`SENT "${body.subject}" -> ${text}`);
  }
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
