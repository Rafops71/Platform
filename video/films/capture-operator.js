'use strict';
// Operator film captures: node capture-operator.js OUTDIR BASEURL     (English only; fake data, films demo build)
const { Rec } = require('./capture-lib');
(async () => {
  const [out, base] = process.argv.slice(2);
  const r = new Rec(out, base);
  await r.init({ lang: 'en' });
  const p = r.page;
  const tabBtn = (n) => p.locator(`nav.tabs button[data-screen="${n}"]`);
  const go = async (n) => { await r.click(tabBtn(n), { after: 0.1 }); await p.evaluate(() => window.scrollTo(0, 0)); r.T += 0.05; await r.shot(); };
  const choose = async (sel, label) => { await r.moveToEl(p.locator(sel), 0.5, 0.5, 0.45); r.ev.push({ t: +r.T.toFixed(3), k: 'click' }); await p.locator(sel).selectOption(label); r.T += 0.15; await r.shot(); r.wait(0.2); };

  // ---- block 1: sign in, Overview, Approvals, Invitations, Users
  await r.goto('index.html'); r.mark('signin'); { const b = await p.locator('#login-form').boundingBox(); r.camEl(b, 70, 1.2); } r.wait(0.2);
  await r.type(p.locator('#email'), 'operator@example.com', { per: 0.03, dur: 0.4 });
  await r.type(p.locator('#password'), 'correct-horse', { per: 0.025, dur: 0.3 });
  r.mark('press_signin');
  const nav = p.waitForURL('**/operator.html');
  await r.moveToEl(p.locator('#login-btn')); r.ev.push({ t: +r.T.toFixed(3), k: 'click' });
  await p.locator('#login-btn').click(); await nav; await p.waitForTimeout(1200); r.T += 0.3; r.cam(null, 0.4); await r.shot();
  r.mark('overview'); await r.hl(p.locator('#overview-stats'), 3.0, 8); r.camEl(await p.locator('#overview-stats').boundingBox(), 90, 1.0); r.wait(2.4); r.cam(null, 0.7);
  r.mark('approvals'); await go('approvals'); r.wait(0.8);
  const approve = p.locator('#approvals-list [data-approve]').first();
  r.mark('approve'); await r.hl(approve, 1.4, 8); await r.click(approve, { dur: 0.9 }); await p.waitForTimeout(500); r.T += 0.3; await r.shot(); r.wait(0.8);
  r.mark('invitations'); await go('invitations'); r.wait(0.5);
  r.mark('invite_make'); await r.type(p.locator('#invite-email'), 'new.member@example.org', { per: 0.05 });
  await r.click(p.locator('#create-invite-btn'), { dur: 0.6 }); await p.waitForTimeout(500); r.T += 0.2; await r.shot();
  const copy = p.locator('#invite-result button, #invite-result .btn').first();
  if (await copy.count()) { await r.hl(copy, 1.5, 8); r.wait(1.2); } else r.wait(1.2);
  r.mark('users'); await go('users'); r.wait(0.6);
  const susp = p.locator('#users-list [data-suspend]').first();
  await p.evaluate(() => window.scrollTo(0, 220)); r.T += 0.1; await r.shot();
  await r.moveToEl(susp, 0.5, 0.5, 0.9); await r.hl(susp, 1.8, 8); r.wait(1.6);   // hover only, never pressed
  await p.evaluate(() => window.scrollTo(0, 0)); r.T += 0.05; await r.shot();

  // ---- block 2: All Listings, Commodities, Mailbox, forward box
  r.mark('listings'); await go('listings'); r.wait(0.8);
  r.mark('filter'); { const v = await p.locator('#listing-filter-commodity option').evaluateAll((os) => (os.find((o) => /copper/i.test(o.textContent)) || {}).value); if (v) { await choose('#listing-filter-commodity', v); await r.click(p.locator('#listing-search-btn'), { dur: 0.5 }); } }
  r.wait(0.9);
  r.mark('commodities'); await go('commodities'); r.wait(0.5);
  { const it = p.locator('#commodities-list > *').nth(4); if (await it.count()) { await r.moveToEl(it, 0.3, 0.5, 0.8); await r.hl(it, 1.8, 6); } } r.wait(1.2);
  r.mark('mailbox'); await go('mailbox'); r.wait(0.6);
  const row = p.locator('#operator-mailbox-list .list-row', { has: p.locator('[data-forward]') }).filter({ hasText: 'loading window' }).first();
  await row.scrollIntoViewIfNeeded(); r.camEl(await row.boundingBox(), 70, 1.0); await r.hl(row, 2.2, 6); r.wait(1.2);
  r.mark('arrives'); r.wait(0.2);
  const fwd = row.locator('[data-forward]'), rep = row.locator('[data-reply]'), ign = row.locator('[data-ignore]');
  r.mark('btns'); await r.hl([fwd, rep, ign], 3.4, 8); await r.moveToEl(fwd, 0.5, 0.5, 0.7); r.wait(0.5); await r.moveToEl(rep, 0.5, 0.5, 0.6); r.wait(0.5); await r.moveToEl(ign, 0.5, 0.5, 0.6); r.wait(0.4);
  r.mark('forward'); await r.click(fwd, { dur: 0.8 }); await p.waitForTimeout(500); r.T += 0.2; r.cam(null, 0.6); await r.shot(); r.wait(0.4);
  r.mark('flags'); await r.hl(p.locator('#forward-flags'), 2.0, 8); r.camEl(await p.locator('#forward-modal .card, #forward-modal > *').first().boundingBox(), 60, 0.9); r.wait(1.4);
  r.mark('delete');
  { const ta = p.locator('#forward-edit'); await r.moveToEl(ta, 0.5, 0.5, 0.6); r.ev.push({ t: +r.T.toFixed(3), k: 'click' }); await ta.click(); await p.keyboard.press('Control+End'); r.T += 0.2;
    const body = await ta.inputValue(); const cut = body.search(/You can call me/); const n = cut < 0 ? 0 : body.length - cut;
    for (let i = 0; i < n; i++) { await p.keyboard.press('Backspace'); if (i % 4 === 0 || i === n - 1) { r.T += 0.045; await r.shot(); } }
    r.T += 0.5; await r.shot(); }
  r.mark('confirm'); await r.click(p.locator('#forward-confirm-btn'), { dur: 0.8 }); await p.waitForTimeout(700); r.T += 0.4; r.cam(null, 0.6); await r.shot(); r.wait(0.8);

  // ---- block 3: Matches, Deals
  await p.evaluate(() => window.scrollTo(0, 0));
  r.mark('matches'); await go('matches'); r.wait(0.6);
  { const m = p.locator('#matches-list > *').first(); if (await m.count()) { await r.hl(m, 3.0, 8); await r.moveToEl(m, 0.4, 0.4, 0.9); } } r.wait(2.2);
  r.mark('deals'); await go('deals'); r.wait(0.8);
  { const d = p.locator('#deals-list > *').first(); if (await d.count()) { await r.hl(d, 2.6, 8); await r.moveToEl(d, 0.3, 0.3, 0.9); } } r.wait(2.0);

  // ---- block 4: Scorecard, Analytics, Activity Log, Help
  r.mark('scorecard'); await go('scorecard'); r.wait(0.6);
  { const rows = p.locator('#scorecard-tbody tr'); const n = await rows.count(); for (let i = 0; i < Math.min(n, 3); i++) { await r.hl(rows.nth(i), 0.9, 4); r.wait(0.8); } }
  r.mark('analytics'); await go('analytics'); r.wait(2.2);
  r.mark('activity'); await go('activity'); r.wait(0.6);
  { const it = p.locator('#activity-list > *').nth(1); if (await it.count()) { await r.moveToEl(it, 0.3, 0.5, 0.8); await r.hl(it, 1.8, 4); } } r.wait(1.6);
  r.mark('help'); await go('help'); r.wait(1.6);
  r.mark('end');
  await r.close();
  console.log('states', r.n, 'T', r.T.toFixed(1), 'errors', r.errors.length);
})().catch((e) => { console.error(e); process.exit(1); });
