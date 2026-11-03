// Storyboard v10 - key frames (1920x1080) per act plus the table. Pictures only: no voice requests, no video.
//   node video/storyboard10/make.js CAPTURE_DIR OUT_DIR
// CAPTURE_DIR holds browse.png, row.png, contact.png, mailbox.png (real app, 2x) and meta.json from capture.js.
// Whatever is drawn here (globe, port, handshake, pen) is an illustration; every app picture is a real screenshot.
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const [cap, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const INK = '#15202b', BLUE = '#27618f', SLATE = '#52677a', SKY = '#f0f6fb', LINE = '#c9d7e4';
const COL = ['#27618f', '#b3423a', '#22744a', '#c18a2e', '#52677a']; // containers: the app's own colours plus two warm ones
const b64 = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(cap, f)).toString('base64');
const meta = fs.existsSync(path.join(cap, 'meta.json')) ? JSON.parse(fs.readFileSync(path.join(cap, 'meta.json'))) : {};

const css = `
@import url('https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Source+Sans+3:wght@300;400;600&display=swap');
*{box-sizing:border-box;margin:0}
html,body{width:1920px;height:1080px;overflow:hidden;background:#fff;font-family:'Source Sans 3',sans-serif;color:${INK}}
.stage{position:relative;width:1920px;height:1080px;background:radial-gradient(ellipse at 50% 45%,#ffffff 0%,${SKY} 100%)}
svg{position:absolute;left:0;top:0}
.k{position:absolute;font-family:Spectral,serif;font-weight:300;color:${INK};letter-spacing:.01em}
.k.big{font-size:104px;line-height:1.05}.k.mid{font-size:64px;line-height:1.1}.k.small{font-size:34px;font-family:'Source Sans 3';font-weight:400;letter-spacing:.22em;text-transform:uppercase;color:${SLATE}}
.k.word{font-weight:500;letter-spacing:.02em}
em{font-style:italic;color:${BLUE}}
.shot{position:absolute;background:#fff;border-radius:6px;box-shadow:0 40px 90px rgba(21,32,43,.18),0 2px 6px rgba(21,32,43,.08)}
`;
const S = (inner, extra = '') => `<svg width="1920" height="1080" viewBox="0 0 1920 1080" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ${extra}>${inner}</svg>`;
const kw = (cls, x, y, w, html, align = 'left') => `<div class="k ${cls}" style="left:${x}px;top:${y}px;width:${w}px;text-align:${align}">${html}</div>`;
const cursor = (x, y) => `<svg width="1920" height="1080" style="filter:drop-shadow(0 3px 4px rgba(21,32,43,.35))"><path d="M${x} ${y} L${x} ${y + 34} L${x + 9} ${y + 26} L${x + 16} ${y + 42} L${x + 23} ${y + 39} L${x + 16} ${y + 24} L${x + 28} ${y + 24} Z" fill="#fff" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/></svg>`;
const appFull = (file) => `<div style="position:absolute;left:0;top:0;width:1920px;height:1080px;overflow:hidden"><img src="${b64(file)}" style="width:1920px;height:1200px;display:block"></div>`;
const SC = 1.5; // 1280 css px -> 1920

// ---------------------------------------------------------------- globe
const LAND = [[-100, 45, 32, 20], [-80, 30, 12, 10], [-60, -15, 16, 26], [15, 50, 18, 11], [20, 5, 21, 28], [90, 47, 48, 20], [78, 20, 9, 11], [110, 25, 14, 12], [115, 0, 14, 6], [135, -25, 17, 11], [45, 25, 10, 8]];
const isLand = (lon, lat) => LAND.some(([cx, cy, rx, ry]) => ((lon - cx) / rx) ** 2 + ((lat - cy) / ry) ** 2 < 1);
function globe(cx, cy, R, lon0) {
  const tilt = 18 * Math.PI / 180;
  const vec = (lon, lat) => { const a = (lon - lon0) * Math.PI / 180, b = lat * Math.PI / 180; return [Math.cos(b) * Math.sin(a), Math.sin(b), Math.cos(b) * Math.cos(a)]; };
  const proj = (v) => { const y = v[1] * Math.cos(tilt) - v[2] * Math.sin(tilt), z = v[1] * Math.sin(tilt) + v[2] * Math.cos(tilt); return [cx + v[0] * R, cy - y * R, z]; };
  let g = `<defs><radialGradient id="glow"><stop offset="0" stop-color="${BLUE}" stop-opacity=".55"/><stop offset="1" stop-color="${BLUE}" stop-opacity="0"/></radialGradient></defs>`;
  g += `<circle cx="${cx}" cy="${cy}" r="${R}" stroke="${INK}"/>`;
  for (let lon = -180; lon < 180; lon += 30) { let d = ''; for (let lat = -90; lat <= 90; lat += 5) { const p = proj(vec(lon, lat)); d += (p[2] > 0 ? (d && d.endsWith('M') ? '' : (d ? 'L' : 'M')) : 'M') + (p[2] > 0 ? `${p[0].toFixed(1)} ${p[1].toFixed(1)}` : ''); } g += `<path d="${d.replace(/M(?=M)/g, '')}" stroke="${LINE}" stroke-width="1"/>`; }
  for (let lat = -60; lat <= 60; lat += 30) { let d = '', on = false; for (let lon = -180; lon <= 180; lon += 4) { const p = proj(vec(lon, lat)); if (p[2] > 0) { d += (on ? 'L' : 'M') + `${p[0].toFixed(1)} ${p[1].toFixed(1)}`; on = true; } else on = false; } g += `<path d="${d}" stroke="${LINE}" stroke-width="1"/>`; }
  for (let lat = -80; lat <= 80; lat += 3.2) for (let lon = -180; lon < 180; lon += 3.2 / Math.max(0.25, Math.cos(lat * Math.PI / 180))) {
    if (!isLand(lon, lat)) continue; const p = proj(vec(lon, lat)); if (p[2] <= 0.02) continue;
    g += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${(1.2 + p[2] * 1.7).toFixed(1)}" fill="${SLATE}" stroke="none" opacity="${(0.35 + p[2] * 0.5).toFixed(2)}"/>`;
  }
  const port = { chile: [-72, -33], rdam: [4, 52], dbn: [31, -30], sha: [121, 31], hou: [-95, 29], sin: [104, 1] };
  const routes = [['chile', 'rdam', 1], ['dbn', 'rdam', 0], ['dbn', 'sha', 0], ['sin', 'rdam', 0], ['hou', 'rdam', 0], ['chile', 'sha', 0]];
  const slerp = (a, b, t) => { const d = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])), s = Math.sin(d); if (!s) return a; const k1 = Math.sin((1 - t) * d) / s, k2 = Math.sin(t * d) / s; return [0, 1, 2].map((i) => a[i] * k1 + b[i] * k2); };
  for (const [a, b, hot] of routes) {
    const A = vec(...port[a]), B = vec(...port[b]); let d = '', on = false;
    for (let t = 0; t <= 1.001; t += 0.02) { const v = slerp(A, B, t), lift = 1 + 0.05 * Math.sin(Math.PI * t), p = proj([v[0] * lift, v[1] * lift, v[2] * lift]); const front = proj(v)[2] > 0; if (front) { d += (on ? 'L' : 'M') + `${p[0].toFixed(1)} ${p[1].toFixed(1)}`; on = true; } else on = false; }
    g += `<path d="${d}" stroke="${hot ? BLUE : SLATE}" stroke-width="${hot ? 2.6 : 1.4}"/>`;
  }
  for (const k of Object.keys(port)) { const p = proj(vec(...port[k])); if (p[2] <= 0) continue; g += `<circle cx="${p[0]}" cy="${p[1]}" r="26" fill="url(#glow)" stroke="none"/><circle cx="${p[0]}" cy="${p[1]}" r="9" fill="#fff" stroke="${BLUE}" stroke-width="2.4"/><circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="${BLUE}" stroke="none"/>`; }
  return S(g);
}

// ---------------------------------------------------------------- port
const figure = (x, y, flip) => `<g transform="translate(${x} ${y}) scale(${flip ? -1 : 1} 1)" stroke="${SLATE}" stroke-width="1.6" opacity=".7">
  <circle cx="0" cy="-150" r="19" filter="url(#blur)" fill="${LINE}"/><path d="M-22 -118 Q0 -128 22 -118 L28 -40 L14 -40 L10 0 H-10 L-14 -40 H-28 Z"/><path d="M-22 -112 L-44 -62 M22 -112 L36 -70"/></g>`;
const container = (x, y, w, h, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}" fill-opacity=".82" stroke="${INK}" stroke-width="1.2"/><path d="M${x + w * 0.25} ${y} V${y + h} M${x + w * 0.5} ${y} V${y + h} M${x + w * 0.75} ${y} V${y + h}" stroke="#fff" stroke-opacity=".55" stroke-width="1"/>`;
function portScene(stage) {
  let g = `<defs><filter id="blur"><feGaussianBlur stdDeviation="6"/></filter></defs>`;
  g += `<path d="M0 760 H560 M1360 760 H1920" stroke="${INK}"/><path d="M0 760 V900 M1920 760 V900" stroke="${LINE}"/><path d="M560 800 Q960 830 1360 800" stroke="${LINE}" stroke-dasharray="2 12"/>`;
  g += figure(300, 760, false) + figure(1830, 760, true);
  // ship in the middle, hull line, remaining coloured containers
  g += `<path d="M640 800 H1280 Q1250 880 1170 880 H760 Q680 880 640 800 Z" stroke="${INK}"/>`;
  const cs = [[660, 740, 0], [750, 740, 1], [840, 740, 2], [930, 740, 3], [1020, 740, 4], [1110, 740, 0], [700, 682, 2], [790, 682, 4], [880, 682, 1]];
  for (const [x, y, c] of cs) if (!(stage === 1 && x === 1020 && y === 740)) g += container(x, y, 86, 56, COL[c]);
  // gantry crane on the left quay
  g += `<path d="M420 760 V300 H1120 M420 300 L310 360 M540 760 V300 M1120 300 V380" stroke="${INK}"/><path d="M420 760 L540 650 M420 650 L540 540 M420 540 L540 430 M420 430 L540 300" stroke="${LINE}"/>`;
  if (stage === 0) { g += `<path d="M1000 300 V470" stroke="${BLUE}" stroke-width="2"/>` + container(956, 470, 90, 58, COL[1]); }
  // truck on the right quay
  const tx = stage === 1 ? 1470 : 1380;
  g += `<g transform="translate(${tx} 152) scale(.8)"><path d="M0 700 V760 H300 V700 Z M300 760 V710 H340 L370 735 V760 Z" stroke="${INK}"/><circle cx="60" cy="768" r="22" stroke="${INK}"/><circle cx="260" cy="768" r="22" stroke="${INK}"/><circle cx="335" cy="768" r="22" stroke="${INK}"/>${stage === 1 ? container(20, 640, 270, 62, COL[1]) : ''}</g>`;
  if (stage === 1) g += `<path d="M1300 740 H1450 M1280 770 H1450 M1320 800 H1450" stroke="${LINE}" stroke-width="2"/>`;
  return S(g);
}

// ---------------------------------------------------------------- operator diagram
function operator(stage) {
  const cx = 960, cy = 470; let g = `<circle cx="${cx}" cy="${cy}" r="140" stroke="${BLUE}" stroke-width="2.4"/><circle cx="${cx}" cy="${cy}" r="190" stroke="${LINE}"/>`;
  const L = [330, 470], R = [1590, 470];
  g += `<circle cx="${L[0]}" cy="${L[1]}" r="62" stroke="${INK}"/><circle cx="${R[0]}" cy="${R[1]}" r="62" stroke="${INK}"/>`;
  g += `<path d="M392 470 H820" stroke="${LINE}" stroke-width="2"/><path d="M1100 470 H1528" stroke="${LINE}" stroke-width="2"/>`;
  const msg = (x, y, c) => `<g transform="translate(${x - 30} ${y - 20})"><rect width="60" height="40" rx="4" fill="#fff" stroke="${c}" stroke-width="2.2"/><path d="M0 4 L30 24 L60 4" stroke="${c}" stroke-width="2"/></g>`;
  if (stage === 0) g += `<path d="M392 470 H700" stroke="${BLUE}" stroke-width="2.6"/>` + msg(640, 470, BLUE) + `<path d="M1100 470 H1528" stroke="${BLUE}" stroke-width="2.6" stroke-dasharray="4 10"/>`;
  else g += `<path d="M392 470 H820" stroke="${BLUE}" stroke-width="2.6"/><path d="M1100 470 H1400" stroke="${BLUE}" stroke-width="2.6"/>` + msg(1330, 470, BLUE);
  return S(g);
}

// ---------------------------------------------------------------- handshake (fine line)
function handshake(op = 1) {
  const mir = (d) => d.replace(/(-?\d+(\.\d+)?) (-?\d+(\.\d+)?)/g, (m, x, _a, y) => `${(1920 - parseFloat(x)).toFixed(0)} ${y}`);
  const left = ['M230 650 C420 610 650 545 850 520', 'M300 790 C480 770 700 710 890 645', 'M230 650 L300 790'];
  let g = '';
  for (const d of left) g += `<path d="${d}" stroke="${INK}"/><path d="${mir(d)}" stroke="${INK}"/>`;
  g += `<path d="M850 520 C900 490 1010 495 1070 540" stroke="${BLUE}" stroke-width="2.4"/>`; // the left thumb over the right hand
  g += `<path d="M890 645 C940 690 1010 690 1050 650" stroke="${BLUE}" stroke-width="2.4"/>`; // the underside of the clasp
  for (let i = 0; i < 4; i++) g += `<path d="M${905 + i * 34} ${560 + i * 4} q22 -34 52 -14" stroke="${BLUE}" stroke-width="1.8"/>`; // fingers
  g += `<path d="M1070 540 C1085 575 1075 615 1050 650" stroke="${BLUE}" stroke-width="2.4"/>`;
  return `<div style="opacity:${op};transform:translateY(-150px)">${S(g)}</div>`;
}

// ---------------------------------------------------------------- pen signing a document
function signing() {
  let g = `<rect x="560" y="120" width="800" height="680" rx="6" stroke="${INK}"/>`;
  for (let i = 0; i < 6; i++) g += `<path d="M640 ${200 + i * 62} H${i % 3 === 2 ? 1000 : 1280}" stroke="${LINE}" stroke-width="2"/>`;
  g += `<path d="M640 700 H1000" stroke="${SLATE}"/>`;
  g += `<path d="M650 690 C700 610 740 660 760 690 C780 720 800 620 840 650 C880 680 900 700 960 660" stroke="${BLUE}" stroke-width="3"/>`; // the signature
  g += `<path d="M960 660 L1190 330 L1230 350 L1000 690 Z" stroke="${INK}" fill="#fff"/><path d="M960 660 L1000 690 L950 700 Z" stroke="${INK}" fill="${INK}"/><path d="M1190 330 L1210 290 L1250 310 L1230 350" stroke="${INK}"/>`; // the pen
  return S(g);
}

const acts = [
  { id: '1', sec: 8, voice: 'MyPlatform is a private marketplace to trade physical commodities. By invitation only.', screen: 'MyPlatform (title next to the globe) / Physical commodities. By invitation only.',
    moves: 'Slow rotation of the dotted-continent globe; routes draw one after another; the port dots glow at the route ends.', next: 'The bright route (Chile to Rotterdam) keeps drawing off the globe and becomes the horizon line of the quay in act 2.',
    frames: [['', globe(1280, 520, 390, 12) + kw('big word', 110, 270, 760, 'MyPlatform') + kw('mid', 114, 450, 760, 'Physical commodities.<br>By invitation only.')]] },
  { id: '2', sec: 14, voice: 'In commodity trading, counterparties are often difficult to identify. Disclosing your position too early can weaken your commercial leverage.', screen: 'The counterparty. / Too early.',
    moves: 'Two faint figures, faces blurred, stand on opposite quays; the crane lifts coloured containers off the ship and lowers one onto the truck; the truck drives away.', next: 'The truck\'s road line runs off the right edge and returns from the left as the app\'s top bar in act 3.',
    frames: [['a', portScene(0) + kw('big', 100, 110, 1720, 'The <em>counterparty.</em>', 'center')], ['b', portScene(1) + kw('big', 100, 110, 1720, '<em>Too</em> early.', 'center')]] },
  { id: '3', sec: 12, voice: 'Members post buying and selling opportunities with the key details: commodity, quantity, origin and Incoterms.', screen: 'Commodity · Quantity · Origin · Incoterms',
    moves: 'The real Browse screen (copper cathodes, LME Grade A, South Africa, CIF); a mouse pointer glides to the row and clicks Contact; the real Contact window opens.', next: 'The Contact window\'s edge is the frame of the row in act 4 (the camera pushes into the row).',
    frames: [['a', appFull('browse.png') + cursor(((meta.contactBtn || { x: 400, y: 330 }).x + 60) * SC, ((meta.contactBtn || { x: 400, y: 330 }).y + 20) * SC) + `<div style="position:absolute;left:0;right:0;bottom:0;height:200px;background:linear-gradient(0deg,rgba(255,255,255,.97) 55%,rgba(255,255,255,0))"></div>` + kw('mid', 110, 925, 1700, 'Commodity · Quantity · Origin · <em>Incoterms</em>', 'center')],
      ['b', appFull('contact.png') + cursor(((meta.contactSend || { x: 500, y: 520 }).x + 40) * SC, ((meta.contactSend || { x: 500, y: 520 }).y + 16) * SC)]] },
  { id: '4', sec: 12, voice: "Each member states their role and declares the documentation available. Other members see the opportunity, not the member's identity.", screen: 'The opportunity. / Not the member.',
    moves: 'The real listing row fills the frame: role ("Principal") and declared documents are underlined; beside it a small member badge stays blurred and greyed. NOTE: the app has no separate detail window - the row itself is the detail.', next: 'The row slides left and its right edge becomes the left member ring of act 5.',
    frames: [['', kw('big', 100, 90, 1720, 'The <em>opportunity.</em>', 'center') + `<div class="shot" style="left:160px;top:330px;width:1440px;overflow:hidden"><img src="${b64('row.png')}" style="width:1440px;display:block"></div>` +
      `<div style="position:absolute;left:1650px;top:330px;width:120px;height:120px;border-radius:60px;border:2px solid ${LINE};background:#e8edf2;filter:blur(7px)"></div>` + kw('small', 1610, 470, 200, 'Member', 'center').replace('color:', 'filter:blur(5px);color:') + kw('big', 100, 780, 1720, '<em>Not</em> the member.', 'center')]] },
  { id: '5', sec: 13, voice: "All communication passes through MyPlatform's Operator, who relays every message between the two sides.", screen: 'Through the Operator.',
    moves: 'Real Mailbox with the message just sent; the screen melts into the diagram: the message travels from the member to the centre, the Operator receives it and forwards it to the other member, and back.', next: 'The forwarded message line continues to the right ring, and both member lines pull together into the handshake of act 6.',
    frames: [['a', appFull('mailbox.png')], ['b', operator(0) + kw('small', 130, 560, 400, 'Member', 'center') + kw('small', 1390, 560, 400, 'Member', 'center') + kw('word', 760, 395, 400, 'MyPlatform', 'center').replace('class="k word"', 'class="k word" style="font-size:44px"') + kw('small', 760, 480, 400, 'Operator', 'center') + kw('big', 160, 760, 1600, 'Through the <em>Operator.</em>', 'center')]] },
  { id: '6', sec: 16, voice: 'Introduction follows only once both sides agree on the essential terms and conditions and wish to proceed.', screen: 'Mutual agreement. Then the introduction. / then, for about 10 s, the written card (not spoken)',
    moves: 'The two lines from act 5 meet and become a fine-line handshake; the picture dims and a written card sits over it, static, dark #15202b on white, about 10 s.', next: 'The handshake dims out; the card\'s top hairline becomes the document edge of act 7.',
    frames: [['a', handshake() + kw('big', 100, 800, 1720, '<em>Mutual agreement.</em><br><span style="font-size:64px">Then the introduction.</span>', 'center')],
      ['b', handshake(0.12) + `<div style="position:absolute;left:210px;top:260px;width:1500px;padding:56px 70px;background:#fff;border:1px solid ${LINE};border-radius:10px;font-family:Spectral,serif;font-weight:400;font-size:46px;line-height:1.35;color:${INK};text-align:center;box-shadow:0 20px 60px rgba(21,32,43,.08)">Membership is provided without any membership or access fees. The Operator of MyPlatform is remunerated by commission on successfully concluded transactions resulting from introductions made through MyPlatform.</div>`]] },
  { id: '7', sec: 9, voice: 'MyPlatform, the commercial intermediary, introduces; members transact on the strength of their own judgement and due diligence.', screen: 'Each member warrants their own representations.',
    moves: 'A fine-line pen signs the document: the signature draws itself stroke by stroke.', next: 'The signature line lengthens into the hairline under the closing phrase in act 8.',
    frames: [['', signing() + kw('mid', 100, 880, 1720, 'Each member warrants <em>their own</em> representations.', 'center')]] },
  { id: '8', sec: 6, voice: 'Where opportunity meets discretion.', screen: 'MyPlatform / Where opportunity meets discretion. (hairline; no fee card, no web address)',
    moves: 'Still white page: the name fades in, the phrase fades in, the hairline draws; music resolves and fades.', next: 'End.',
    frames: [['', S(`<path d="M560 600 H1360" stroke="${BLUE}" stroke-width="2.2"/>`) + kw('mid word', 110, 250, 1700, 'MyPlatform', 'center') + kw('big', 110, 370, 1700, 'Where opportunity<br>meets <em>discretion.</em>', 'center')]] },
];


// Sound effects (planning only, nothing mixed yet): subtle, CC0 only, from Openverse; each file's URL and licence recorded here.
const WHOOSH = 'whoosh: "Swipe Whoosh" (qubodup, 447 ms, CC0 1.0) https://freesound.org/people/qubodup/sounds/60007 ; alt "13th Whoosh Swing Sound" (qubodup, 522 ms, CC0 1.0) https://freesound.org/people/qubodup/sounds/60000';
const SFX = {
  '1': 'at 0.0 s: low tone (open) - file to be chosen (CC0 lookup pending); at the end: ' + WHOOSH,
  '2': 'at the start: ' + WHOOSH + '; at the end: same whoosh',
  '3': 'at the start: same whoosh; when the pointer clicks Contact (3a to 3b): quiet mouse click - file to be chosen (CC0 lookup pending)',
  '4': 'at the start: same whoosh; when the row opens: quiet mouse click',
  '5': 'at the start: same whoosh; when the message is sent: quiet mouse click; the melt from Mailbox to diagram: soft whoosh',
  '6': 'at the start: same whoosh; no click',
  '7': 'at the start: same whoosh (nothing else)',
  '8': 'at the start: same whoosh; at the end: low tone (close), the same file as the opening one',
};
const LEVELS = 'All effects well under the music (about 20 dB below it), no effect longer than 1 s except the two low tones (about 2 s, fading).';

(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  for (const a of acts) for (const [suffix, html] of a.frames) {
    await page.setContent(`<style>${css}</style><div class="stage">${html}</div>`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(out, `act-${a.id}${suffix}.png`) });
  }
  await browser.close();
  let t = '| act | seconds | voice (exact) | on screen | what moves | match move into the next act | stills | sound effects (planned) |\n|---|---|---|---|---|---|---|---|\n';
  for (const a of acts) t += `| ${a.id} | ${a.sec} | ${a.voice} | ${a.screen} | ${a.moves} | ${a.next} | ${a.frames.map((f) => `act-${a.id}${f[0]}.png`).join(', ')} | ${SFX[a.id]} |\n`;
  t += `| | **${acts.reduce((s, a) => s + a.sec, 0)}** | | | | | | |\n`;
  t += `\n${LEVELS}\n`;
  fs.writeFileSync(path.join(out, 'storyboard.md'), '# Storyboard v10 - stills only\n\nLight app colours, fine line, key words only, match moves. Music: "Corporate advertising" (Nastelbom, Pixabay), kept out of the repository. Seconds are planned, not measured. App pictures are real screenshots; globe, port, handshake and pen are drawn illustrations.\n\n' + t);
})();
