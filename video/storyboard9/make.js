// Storyboard v9 - one still (1920x1080) per act, plus the table. No video, no voice. Node + Playwright.
//   node video/storyboard9/make.js CAPTURE_DIR OUT_DIR
// CAPTURE_DIR holds browse-full.png and listing-0.png (real app, 2x, from the trailer capture job).
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const [cap, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const INK = '#15202b', BLUE = '#27618f', SLATE = '#52677a', SKY = '#f0f6fb', LINE = '#c9d7e4';
const b64 = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(cap, f)).toString('base64');

const css = `
@import url('https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Source+Sans+3:wght@300;400;600&display=swap');
*{box-sizing:border-box;margin:0}
html,body{width:1920px;height:1080px;overflow:hidden;background:#fff;font-family:'Source Sans 3',sans-serif;color:${INK}}
.stage{position:relative;width:1920px;height:1080px;background:radial-gradient(ellipse at 50% 45%,#ffffff 0%,${SKY} 100%)}
svg{position:absolute;left:0;top:0}
.k{position:absolute;font-family:Spectral,serif;font-weight:300;color:${INK};letter-spacing:.01em}
.k.big{font-size:104px;line-height:1.05}.k.mid{font-size:64px;line-height:1.1}.k.small{font-size:34px;font-family:'Source Sans 3';font-weight:400;letter-spacing:.22em;text-transform:uppercase;color:${SLATE}}
em{font-style:italic;color:${BLUE}}
.shot{position:absolute;background:#fff;border-radius:6px;box-shadow:0 40px 90px rgba(21,32,43,.18),0 2px 6px rgba(21,32,43,.08)}
`;
const S = (inner, extra = '') => `<svg width="1920" height="1080" viewBox="0 0 1920 1080" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ${extra}>${inner}</svg>`;

function globe() {
  const cx = 1060, cy = 500, r = 360; let g = `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${INK}"/>`;
  for (const k of [0.25, 0.5, 0.78]) g += `<ellipse cx="${cx}" cy="${cy}" rx="${r * k}" ry="${r}" stroke="${LINE}"/>`;
  for (const k of [-0.65, -0.33, 0, 0.33, 0.65]) { const y = cy + r * k, w = Math.sqrt(r * r - (r * k) ** 2); g += `<path d="M${cx - w} ${y} Q${cx} ${y + 26 * (k >= 0 ? 1 : -1) + 14} ${cx + w} ${y}" stroke="${LINE}"/>`; }
  const n = { a: [820, 600], b: [1230, 380], c: [1000, 330], d: [1290, 640] };
  const arc = (p, q, h, c, w = 1.5) => `<path d="M${p[0]} ${p[1]} Q${(p[0] + q[0]) / 2} ${Math.min(p[1], q[1]) - h} ${q[0]} ${q[1]}" stroke="${c}" stroke-width="${w}"/>`;
  g += arc(n.a, n.b, 170, BLUE, 2.2) + arc(n.a, n.c, 90, SLATE) + arc(n.a, n.d, 120, SLATE);
  for (const p of Object.values(n)) g += `<circle cx="${p[0]}" cy="${p[1]}" r="6" fill="#fff" stroke="${BLUE}" stroke-width="2"/>`;
  // the route that leaves the globe to the right: it is the horizon line of the next act (match move)
  g += `<path d="M${n.b[0]} ${n.b[1]} Q1500 250 1920 560" stroke="${BLUE}" stroke-width="2.2"/>`;
  return S(g);
}
function port() {
  let g = `<path d="M0 700 H1920" stroke="${LINE}"/><path d="M0 760 H1920" stroke="${LINE}" stroke-dasharray="2 14"/>`;
  // ship: single hull line with stacked container outlines
  g += `<path d="M600 700 H1480 Q1440 790 1330 790 H760 Q650 790 600 700 Z" stroke="${INK}"/><path d="M1300 700 V560 H1400 V700 M1320 590 H1380" stroke="${INK}"/>`;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 7 - r; c++) g += `<rect x="${660 + c * 86 + r * 43}" y="${642 - r * 60}" width="82" height="58" stroke="${SLATE}" stroke-width="1"/>`;
  // gantry crane
  g += `<path d="M360 700 V300 H1000 M360 300 L250 360 M470 700 V300 M1000 300 V380" stroke="${INK}"/><path d="M360 700 L470 600 M360 600 L470 500 M360 500 L470 400 M360 400 L470 300" stroke="${LINE}"/><path d="M740 300 V430" stroke="${BLUE}" stroke-width="2"/><rect x="722" y="430" width="36" height="26" stroke="${BLUE}" stroke-width="2"/>`;
  // the route line arriving from the left at the horizon and leaving to the right (match move in / out)
  g += `<path d="M0 560 Q200 520 360 540" stroke="${BLUE}" stroke-width="2.2"/>`;
  return S(g);
}
function operator(joined) {
  const cx = 960, cy = 470; let g = '';
  g += `<circle cx="${cx}" cy="${cy}" r="120" stroke="${joined ? LINE : BLUE}" stroke-width="2.2" ${joined ? 'stroke-dasharray="3 12"' : ''}/><circle cx="${cx}" cy="${cy}" r="170" stroke="${LINE}" ${joined ? 'stroke-dasharray="3 12"' : ''}/>`;
  const L = [330, 470], R = [1590, 470];
  g += `<circle cx="${L[0]}" cy="${L[1]}" r="46" stroke="${INK}"/><circle cx="${R[0]}" cy="${R[1]}" r="46" stroke="${INK}"/>`;
  if (!joined) g += `<path d="M376 470 H840" stroke="${BLUE}" stroke-width="2.2"/><path d="M1544 470 H1080" stroke="${BLUE}" stroke-width="2.2"/><circle cx="${cx}" cy="${cy}" r="8" fill="${BLUE}" stroke="none"/>`;
  else g += `<path d="M376 470 Q960 330 1544 470" stroke="${BLUE}" stroke-width="2.6"/><path d="M376 470 Q960 610 1544 470" stroke="${SLATE}"/>`;
  return S(g);
}
function cards() {
  let g = ''; const xs = [270, 740, 1210];
  xs.forEach((x, i) => {
    g += `<rect x="${x}" y="300" width="440" height="420" rx="14" stroke="${INK}"/>`;
    const c = x + 220;
    if (i === 0) g += `<circle cx="${c}" cy="480" r="80" stroke="${BLUE}" stroke-width="2"/><circle cx="${c}" cy="480" r="30" stroke="${SLATE}"/>`;
    if (i === 1) g += `<path d="M${c - 70} 400 H${c + 30} L${c + 70} 440 V560 H${c - 70} Z" stroke="${BLUE}" stroke-width="2"/><path d="M${c - 40} 480 H${c + 40} M${c - 40} 515 H${c + 40}" stroke="${SLATE}"/>`;
    if (i === 2) g += `<path d="M${c - 100} 440 H${c + 100} M${c + 70} 410 L${c + 100} 440 L${c + 70} 470 M${c + 100} 520 H${c - 100} M${c - 70} 490 L${c - 100} 520 L${c - 70} 550" stroke="${BLUE}" stroke-width="2"/>`;
  });
  return S(g);
}
const kw = (cls, x, y, w, html, align = 'left') => `<div class="k ${cls}" style="left:${x}px;top:${y}px;width:${w}px;text-align:${align}">${html}</div>`;

const acts = [
  { n: 1, sec: 9, spoken: 'A private marketplace for physical commodities. By invitation only.', keys: 'Physical commodities. / By invitation only.',
    moves: 'Slow glide in on the globe; the routes draw themselves one by one; the bright route keeps drawing past the globe to the right edge.',
    next: 'The bright route line leaves the frame on the right and comes back in from the left as the line of the quay in act 2.',
    html: globe() + kw('mid', 130, 330, 560, 'Physical<br>commodities.') + kw('small', 134, 600, 560, 'By invitation only') },
  { n: 2, sec: 12, spoken: 'In commodity trading, it is often hard to know who is on the other side. Showing your position too early can weaken your commercial standing.', keys: 'The other side. / Too early.',
    moves: 'Ship slides in along the hairline; the crane lowers one container; the cargo stays outlined, nothing coloured.',
    next: 'The route line leaves the crane and shrinks to a single hairline that becomes the top edge of the real app screen in act 3.',
    html: port() + kw('big', 700, 840, 1100, 'The <em>other</em> side.', 'right') + kw('small', 700, 975, 1100, 'Too early', 'right') },
  { n: 3, sec: 13, spoken: 'Members post buying and selling opportunities with the key details: commodity, quantity, origin and Incoterm.', keys: 'Commodity · Quantity · Origin · Incoterm',
    moves: 'Real Browse screen, full-frame, 2x capture; slow camera glide down the first two rows; the four key details are underlined one after another.',
    next: 'The underline under "Origin" extends to a line that runs off the right edge and becomes the member-to-Operator line in act 5 (via act 4).',
    html: `<div style="position:absolute;left:0;top:0;width:1920px;height:800px;overflow:hidden"><img src="${b64('browse-full.png')}" style="width:1920px;height:1200px;display:block"></div>` +
      `<div style="position:absolute;left:0;top:800px;width:1920px;height:1px;background:${LINE}"></div>` + kw('mid', 110, 850, 1700, 'Commodity · Quantity · Origin · <em>Incoterm</em>', 'center') },
  { n: 4, sec: 12, spoken: "Each member states their role and declares the documentation available. Other members see the opportunity, not the member's identity.", keys: 'The opportunity. / Not the member.',
    moves: 'The real listing row (2x capture) rises to centre and enlarges; the poster line ("Poster: Principal (Trader)") is lit, nothing else about the poster exists to see.',
    next: 'The row\'s left edge draws a single vertical line down to the left ring of act 5 (the member).',
    html: kw('big', 120, 150, 1680, 'The opportunity.', 'center') + `<div class="shot" style="left:60px;top:410px;width:1800px;height:196px;overflow:hidden"><img src="${b64('listing-0.png')}" style="width:1800px;display:block"></div>` + kw('big', 120, 760, 1680, '<em>Not</em> the member.', 'center') },
  { n: 5, sec: 12, spoken: 'All communication passes through the Operator.', keys: 'The Operator.',
    moves: 'Two hairlines travel from the member rings into the central ring; a small dot moves along each and meets in the middle.',
    next: 'The two lines pull together into one arc that bends up and over: the arc is the handshake line of act 6.',
    html: operator(false) + kw('small', 130, 540, 400, 'Member', 'center') + kw('small', 1390, 540, 400, 'Member', 'center') + kw('big', 160, 720, 1600, 'Through the <em>Operator.</em>', 'center') },
  { n: 6, sec: 9, spoken: 'Introduction follows only once both sides agree on the essential terms and wish to proceed.', keys: 'Both agree. Then, introduction.',
    moves: 'The middle ring fades to a dotted outline; the two member lines join in one arc between the member rings.',
    next: 'The joined arc opens into the three thin card outlines of act 7 (the arc splits into three bases).',
    html: operator(true) + kw('small', 130, 540, 400, 'Member', 'center') + kw('small', 1390, 540, 400, 'Member', 'center') + kw('big', 160, 720, 1600, 'Both agree. <em>Then</em> introduction.', 'center') },
  { n: 7, sec: 12, spoken: 'The platform does not verify members, documents or transactions. Each member stands behind their own statements.', keys: 'Members · Documents · Transactions / Their own statements.',
    moves: 'Three outline cards draw in left to right; each icon draws itself; a thin line underlines the sentence.',
    next: 'The three cards slide together and shrink into one hairline that becomes the underline of the closing phrase in act 8.',
    html: cards() + kw('small', 270, 750, 440, 'Members', 'center') + kw('small', 740, 750, 440, 'Documents', 'center') + kw('small', 1210, 750, 440, 'Transactions', 'center') + kw('mid', 160, 140, 1600, 'Each stands behind <em>their own</em> statements.', 'center') },
  { n: 8, sec: 11, spoken: 'Where opportunity meets discretion.   (written card, not spoken: "Free to join. We are paid a success fee only when an introduction leads to a concluded deal.")', keys: 'Where opportunity meets discretion.  + written card',
    moves: 'Still white page. Phrase fades in, hairline draws under it, then the written card fades in and stays at least 6 seconds, dark #15202b on white, nothing moving behind it.',
    next: 'End. Music resolves and fades.',
    html: S(`<path d="M560 520 H1360" stroke="${BLUE}" stroke-width="2.2"/>`) + kw('big', 110, 290, 1700, 'Where opportunity<br>meets <em>discretion.</em>', 'center') +
      kw('mid', 260, 600, 1400, '<span style="font-weight:400;font-size:52px;line-height:1.3;display:block">Free to join. We are paid a success fee only when an introduction leads to a concluded deal.</span>', 'center') },
];

(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  for (const a of acts) {
    await page.setContent(`<style>${css}</style><div class="stage">${a.html}</div>`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, `act-${a.n}.png`) });
  }
  await browser.close();
  let t = '| act | seconds | spoken words | on-screen key words | what moves | match move into the next act |\n|---|---|---|---|---|---|\n';
  for (const a of acts) t += `| ${a.n} | ${a.sec} | ${a.spoken} | ${a.keys} | ${a.moves} | ${a.next} |\n`;
  t += `| | **${acts.reduce((s, a) => s + a.sec, 0)}** | | | | |\n`;
  fs.writeFileSync(path.join(out, 'storyboard.md'), '# Storyboard v9 - stills only\n\nStyle: real app, cinematic, thin-line drawings, key words only, match-move transitions; music "Corporate advertising" (Nastelbom, Pixabay) kept out of the repository. Seconds are planned, not measured.\n\n' + t);
})();
