'use strict';
// Frame-by-state recorder for the walkthrough films. Drives the DEMO build (fake data, no live database) in Chromium,
// takes a screenshot whenever the page changes, and writes a timeline of what the camera, cursor and highlights do.
// The pictures are composed later (Remotion) and retimed to the voice by the named marks.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const VW = 1440, VH = 810, DSF = 1.5;

class Rec {
  constructor(out, base) { this.out = out; this.base = base; this.T = 0; this.n = 0; this.ev = []; this.cx = VW / 2; this.cy = VH / 2; this.cur = false; fs.mkdirSync(path.join(out, 'states'), { recursive: true }); }
  async init(opts) {
    this.browser = await chromium.launch();
    this.ctx = await this.browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DSF, locale: opts.lang === 'es' ? 'es-ES' : 'en-GB' });
    await this.ctx.addInitScript(({ lang, unsigned }) => {
      try { localStorage.setItem('jericho.language', lang); } catch (e) {}
      try { if (unsigned && !sessionStorage.getItem('films.signed')) sessionStorage.setItem('films.unsigned', unsigned); } catch (e) {}
      // the real mouse pointer is not in screenshots; and no caret blink, no smooth scroll surprises
      const st = document.createElement('style'); st.textContent = '*{caret-color:#27618f!important} html{scroll-behavior:auto!important} #demo-ribbon{display:none!important}';
      document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st));
    }, { lang: opts.lang, unsigned: opts.unsigned || '' });
    this.page = await this.ctx.newPage();
    this.page.on('pageerror', (e) => console.log('pageerror', e.message));
    this.errors = [];
    this.page.on('console', (m) => { if (m.type() === 'error') this.errors.push(m.text()); });
  }
  async close() { fs.writeFileSync(path.join(this.out, 'timeline.json'), JSON.stringify({ vw: VW, vh: VH, dsf: DSF, total: this.T, events: this.ev, errors: this.errors }, null, 1)); await this.browser.close(); }
  async shot() {
    const f = `s${String(this.n++).padStart(4, '0')}.jpg`;
    await this.page.screenshot({ path: path.join(this.out, 'states', f), type: 'jpeg', quality: 88 });
    this.ev.push({ t: +this.T.toFixed(3), k: 'state', f });
  }
  async goto(p) { await this.page.goto(this.base + '/' + p); await this.page.waitForTimeout(700); await this.shot(); }
  wait(dt) { this.T += dt; }
  mark(name) { this.ev.push({ t: +this.T.toFixed(3), k: 'mark', name }); }
  async settle(ms = 350) { await this.page.waitForTimeout(ms); }
  cursorShow(on = true) { this.ev.push({ t: +this.T.toFixed(3), k: 'cursorShow', on }); this.cur = on; }
  async centre(loc, ox = 0.5, oy = 0.5) {
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    return { x: b.x + b.width * ox, y: b.y + b.height * oy, b };
  }
  moveTo(x, y, dur = 0.7) {
    this.ev.push({ t: +this.T.toFixed(3), k: 'cursor', x0: this.cx, y0: this.cy, x1: x, y1: y, dur });
    this.cx = x; this.cy = y; this.T += dur; this.cur = true;
  }
  async moveToEl(loc, ox = 0.5, oy = 0.5, dur = 0.7) { const c = await this.centre(loc, ox, oy); this.moveTo(c.x, c.y, dur); return c; }
  async click(loc, { dur = 0.7, after = 0.25 } = {}) {
    await this.moveToEl(loc, 0.5, 0.5, dur);
    this.ev.push({ t: +this.T.toFixed(3), k: 'click' });
    await loc.click(); await this.settle(); this.T += 0.12; await this.shot(); this.T += after;
  }
  async type(loc, text, { per = 0.06, dur = 0.6 } = {}) {
    await this.moveToEl(loc, 0.3, 0.5, dur);
    this.ev.push({ t: +this.T.toFixed(3), k: 'click' });
    await loc.click(); this.T += 0.1;
    for (const ch of text) { await this.page.keyboard.type(ch); this.T += per; await this.shot(); }
    this.T += 0.15;
  }
  async fill(loc, text) { await loc.fill(text); this.T += 0.05; await this.shot(); }
  // highlight one or more elements (soft glow) from now for dur seconds
  async hl(locs, dur, pad = 6) {
    const rects = [];
    for (const l of [].concat(locs)) { const b = await l.boundingBox(); if (b) rects.push({ x: b.x - pad, y: b.y - pad, w: b.width + 2 * pad, h: b.height + 2 * pad }); }
    this.ev.push({ t: +this.T.toFixed(3), k: 'hl', dur, rects });
  }
  // camera: zoom to a rectangle of the page (viewport coordinates) over dur seconds; null = whole page
  cam(rect, dur = 0.9) { this.ev.push({ t: +this.T.toFixed(3), k: 'cam', dur, rect: rect || { x: 0, y: 0, w: VW, h: VH } }); this.T += 0; }
  camEl(box, pad = 40, dur = 0.9) {
    let { x, y, width: w, height: h } = box; x -= pad; y -= pad; w += 2 * pad; h += 2 * pad;
    const ar = VW / VH; if (w / h < ar) { const nw = h * ar; x -= (nw - w) / 2; w = nw; } else { const nh = w / ar; y -= (nh - h) / 2; h = nh; }
    x = Math.max(0, Math.min(VW - w, x)); y = Math.max(0, Math.min(VH - h, y));
    this.cam({ x, y, w: Math.min(w, VW), h: Math.min(h, VH) }, dur);
  }
}
module.exports = { Rec, VW, VH, DSF };
