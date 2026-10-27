// The email scan: every email the platform writes, in both languages.
//
// Asked for on 2026-10-27 (docs/AGREED-2026-10-25.md, "Stress tests"). On the
// staging project, every kind of email is made to happen for real - by the
// same triggers and functions the live platform uses - for an English and a
// Spanish member, and then each one in the outbox is read:
//
//   - every template exists in English and Spanish, with the same {{slots}};
//   - each email matches its template, in its reader's language (Operators
//     always English), with every slot filled - no "{{", no "undefined",
//     no "null", no untranslated phrase key such as "unit.Metric tons";
//   - every web address in it belongs to the platform;
//   - nobody gets the same email twice;
//   - a new-listing email never names the member who posted it.
//
// Nothing is sent: the outbox rows are read and then deleted with the test
// accounts. Refuses the live project.

const { TAG, buildWorld, account, cleanup, http, asUser, must, guardNotLive } = require('./security-grid');

const KEYS = ['invitation', 'registration_submitted', 'registration_approved', 'registration_rejected', 'new_listing'];
const SITE = 'https://rafops71.github.io/Platform/';
const ALLOWED_URL = /^https:\/\/(rafops71\.github\.io\/Platform\/|([a-z0-9-]+\.)*myplatform\.trade(\/|$))/;
const slots = (s) => [...new Set(s.match(/\{\{\w+\}\}/g) || [])].sort();
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A template as a pattern: fixed text must appear as written, each slot is
// "anything" - so a mail matching it was written from that template.
const pattern = (t) => new RegExp(`^${t.split(/\{\{\w+\}\}/).map(escape).join('[\\s\\S]*?')}$`);

async function main() {
  guardNotLive();
  const findings = [];
  const fail = (m) => findings.push(m);
  let mails = [];
  try {
    // 1. The templates themselves.
    const rows = (await must('templates', http('/rest/v1/email_templates?select=template_key,lang,subject,body_text')));
    const tpl = {};
    for (const r of rows) tpl[`${r.template_key}/${r.lang}`] = r;
    for (const k of KEYS) {
      const en = tpl[`${k}/en`]; const es = tpl[`${k}/es`];
      if (!en || !es) { fail(`template "${k}" is missing in ${!en ? 'English' : 'Spanish'}`); continue; }
      for (const part of ['subject', 'body_text']) {
        if (!en[part].trim() || !es[part].trim()) fail(`template "${k}" has an empty ${part}`);
        if (slots(en[part]).join() !== slots(es[part]).join()) {
          fail(`template "${k}" ${part}: English fills ${slots(en[part]).join(' ') || 'nothing'}, Spanish ${slots(es[part]).join(' ') || 'nothing'}`);
        }
      }
    }
    for (const key of Object.keys(tpl)) if (!KEYS.includes(key.split('/')[0])) fail(`template "${key}" is not covered by this scan`);

    // 2. Make every kind of email happen, for both languages.
    const w = await buildWorld();
    const lang = new Map([[w.operator.email, 'en']]);
    const people = {};
    for (const l of ['en', 'es']) {
      // Registration submitted, then approved.
      people[`ok-${l}`] = await account(`mail-ok-${l}`, { status: 'pending', language: l, inviter: w.operator.profileId });
      await must(`approve ${l}`, asUser(w.operator, `/rest/v1/profiles?id=eq.${people[`ok-${l}`].profileId}`,
        { method: 'PATCH', prefer: 'return=minimal', body: { status: 'approved' } }));
      // Registration submitted, then rejected.
      people[`no-${l}`] = await account(`mail-no-${l}`, { status: 'pending', language: l, inviter: w.operator.profileId });
      await must(`reject ${l}`, asUser(w.operator, `/rest/v1/profiles?id=eq.${people[`no-${l}`].profileId}`,
        { method: 'PATCH', prefer: 'return=minimal', body: { status: 'rejected' } }));
      // An invitation, through the Operator console's own function.
      const to = `${TAG}-invite-${l}@example.invalid`;
      await must(`invite ${l}`, asUser(w.operator, '/rest/v1/rpc/queue_invitation_email',
        { method: 'POST', body: { p_to_email: to, p_link: `${SITE}register.html?token=${TAG}-${l}`, p_lang: l } }));
      lang.set(to, l);
      lang.set(people[`ok-${l}`].email, l); lang.set(people[`no-${l}`].email, l);
    }
    // New listings, a sell offer and a buy request, posted by the English
    // member: every approved member is mailed, each in their own language.
    const poster = people['ok-en'];
    const [commodity] = (await http('/rest/v1/commodities?select=name&limit=1')).json;
    for (const type of ['sell', 'buy']) {
      const ref = await must('reference', asUser(poster, '/rest/v1/rpc/next_reference', { method: 'POST', body: { p_type: type } }));
      await must(`${type} listing`, asUser(poster, '/rest/v1/listings', {
        method: 'POST', prefer: 'return=minimal',
        body: { user_id: poster.profileId, reference_number: ref, type, commodity: commodity.name, incoterm: 'CIF',
                ...(type === 'sell' ? { origin: 'Mailport' } : { destination: 'Mailport' }),
                quantity: 250, unit: 'Metric tons', price_conditions: '13850', currency: 'USD',
                poster_role: 'principal', docs_seen: 'no', docs_showable: 'no', truth_confirmed: true },
      }));
    }

    // 3. Read every email written to this run's addresses.
    mails = (await must('outbox', http(`/rest/v1/email_outbox?select=id,to_email,subject,body_text,related_listing_id&to_email=like.${TAG}*`)));
    const seen = new Set();
    const sent = new Set();
    for (const m of mails) {
      const reader = lang.get(m.to_email) || 'en';
      const key = m.related_listing_id ? 'new_listing'
        : KEYS.find((k) => [tpl[`${k}/en`], tpl[`${k}/es`]].some((t) => t && pattern(t.subject).test(m.subject)));
      const where = `${key || 'unknown'} email to ${m.to_email.replace(`${TAG}-`, '')}`;
      if (!key) { fail(`${where}: "${m.subject}" matches no template`); continue; }
      const t = tpl[`${key}/${reader}`];
      if (!(pattern(t.subject).test(m.subject) && pattern(t.body_text).test(m.body_text))) {
        fail(`${where}: not written from the ${reader === 'es' ? 'Spanish' : 'English'} template`);
      }
      seen.add(`${key}/${reader}`);
      // One email per reader per event: a listing mails each member once, and
      // every other kind is written once for its one reader.
      const once = `${m.to_email}/${key}/${m.related_listing_id || ''}`;
      if (sent.has(once)) fail(`${where}: written twice`);
      sent.add(once);
      const all = `${m.subject}\n${m.body_text}`;
      if (/\{\{|\}\}/.test(all)) fail(`${where}: a slot was left unfilled`);
      if (/\bundefined\b|\bnull\b|\bNaN\b|\[object Object\]/.test(all)) fail(`${where}: says "undefined", "null" or similar`);
      const leftKey = all.match(/\b(unit|kind|label|docs|value)\.[A-Za-z]/);
      if (leftKey) fail(`${where}: an untranslated phrase key ("${leftKey[0]}…")`);
      for (const url of all.match(/https?:\/\/[^\s<>"')]+/g) || []) {
        if (!ALLOWED_URL.test(url)) fail(`${where}: links outside the platform - ${url}`);
      }
      if (key === 'new_listing') {
        for (const v of Object.values(poster.identity)) {
          if (v && all.includes(v)) fail(`${where}: names the member who posted it ("${v}")`);
        }
        if (reader === 'es' && !all.includes('Toneladas métricas')) fail(`${where}: the unit is not in Spanish`);
      }
    }
    for (const k of KEYS) for (const l of ['en', 'es']) {
      if (!seen.has(`${k}/${l}`)) fail(`no ${l === 'es' ? 'Spanish' : 'English'} "${k}" email was written`);
    }
  } finally {
    await http(`/rest/v1/email_outbox?to_email=like.${TAG}*`, { method: 'DELETE' });
    await cleanup();
  }
  console.log(`Email scan: ${mails.length} emails written by the real triggers, ${KEYS.length} kinds, English and Spanish.`);
  if (findings.length) {
    console.log(`\nFAIL - ${findings.length}:`);
    for (const f of findings) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log('PASS - every email matched its template in its reader\'s language, fully filled, linking only to the platform, naming no poster.');
}

main().catch(async (err) => { console.error(err.message); await cleanup(); process.exit(1); });
