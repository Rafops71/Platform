// Branch notify-owner only: a plain-text confirmation to the owner (his ask, 2026-11-04: "email me a confirmation
// that the films are done", not the films). Address fixed here; Resend with the existing secrets.
const TO = 'rafael.e@intercommodities.net';
(async () => {
  const key = process.env.RESEND_API_KEY, from = process.env.LISTING_EMAIL_FROM;
  if (!key || !from) throw new Error('RESEND_API_KEY and LISTING_EMAIL_FROM must be set');
  const r = await fetch('https://api.resend.com/emails', { method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [TO], subject: 'MyPlatform: the explainer films are done',
      text: 'The three explainer films (Member English, Member Spanish, Operator English) are finished, checked and ready.\n\nOpen the Claude chat on your laptop to see them.' }) });
  console.log(r.status, await r.text()); if (!r.ok) process.exit(1);
})();
