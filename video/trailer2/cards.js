#!/usr/bin/env node
/**
 * Draws the trailer's pictures with the APP'S OWN colours and fonts (css/styles.css: background #ffffff, text
 * #15202b, muted #52677a, accent #27618f, tint #f0f6fb, border #e2ebf3; Spectral for headings, Source Sans 3 for
 * body, as app.html loads them). Light, calm, no decoration.
 *
 *   node video/trailer2/cards.js SPEC.json OUTDIR
 * SPEC.json: [{ "id": "i01", "kind": "text|app|diagram", "sentence": "...", "image": "path.png" (app), "step": 1|2 (diagram) }]
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const C = { bg: '#ffffff', text: '#15202b', muted: '#52677a', accent: '#27618f', tint: '#f0f6fb', border: '#e2ebf3' };
const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Spectral:wght@500;600&family=Source+Sans+3:wght@400;600&display=swap">';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function base(inner, bg = C.bg) {
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>
  html,body{margin:0;width:1920px;height:1080px;background:${bg};color:${C.text};font-family:"Source Sans 3",system-ui,sans-serif;overflow:hidden}
  .mark{position:absolute;left:0;right:0;bottom:44px;text-align:center;font-family:Spectral,Georgia,serif;font-weight:500;font-size:28px;color:${C.muted};letter-spacing:.5px}
  .sentence{font-family:Spectral,Georgia,serif;font-weight:600;line-height:1.28;text-align:center;color:${C.text}}
  .bar{width:72px;height:4px;background:${C.accent};margin:0 auto 44px}
  </style></head><body>${inner}<div class="mark">MyPlatform</div></body></html>`;
}

function textCard(s) {
  const size = s.length > 120 ? 54 : s.length > 70 ? 62 : 76;
  return base(`<div style="position:absolute;left:260px;right:260px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center">
    <div class="bar"></div><div class="sentence" style="font-size:${size}px">${esc(s)}</div></div>`);
}

function appCard(s, imgPath) {
  const data = fs.readFileSync(imgPath).toString('base64');
  const size = s.length > 90 ? 40 : 46;
  return base(`<div style="position:absolute;left:0;right:0;top:56px;display:flex;justify-content:center">
      <img src="data:image/png;base64,${data}" style="max-width:1500px;max-height:690px;border-radius:14px;border:1px solid ${C.border};box-shadow:0 18px 50px rgba(21,32,43,.12);background:#fff">
    </div>
    <div class="sentence" style="position:absolute;left:230px;right:230px;top:810px;font-size:${size}px">${esc(s)}</div>`, C.tint);
}

function diagramCard(s, step) {
  const box = (x, label, accent) => `<div style="position:absolute;left:${x}px;top:250px;width:360px;height:170px;border-radius:16px;
      border:2px solid ${accent ? C.accent : C.border};background:${accent ? '#fff' : C.tint};display:flex;align-items:center;justify-content:center;
      font-family:Spectral,Georgia,serif;font-weight:600;font-size:46px;color:${accent ? C.accent : C.text}">${label}</div>`;
  const line = (x1, x2, y, color, dash) => `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${color}" stroke-width="4" ${dash ? 'stroke-dasharray="14 12"' : ''} stroke-linecap="round"/>`;
  const svg = step === 1
    ? `${line(480, 780, 335, C.accent)}${line(1140, 1440, 335, C.accent)}`
    : `<path d="M300 430 C 300 640, 1620 640, 1620 430" fill="none" stroke="${C.accent}" stroke-width="5" stroke-linecap="round"/>
       ${line(480, 780, 335, C.border)}${line(1140, 1440, 335, C.border)}
       <text x="960" y="655" text-anchor="middle" font-family="Spectral,Georgia,serif" font-weight="600" font-size="42" fill="${C.accent}">Introduction</text>`;
  return base(`<svg width="1920" height="1080" style="position:absolute;left:0;top:0">${svg}</svg>
    ${box(120, 'Member', false)}${box(780, 'Operator', true)}${box(1440, 'Member', false)}
    <div class="sentence" style="position:absolute;left:230px;right:230px;top:790px;font-size:46px">${esc(s)}</div>`);
}

(async () => {
  const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const out = path.resolve(process.argv[3]);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  for (const it of spec) {
    const html = it.kind === 'app' ? appCard(it.sentence, it.image) : it.kind === 'diagram' ? diagramCard(it.sentence, it.step) : textCard(it.sentence);
    await page.setContent(html, { waitUntil: 'networkidle' }).catch(() => {});
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.screenshot({ path: path.join(out, `${it.id}.png`) });
    console.log(`card ${it.id} (${it.kind})`);
  }
  await browser.close();
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
