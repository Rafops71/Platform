'use strict';
// Member film captures: node capture-member.js OUTDIR BASEURL en|es
const { Rec } = require('./capture-lib');
(async () => {
  const [out, base, lang] = process.argv.slice(2);
  const es = lang === 'es';
  const A = '00000000-0000-4000-8000-000000000001';
  const r = new Rec(out, base);
  await r.init({ lang, unsigned: A });
  const p = r.page;
  const lab = (sel) => p.locator('label', { has: p.locator(sel) }).first();
  const choose = async (sel, val, label) => { await r.moveToEl(p.locator(sel), 0.5, 0.5, 0.4); r.ev.push({ t: +r.T.toFixed(3), k: 'click' }); await (label ? p.locator(sel).selectOption({ label }) : p.locator(sel).selectOption(val)); r.T += 0.15; await r.shot(); r.wait(0.1); };
  const tabBtn = (name) => p.locator(`nav.tabs button[data-screen="${name}"]`);
  const go = async (name) => { await r.click(tabBtn(name), { after: 0.1 }); await p.evaluate(() => window.scrollTo(0, 0)); r.T += 0.05; await r.shot(); };

  // ---- block 1: sign in, Terms once, New Listing, fill, submit
  await r.goto('index.html'); r.mark('signin'); { const b = await p.locator('#login-form').boundingBox(); r.camEl(b, 70, 1.2); } r.wait(0.8);
  await r.type(p.locator('#email'), 'member.a@example.com');
  await r.type(p.locator('#password'), 'correct-horse', { per: 0.05 });
  r.mark('press_signin');
  await p.locator('#login-btn').scrollIntoViewIfNeeded();
  const nav = p.waitForURL('**/app.html');
  await r.moveToEl(p.locator('#login-btn')); r.ev.push({ t: +r.T.toFixed(3), k: 'click' });
  await p.locator('#login-btn').click(); await nav; await p.waitForTimeout(900); r.T += 0.3; await r.shot();
  r.cam(null, 0.5);
  r.mark('terms'); r.wait(0.6);
  // the Terms gate: capacity, address, typed name (filled quickly, 3 s on screen)
  const gateUp = await p.locator('#terms-gate').waitFor({ state: 'visible', timeout: 6000 }).then(() => true, () => false);
  if (gateUp) {
    await p.evaluate(() => window.scrollTo(0, 0)); r.T += 0.1; await r.shot();
    await r.click(p.locator('label.checkbox-row', { has: p.locator('#gate-cap-individual') }), { dur: 0.5 });
    for (const [id, v] of [['gate-address_line1', '1 Example Quay'], ['gate-city', 'Exampleton'], ['gate-postal_code', 'EX1 1AA']]) { if (await p.locator('#' + id).count()) await p.locator('#' + id).fill(v); }
    const sel = p.locator('#gate-country'); if (await sel.count()) await sel.selectOption({ label: es ? 'Reino Unido' : 'United Kingdom' }).catch(() => {});
    const nm = p.locator('#gate-form input[type=text]').last(); await nm.fill('Alex Morgan').catch(() => {});
    r.T += 0.2; await r.shot();
    await r.hl(p.locator('#gate-btn'), 1.2);
    await r.click(p.locator('#gate-btn'), { dur: 0.7 });
    await p.waitForTimeout(800); await r.shot();
  } else console.log('no terms gate visible');
  await p.evaluate(() => window.scrollTo(0, 0)); r.T += 0.05; await r.shot();
  r.mark('dash'); r.wait(0.7);
  r.mark('newlisting'); await go('new-listing'); r.wait(0.5);
  await p.waitForTimeout(300); await r.shot();
  r.mark('f_type'); await r.click(lab('input[name="type"][value="sell"]'), { dur: 0.6 });
  r.mark('f_commodity'); await p.locator('#commodity-select').scrollIntoViewIfNeeded();
  await r.moveToEl(p.locator('#commodity-select')); r.ev.push({ t: +r.T.toFixed(3), k: 'click' });
  const copper = await p.locator('#commodity-select option').evaluateAll((os) => (os.find((o) => /copper cathodes/i.test(o.textContent)) || {}).value);
  await p.locator('#commodity-select').selectOption(copper); r.T += 0.2; await r.shot(); r.wait(0.3);
  r.mark('f_qty'); await r.type(p.locator('#quantity'), '500', { per: 0.12 });
  r.mark('f_origin'); { const v = await p.locator('#location option').evaluateAll((os) => (os.find((o) => /south africa|sud[aá]frica/i.test(o.textContent)) || {}).value); await choose('#location', v); }
  r.mark('f_incoterm'); await r.moveToEl(p.locator('#incoterm')); r.ev.push({ t: +r.T.toFixed(3), k: 'click' });
  await p.locator('#incoterm').selectOption({ label: /CIF/ }).catch(async () => { await p.locator('#incoterm').selectOption('CIF'); }); r.T += 0.2; await r.shot(); r.wait(0.3);
  r.mark('f_role'); await r.click(lab('#role-principal'), { dur: 0.7 }); await r.click(lab('#kind-producer'), { dur: 0.4 });
  r.mark('f_docs');
  const ticks = p.locator('#doc-checklist label');
  const nT = await ticks.count();
  for (let i = 0; i < Math.min(nT, 2); i++) await r.click(ticks.nth(i), { dur: 0.35, after: 0.05 });
  await choose('#docs_seen', 'yes'); await choose('#docs_showable', 'on_request');
  await r.click(lab('#truth-confirm'), { dur: 0.4 });
  r.mark('f_submit'); await r.click(p.locator('#listing-submit-btn'), { dur: 0.8 });
  await p.waitForTimeout(600); r.T += 0.3; await r.shot();
  await p.evaluate(() => window.scrollTo(0, 0)); r.T += 0.05; await r.shot(); r.mark('live'); r.wait(1.0);

  // ---- block 2: My Listings, Browse, Contact
  r.mark('mylist'); await go('my-listings'); r.wait(0.8);
  r.mark('browse'); await go('browse'); r.wait(0.9);
  const card = p.locator('#browse-list > *').first();
  await card.scrollIntoViewIfNeeded(); const cb = await card.boundingBox();
  r.mark('anon'); r.camEl(await card.boundingBox(), 60, 1.0); await r.moveToEl(card, 0.35, 0.3, 0.8); await r.hl(card, 2.5, 4); r.wait(1.2); r.cam(null, 0.8);
  r.mark('contact'); const cbtn = p.locator('#browse-list [data-contact], #browse-list button:has-text("Contact"), #browse-list button:has-text("Contactar")').first();
  await r.click(cbtn, { dur: 0.8 });
  await p.waitForTimeout(400); await r.shot();
  r.mark('write'); r.camEl(await p.locator('#contact-modal > *').first().boundingBox(), 120, 0.9);
  await r.type(p.locator('#contact-body'), es ? 'Nos interesa este lote. Confirme que sigue disponible.' : 'We are interested in this parcel. Please confirm that it is still available.', { per: 0.04 });
  r.mark('send'); await r.click(p.locator('#contact-send-btn'), { dur: 0.7 });
  await p.waitForTimeout(500); r.T += 0.4; await r.shot();

  // ---- block 3: mailbox
  r.cam(null, 0.5); r.mark('relay_end');
  r.mark('mailbox'); await go('mailbox'); r.wait(1.0);
  const first = p.locator('#mailbox-list > *').first(); if (await first.count()) { r.camEl(await first.boundingBox(), 80, 1.0); await r.hl(first, 2.5, 6); await r.moveToEl(first, 0.4, 0.4, 0.8); }
  r.wait(2.0); r.cam(null, 0.6);

  // ---- block 4: notifications, profile language, help
  r.mark('notif'); await go('notifications'); r.wait(1.4);
  r.mark('profile'); await go('profile'); r.wait(0.8);
  const toggle = p.locator('#lang-toggle');
  await toggle.scrollIntoViewIfNeeded();
  r.mark('lang');
  const first2 = es ? 'EN' : 'ES', back = es ? 'ES' : 'EN';
  await r.click(toggle.getByText(first2, { exact: true }).first(), { dur: 0.8 }); r.wait(1.3);
  await r.click(toggle.getByText(back, { exact: true }).first(), { dur: 0.7 }); r.wait(0.8);
  r.mark('help'); await go('help'); r.wait(1.6);
  r.mark('end');
  await r.close();
  console.log('states', r.n, 'T', r.T.toFixed(1), 'errors', r.errors.length);
})().catch((e) => { console.error(e); process.exit(1); });
