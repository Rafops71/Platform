// Storyboard v14 - key frames (1920x1080) per act plus the table. Pictures only: no voice requests, no video.
//   node video/storyboard11/make.js CAPTURE_DIR OUT_DIR
// CAPTURE_DIR holds browse.png, row.png, contact.png, mailbox.png (real app, 2x) and meta.json (from storyboard10/capture.js).
// Everything app-shaped is a real screenshot (pieces of it are lit or covered); globe, night sea, hands, pen, diagram are drawn in code.
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const [cap, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const INK = '#15202b', BLUE = '#27618f', SLATE = '#52677a', SKY = '#f0f6fb', MIST = '#e2ebf3', LINE = '#c9d7e4', GLOWB = '#5fa3d6';
const b64 = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(cap, f)).toString('base64');
const meta = fs.existsSync(path.join(cap, 'meta.json')) ? JSON.parse(fs.readFileSync(path.join(cap, 'meta.json'))) : {};
const SC = 1.5; // 1280 css px -> 1920
let seed = 7; const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const css = `
@import url('https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Source+Sans+3:wght@300;400;600&display=swap');
*{box-sizing:border-box;margin:0}
html,body{width:1920px;height:1080px;overflow:hidden;background:#fff;font-family:'Source Sans 3',sans-serif;color:${INK}}
.stage{position:relative;width:1920px;height:1080px;overflow:hidden;background:radial-gradient(ellipse at 50% 42%,#ffffff 0%,${SKY} 62%,${MIST} 100%)}
.stage.dark{background:#04080d}
svg.l{position:absolute;left:0;top:0}
.k{position:absolute;font-family:Spectral,serif;font-weight:300;color:${INK};letter-spacing:.01em;text-shadow:0 0 50px rgba(95,163,214,.28)}
.k.big{font-size:104px;line-height:1.05}.k.mid{font-size:64px;line-height:1.1}
.k.small{font-size:30px;font-family:'Source Sans 3';font-weight:400;letter-spacing:.26em;text-transform:uppercase;color:${SLATE};text-shadow:none}
.k.word{font-weight:500;letter-spacing:.02em}
.dark .k{color:#eaf3fa;text-shadow:0 0 60px rgba(143,193,234,.55),0 2px 24px rgba(0,0,0,.6)}
em{font-style:italic;color:${BLUE}}
.dark em{color:#9fcdf0}
.lit{color:${BLUE};text-shadow:0 0 28px rgba(95,163,214,.75)}
.shot{position:absolute;background:#fff;border-radius:10px;box-shadow:0 60px 120px rgba(21,32,43,.24),0 8px 18px rgba(21,32,43,.10);overflow:hidden}
.abs{position:absolute}
.vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 50%,rgba(255,255,255,0) 55%,rgba(21,32,43,.14) 100%)}
.dark .vig{background:radial-gradient(ellipse at 50% 55%,rgba(0,0,0,0) 45%,rgba(0,0,0,.65) 100%)}
.sweep{position:absolute;inset:-10%;pointer-events:none;mix-blend-mode:soft-light;background:linear-gradient(104deg,rgba(255,255,255,0) 34%,rgba(255,255,255,.95) 47%,rgba(255,255,255,0) 60%)}
.grain{position:absolute;inset:0;opacity:.07;mix-blend-mode:multiply;pointer-events:none;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .1  0 0 0 0 .15  0 0 0 0 .2  0 0 0 .9 0'/></filter><rect width='240' height='240' filter='url(%23n)'/></svg>")}
.dark .grain{mix-blend-mode:screen;opacity:.05}
`;
const DEFS = `<svg width="0" height="0" style="position:absolute"><defs>
<filter id="g4" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
<filter id="g8" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
<filter id="g16" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="16"/></filter>
<filter id="g40" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="40"/></filter>
<filter id="g70" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="70"/></filter>
<filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="softglow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="12" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<radialGradient id="rgBlue"><stop offset="0" stop-color="${GLOWB}" stop-opacity=".9"/><stop offset="1" stop-color="${GLOWB}" stop-opacity="0"/></radialGradient>
<radialGradient id="rgWhite"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset=".4" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<radialGradient id="rgWarm"><stop offset="0" stop-color="#fff4cf" stop-opacity=".95"/><stop offset="1" stop-color="#ffd98a" stop-opacity="0"/></radialGradient>
</defs></svg>`;
const SV = (inner, extra = '') => `<svg class="l" width="1920" height="1080" viewBox="0 0 1920 1080" fill="none" stroke-linecap="round" stroke-linejoin="round" ${extra}>${inner}</svg>`;
const kw = (cls, x, y, w, html, align = 'left', style = '') => `<div class="k ${cls}" style="left:${x}px;top:${y}px;width:${w}px;text-align:${align};${style}">${html}</div>`;
const cursor = (x, y) => `<svg class="l" width="1920" height="1080" style="filter:drop-shadow(0 6px 8px rgba(21,32,43,.4))"><path d="M${x} ${y} L${x} ${y + 34} L${x + 9} ${y + 26} L${x + 16} ${y + 42} L${x + 23} ${y + 39} L${x + 16} ${y + 24} L${x + 28} ${y + 24} Z" fill="#fff" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/></svg>`;
const finish = (dark, plain) => plain ? '' : `<div class="vig"></div><div class="sweep" style="${dark ? 'display:none' : ''}"></div><div class="grain"></div>`;
// drifting light motes (parallax layers: far = small and sharp, near = big and blurred)
function motes(n, color, depth = 1) { let g = ''; for (let i = 0; i < n; i++) { const near = rnd() < 0.3, r = near ? 14 + rnd() * 30 : 2 + rnd() * 5; g += `<circle cx="${(rnd() * 1920).toFixed(0)}" cy="${(rnd() * 1080).toFixed(0)}" r="${r.toFixed(1)}" fill="${color}" opacity="${(near ? 0.1 : 0.45) * depth}" ${near ? 'filter="url(#g8)"' : ''} stroke="none"/>`; } return SV(g); }

// ---------------------------------------------------------------- globe (acts 1 and 8)
const LAND = [[-120, 55, 25, 12], [-100, 42, 30, 18], [-80, 30, 12, 10], [-100, 20, 12, 8], [-60, -12, 16, 24], [-70, -40, 6, 14], [-5, 40, 10, 7], [15, 52, 20, 10], [18, 66, 10, 7], [20, 5, 21, 28], [30, -20, 10, 14], [47, -19, 3, 8], [90, 55, 55, 12], [70, 40, 30, 12], [45, 25, 12, 10], [78, 20, 9, 11], [105, 30, 18, 14], [110, 5, 8, 5], [118, -2, 14, 5], [140, 37, 4, 8], [135, -25, 17, 11]];
const isLand = (lon, lat) => LAND.some(([cx, cy, rx, ry]) => ((lon - cx) / rx) ** 2 + ((lat - cy) / ry) ** 2 < 1);
const PORT = { val: [-72, -33], rdam: [4, 52], dbn: [31, -30], sha: [121, 31], hou: [-95, 29], sin: [104, 1], santos: [-46, -24], lagos: [3, 6], mba: [40, -4], bom: [73, 19], dxb: [55, 25], per: [116, -32], la: [-118, 34], psd: [32, 31], tyo: [140, 36], van: [-123, 49], cal: [-77, -12], tema: [0, 5], gla: [151, -23], ny: [-74, 41], cpt: [18, -34], hou2: [-90, 30] };
const ROUTES = [['val', 'rdam', 1], ['dbn', 'rdam', 0], ['dbn', 'sha', 0], ['sin', 'rdam', 0], ['hou', 'rdam', 0], ['val', 'sha', 0], ['santos', 'rdam', 0], ['santos', 'cpt', 0], ['lagos', 'rdam', 0], ['mba', 'bom', 0], ['dxb', 'sha', 0], ['per', 'sin', 0], ['la', 'tyo', 0], ['psd', 'rdam', 0], ['tema', 'santos', 0], ['cpt', 'per', 0], ['dxb', 'rdam', 0], ['ny', 'rdam', 1], ['cal', 'la', 0], ['gla', 'sha', 0], ['bom', 'sin', 0], ['mba', 'dbn', 0]];
function globe(cx, cy, R, lon0, o = {}) {
  const tilt = 20 * Math.PI / 180, id = o.id || 'gl';
  const vec = (lon, lat) => { const a = (lon - lon0) * Math.PI / 180, b = lat * Math.PI / 180; return [Math.cos(b) * Math.sin(a), Math.sin(b), Math.cos(b) * Math.cos(a)]; };
  const proj = (v) => { const y = v[1] * Math.cos(tilt) - v[2] * Math.sin(tilt), z = v[1] * Math.sin(tilt) + v[2] * Math.cos(tilt); return [cx + v[0] * R, cy - y * R, z]; };
  let g = `<defs><radialGradient id="${id}s" cx=".36" cy=".3" r=".9"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#eef4fa"/><stop offset="1" stop-color="#c3d6e8"/></radialGradient>
  <radialGradient id="${id}a" cx=".5" cy=".5" r=".5"><stop offset=".78" stop-color="${GLOWB}" stop-opacity="0"/><stop offset=".9" stop-color="${GLOWB}" stop-opacity=".28"/><stop offset="1" stop-color="${GLOWB}" stop-opacity="0"/></radialGradient>
  <radialGradient id="${id}d" cx=".35" cy=".3" r=".85"><stop offset=".55" stop-color="#15202b" stop-opacity="0"/><stop offset="1" stop-color="#15202b" stop-opacity=".22"/></radialGradient>
  <linearGradient id="${id}w" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <clipPath id="${id}c"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath></defs>`;
  g += `<ellipse cx="${cx}" cy="${cy + R * 1.14}" rx="${R * 0.86}" ry="${R * 0.07}" fill="${INK}" opacity=".16" filter="url(#g40)" stroke="none"/>`;
  g += `<circle cx="${cx}" cy="${cy}" r="${R * 1.28}" fill="url(#${id}a)" stroke="none"/>`;
  g += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#${id}s)" stroke="none"/>`;
  for (let lon = -180; lon < 180; lon += 20) { let d = '', on = false; for (let lat = -90; lat <= 90; lat += 4) { const p = proj(vec(lon, lat)); if (p[2] > 0) { d += (on ? 'L' : 'M') + `${p[0].toFixed(1)} ${p[1].toFixed(1)}`; on = true; } else on = false; } g += `<path d="${d}" stroke="#b9cde0" stroke-width="1" opacity=".7"/>`; }
  for (let lat = -70; lat <= 70; lat += 20) { let d = '', on = false; for (let lon = -180; lon <= 180; lon += 4) { const p = proj(vec(lon, lat)); if (p[2] > 0) { d += (on ? 'L' : 'M') + `${p[0].toFixed(1)} ${p[1].toFixed(1)}`; on = true; } else on = false; } g += `<path d="${d}" stroke="#b9cde0" stroke-width="1" opacity=".7"/>`; }
  for (let lat = -82; lat <= 82; lat += 2.4) for (let lon = -180; lon < 180; lon += 2.4 / Math.max(0.25, Math.cos(lat * Math.PI / 180))) {
    if (!isLand(lon, lat)) continue; const p = proj(vec(lon, lat)); if (p[2] <= 0.03) continue;
    g += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${(0.9 + p[2] * 1.9).toFixed(1)}" fill="${p[2] > .7 ? '#3d5a75' : SLATE}" stroke="none" opacity="${(0.3 + p[2] * 0.62).toFixed(2)}"/>`;
  }
  g += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#${id}d)" stroke="none"/>`;
  const slerp = (a, b, t) => { const d = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])), s = Math.sin(d); if (!s) return a; const k1 = Math.sin((1 - t) * d) / s, k2 = Math.sin(t * d) / s; return [0, 1, 2].map((i) => a[i] * k1 + b[i] * k2); };
  let comets = '', routesBase = '', routesHot = '';
  ROUTES.forEach(([a, b, hot], i) => {
    const A = vec(...PORT[a]), B = vec(...PORT[b]); const pts = [];
    for (let t = 0; t <= 1.001; t += 0.02) { const v = slerp(A, B, t), lift = 1 + 0.07 * Math.sin(Math.PI * t), p = proj([v[0] * lift, v[1] * lift, v[2] * lift]); pts.push({ t, x: p[0], y: p[1], front: proj(v)[2] > 0.02 }); }
    const path = (lo, hi) => { let d = '', on = false; for (const p of pts) { if (p.t < lo || p.t > hi || !p.front) { on = false; continue; } d += (on ? 'L' : 'M') + `${p.x.toFixed(1)} ${p.y.toFixed(1)}`; on = true; } return d; };
    routesBase += `<path d="${path(0, 1)}" stroke="${hot ? BLUE : SLATE}" stroke-width="${hot ? 1.8 : 1.1}" opacity="${hot ? .6 : .38}"/>`;
    const h0 = (i * 0.137) % 0.62, h1 = h0 + 0.3 + (hot ? .25 : 0);
    routesHot += `<path d="${path(h0, Math.min(1, h1))}" stroke="${GLOWB}" stroke-width="${hot ? 4.2 : 2.6}" filter="url(#glow)"/><path d="${path(h0, Math.min(1, h1))}" stroke="#fff" stroke-width="${hot ? 1.6 : 1}" opacity=".95"/>`;
    const hp = pts.find((p) => p.t >= Math.min(1, h1) - 0.02 && p.front); if (hp) comets += `<circle cx="${hp.x.toFixed(1)}" cy="${hp.y.toFixed(1)}" r="16" fill="url(#rgWhite)" stroke="none"/><circle cx="${hp.x.toFixed(1)}" cy="${hp.y.toFixed(1)}" r="4.2" fill="#fff" stroke="${BLUE}" stroke-width="1.6"/>`;
  });
  g += routesBase + routesHot + comets;
  let k = 0;
  for (const key of Object.keys(PORT)) {
    const p = proj(vec(...PORT[key])); if (p[2] <= 0.05) continue; const s = 0.7 + p[2] * 0.5;
    g += `<circle cx="${p[0]}" cy="${p[1]}" r="${36 * s}" fill="url(#rgBlue)" stroke="none" opacity=".75"/>`;
    if (k++ % 2 === 0) g += `<circle cx="${p[0]}" cy="${p[1]}" r="${22 * s}" stroke="${GLOWB}" stroke-width="1.4" opacity=".7"/><circle cx="${p[0]}" cy="${p[1]}" r="${32 * s}" stroke="${GLOWB}" stroke-width="1" opacity=".35"/>`;
    g += `<circle cx="${p[0]}" cy="${p[1]}" r="${8.5 * s}" fill="#fff" stroke="${BLUE}" stroke-width="2.4"/><circle cx="${p[0]}" cy="${p[1]}" r="${3.2 * s}" fill="${BLUE}" stroke="none"/>`;
  }
  g += `<g clip-path="url(#${id}c)"><rect x="${cx - R * 0.95}" y="${cy - R * 1.2}" width="${R * 0.5}" height="${R * 2.4}" fill="url(#${id}w)" transform="rotate(24 ${cx} ${cy})" opacity=".45" stroke="none"/></g>`;
  g += `<circle cx="${cx}" cy="${cy}" r="${R}" stroke="#fff" stroke-width="3" opacity=".9"/><circle cx="${cx}" cy="${cy}" r="${R + 2}" stroke="${GLOWB}" stroke-width="1.5" opacity=".5"/>`;
  return SV(g, `style="opacity:${o.op == null ? 1 : o.op}${o.blur ? ';filter:blur(' + o.blur + 'px)' : ''}"`);
}

// ---------------------------------------------------------------- act 2: ships in fog at night
function ship(x, y, sc, flip, lit, tone = 1) {
  const cs = []; const cols = ['#27618f', '#b3423a', '#22744a', '#c18a2e', '#52677a', '#8a5a9a'];
  let g = `<g transform="translate(${x} ${y}) scale(${flip ? -sc : sc} ${sc})">`;
  g += `<path d="M-20 -78 H660 L725 -78 Q700 -10 640 0 H40 Q-8 0 -20 -78 Z" fill="${lit ? '#16222e' : '#0b141d'}" stroke="${lit ? '#6f8ea8' : '#25384a'}" stroke-width="2"/>`;
  g += `<path d="M-14 -62 H690" stroke="${lit ? '#b3423a' : '#3a2a2e'}" stroke-width="7"/>`;
  g += `<rect x="30" y="-190" width="150" height="112" fill="${lit ? '#1d2c3a' : '#0d1823'}" stroke="${lit ? '#7fa2bf' : '#25384a'}" stroke-width="2"/><rect x="20" y="-218" width="170" height="30" fill="${lit ? '#223445' : '#0e1a26'}" stroke="${lit ? '#7fa2bf' : '#25384a'}" stroke-width="2"/><rect x="95" y="-262" width="38" height="46" fill="${lit ? '#2a3f52' : '#0e1a26'}" stroke="${lit ? '#7fa2bf' : '#25384a'}" stroke-width="2"/><path d="M114 -262 V-310 M80 -290 H150" stroke="${lit ? '#9ab6cd' : '#2c4155'}" stroke-width="2"/>`;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) g += `<rect x="${42 + c * 22}" y="${-176 + r * 28}" width="14" height="10" fill="${lit ? '#fff1c4' : '#10202e'}" stroke="none"/>`;
  for (let c = 0; c < 7; c++) g += `<rect x="${28 + c * 24}" y="-210" width="16" height="9" fill="${lit ? '#fff1c4' : '#10202e'}" stroke="none"/>`;
  let n = 0;
  for (let row = 0; row < 4; row++) for (let c = 0; c < 9; c++) {
    if (row === 3 && (c < 1 || c > 7)) continue; const cx = 215 + c * 50, cy = -78 - 34 * (row + 1);
    const col = cols[(c * 3 + row * 2) % cols.length]; n++;
    g += lit ? `<rect x="${cx}" y="${cy}" width="46" height="31" fill="${col}" fill-opacity=".92" stroke="#fff" stroke-opacity=".55" stroke-width="1.2"/><path d="M${cx + 12} ${cy} V${cy + 31} M${cx + 24} ${cy} V${cy + 31} M${cx + 35} ${cy} V${cy + 31}" stroke="#fff" stroke-opacity=".35"/>` : `<rect x="${cx}" y="${cy}" width="46" height="31" fill="#0c1721" stroke="#1d2f40" stroke-width="1.2"/>`;
  }
  if (lit) {
    g += `<rect x="205" y="-300" width="460" height="226" fill="url(#rgWarm)" opacity=".3" filter="url(#g40)" stroke="none"/>`;
    for (let i = 0; i < 6; i++) g += `<circle cx="${230 + i * 85}" cy="-76" r="46" fill="url(#rgWarm)" stroke="none"/><circle cx="${230 + i * 85}" cy="-76" r="4" fill="#fff" stroke="none"/>`;
    g += `<path d="M100 -330 L-140 -60 L360 -60 Z" fill="url(#rgWarm)" opacity=".22" stroke="none"/><circle cx="114" cy="-312" r="30" fill="url(#rgWarm)" stroke="none"/><circle cx="690" cy="-92" r="28" fill="url(#rgWarm)" stroke="none"/><circle cx="-4" cy="-92" r="22" fill="#ff7b6b" opacity=".6" filter="url(#g8)" stroke="none"/>`;
  } else g += `<circle cx="114" cy="-312" r="3" fill="#2a3d50" stroke="none"/>`;
  return g + '</g>';
}
function radar(cx, cy, r, mode) { // mode: 'blip' (blurred, "?") or 'crisp'
  let g = `<circle cx="${cx}" cy="${cy}" r="${r + 10}" fill="#0b141d" stroke="#2c4155" stroke-width="3"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="#06101a" stroke="#6f9bc0" stroke-width="1.6" opacity=".95"/>`;
  for (const f of [.33, .66]) g += `<circle cx="${cx}" cy="${cy}" r="${r * f}" stroke="#6f9bc0" stroke-width="1" opacity=".4"/>`;
  g += `<path d="M${cx - r} ${cy} H${cx + r} M${cx} ${cy - r} V${cy + r}" stroke="#6f9bc0" stroke-width="1" opacity=".35"/>`;
  const a = -50 * Math.PI / 180, a2 = a - 0.9;
  g += `<defs><linearGradient id="sw${cx}" gradientUnits="userSpaceOnUse" x1="${cx + r * Math.cos(a)}" y1="${cy + r * Math.sin(a)}" x2="${cx + r * Math.cos(a2)}" y2="${cy + r * Math.sin(a2)}"><stop offset="0" stop-color="#9fd4ff" stop-opacity=".7"/><stop offset="1" stop-color="#9fd4ff" stop-opacity="0"/></linearGradient></defs><path d="M${cx} ${cy} L${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)} A${r} ${r} 0 0 0 ${cx + r * Math.cos(a2)} ${cy + r * Math.sin(a2)} Z" fill="url(#sw${cx})" stroke="none"/><path d="M${cx} ${cy} L${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}" stroke="#bfe3ff" stroke-width="2" filter="url(#glow)"/>`;
  if (mode === 'blip') g += `<circle cx="${cx + r * .42}" cy="${cy - r * .28}" r="${r * .22}" fill="#9fd4ff" opacity=".55" filter="url(#g8)" stroke="none"/><circle cx="${cx + r * .42}" cy="${cy - r * .28}" r="${r * .09}" fill="#dff0ff" filter="url(#g4)" stroke="none"/><text x="${cx + r * .42}" y="${cy - r * .28 + 10}" text-anchor="middle" font-family="Spectral,serif" font-size="30" fill="#dff0ff" opacity=".9" stroke="none" filter="url(#g4)">?</text>`;
  else g += `<g transform="translate(${cx + r * .42} ${cy - r * .28}) scale(.1)" stroke="none"><path d="M-300 20 H300 L330 20 L280 80 H-250 Z" fill="#dff0ff"/><rect x="-260" y="-90" width="440" height="110" fill="#dff0ff" opacity=".85"/><rect x="-250" y="-190" width="140" height="100" fill="#dff0ff"/></g><circle cx="${cx + r * .42}" cy="${cy - r * .28}" r="${r * .28}" stroke="#9fd4ff" stroke-width="1.6" opacity=".9" filter="url(#glow)"/>`;
  return g;
}
function sea11(stage) { // stage 0: both dark; 1: first ship's lights on
  let g = `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#03070b"/><stop offset=".55" stop-color="#0d1c2a"/><stop offset="1" stop-color="#122a3d"/></linearGradient><linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f2536"/><stop offset=".25" stop-color="#07131d"/><stop offset="1" stop-color="#03070b"/></linearGradient></defs>`;
  g += `<rect width="1920" height="620" fill="url(#sky)" stroke="none"/><rect y="620" width="1920" height="460" fill="url(#sea)" stroke="none"/>`;
  g += `<ellipse cx="960" cy="610" rx="900" ry="70" fill="${BLUE}" opacity=".34" filter="url(#g70)" stroke="none"/>`;
  for (let i = 0; i < 80; i++) g += `<circle cx="${(rnd() * 1920).toFixed(0)}" cy="${(rnd() * 420).toFixed(0)}" r="${(0.6 + rnd() * 1.1).toFixed(1)}" fill="#dff0ff" opacity="${(0.1 + rnd() * 0.35).toFixed(2)}" stroke="none"/>`;
  // far ship B (hidden): faint silhouette in fog, facing left
  g += `<g opacity="${stage ? .5 : .75}" filter="url(#g4)">${ship(1760, 640, 0.52, true, false)}</g>`;
  // far fog bank (behind the near ship)
  for (let i = 0; i < 7; i++) g += `<ellipse cx="${(-100 + i * 330).toFixed(0)}" cy="${(600 + (i % 3) * 22)}" rx="${330 + (i % 2) * 60}" ry="${52 + (i % 3) * 14}" fill="#8fb6d6" opacity=".2" filter="url(#g40)" stroke="none"/>`;
  // sea reflection lines
  for (let i = 0; i < 46; i++) { const y = 636 + i * i * .17 + i * 3, w = 40 + rnd() * 260 * (1 + i / 30), x = rnd() * 1920; g += `<path d="M${x.toFixed(0)} ${y.toFixed(0)} h${w.toFixed(0)}" stroke="#6f9bc0" stroke-width="${(0.8 + i / 30).toFixed(1)}" opacity="${(0.07 + rnd() * 0.1).toFixed(2)}"/>`; }
  // near ship A: left, bow to the right
  g += `<g opacity=".2" transform="translate(0 1260) scale(1 -1)" filter="url(#g8)">${ship(110, 700, 1.06, false, !!stage)}</g>`;
  g += ship(110, 700, 1.06, false, !!stage);
  // near fog drifting across (parallax layer 2)
  for (let i = 0; i < 6; i++) g += `<ellipse cx="${(80 + i * 360)}" cy="${(700 + (i % 2) * 60)}" rx="420" ry="${64 + (i % 3) * 16}" fill="#9fc3df" opacity="${stage ? .11 : .15}" filter="url(#g40)" stroke="none"/>`;
  g += `<rect x="0" y="560" width="1920" height="130" fill="#a9c9e2" opacity=".07" filter="url(#g70)" stroke="none"/>`;
  g += `<ellipse cx="960" cy="1010" rx="1100" ry="110" fill="#9fc3df" opacity=".1" filter="url(#g70)" stroke="none"/>`;
  // radars: each captain's own screen. A's radar (left) always shows only a blurred blip of B; B's radar (right) is crisp once A shows its lights.
  g += radar(300, 905, 92, 'blip') + radar(1620, 905, 92, stage ? 'crisp' : 'blip');
  return SV(g);
}

// ---------------------------------------------------------------- app pieces (real screenshots)
const veil = (a) => `<div class="abs" style="inset:0;background:rgba(240,246,251,${a})"></div>`;
const appBlur = (file, blur, a) => `<div class="abs" style="left:-40px;top:-40px;width:2000px;height:1160px;overflow:hidden;filter:blur(${blur}px)"><img src="${b64(file)}" style="width:2000px;height:1250px;display:block"></div>${veil(a)}`;
// the row card: real row.png at scale RS, position (RX,RY); lit(box) places the same pixels again on top, glowing
const RS = 0.86, RX = 209, RY = 310;
const rowCard = () => `<div class="shot" style="left:${RX}px;top:${RY}px;width:${1788 * RS}px;height:${390 * RS}px"><img src="${b64('row.png')}" style="width:100%;display:block"><div class="abs" style="inset:0;background:rgba(240,246,251,.58)"></div></div>`;
function lit(x, y, w, h, pad = 5) { // x,y,w,h in row.png pixels
  const L = RX + (x - pad) * RS, T = RY + (y - pad) * RS, W = (w + 2 * pad) * RS, H = (h + 2 * pad) * RS;
  return `<div class="abs" style="left:${L}px;top:${T}px;width:${W}px;height:${H}px;border-radius:12px;overflow:hidden;background:#f6fbff;box-shadow:0 0 0 2px ${BLUE},0 0 26px 6px rgba(95,163,214,.75),0 0 90px 18px rgba(95,163,214,.4)"><img src="${b64('row.png')}" style="position:absolute;width:${1788 * RS}px;left:${-(x - pad) * RS}px;top:${-(y - pad) * RS}px;filter:contrast(1.25) saturate(1.2)"></div>`;
}
const covered = () => { // the two spots in the Mailbox that show the plural: covered, nothing readable under them
  return `<div class="abs" style="left:780px;top:10px;width:360px;height:74px;background:rgb(29,74,109)"></div>` +
    `<div class="abs" style="left:296px;top:314px;width:300px;height:44px;background:rgb(240,246,251)"></div>`;
};

// ---------------------------------------------------------------- act 5: the diagram
function operator() {
  const cx = 960, cy = 470, L = [320, 470], R = [1600, 470];
  let g = `<defs><radialGradient id="core" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#eaf2f9"/><stop offset="1" stop-color="#c9dcec"/></radialGradient>
  <linearGradient id="trailR" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${GLOWB}" stop-opacity="0"/><stop offset="1" stop-color="${GLOWB}" stop-opacity=".9"/></linearGradient>
  <linearGradient id="trailL" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="${GLOWB}" stop-opacity="0"/><stop offset="1" stop-color="${GLOWB}" stop-opacity=".9"/></linearGradient></defs>`;
  g += `<ellipse cx="${cx}" cy="${cy}" rx="760" ry="230" fill="${GLOWB}" opacity=".16" filter="url(#g70)" stroke="none"/>`;
  // lanes: upper left to right, lower right to left
  for (const y of [446, 494]) g += `<path d="M${L[0] + 66} ${y} H${cx - 150}" stroke="${LINE}" stroke-width="2"/><path d="M${cx + 150} ${y} H${R[0] - 66}" stroke="${LINE}" stroke-width="2"/>`;
  g += `<path d="M386 446 H760" stroke="${GLOWB}" stroke-width="10" opacity=".5" filter="url(#g8)"/><path d="M386 446 H760" stroke="${BLUE}" stroke-width="3"/>`;
  g += `<path d="M1110 446 H1470" stroke="${GLOWB}" stroke-width="10" opacity=".5" filter="url(#g8)"/><path d="M1110 446 H1470" stroke="${BLUE}" stroke-width="3"/>`;
  g += `<path d="M1534 494 H1230" stroke="${GLOWB}" stroke-width="8" opacity=".4" filter="url(#g8)"/><path d="M1534 494 H1230" stroke="${BLUE}" stroke-width="2.4" stroke-dasharray="2 8"/>`;
  g += `<path d="M810 494 H386" stroke="${LINE}" stroke-width="2.4" stroke-dasharray="2 8"/>`;
  // trails behind the envelopes
  g += `<rect x="470" y="438" width="260" height="16" fill="url(#trailR)" filter="url(#g4)" stroke="none"/><rect x="1260" y="438" width="170" height="16" fill="url(#trailR)" filter="url(#g4)" stroke="none"/><rect x="1260" y="486" width="190" height="16" fill="url(#trailL)" opacity=".0" stroke="none"/>`;
  // centre: pulses on receive and forward
  for (const [r, o] of [[260, .1], [215, .2], [178, .38]]) g += `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${GLOWB}" stroke-width="2" opacity="${o}"/>`;
  g += `<circle cx="${cx}" cy="${cy}" r="170" fill="${GLOWB}" opacity=".28" filter="url(#g40)" stroke="none"/><circle cx="${cx}" cy="${cy}" r="150" fill="url(#core)" stroke="#fff" stroke-width="3"/><circle cx="${cx}" cy="${cy}" r="150" stroke="${BLUE}" stroke-width="2.6" filter="url(#softglow)"/><circle cx="${cx}" cy="${cy}" r="134" stroke="${LINE}" stroke-width="1.2"/>`;
  // member rings: anonymous glyphs, soft
  for (const [x, y] of [L, R]) g += `<circle cx="${x}" cy="${y}" r="92" fill="${GLOWB}" opacity=".24" filter="url(#g16)" stroke="none"/><circle cx="${x}" cy="${y}" r="66" fill="url(#core)" stroke="${INK}" stroke-width="1.8"/><circle cx="${x}" cy="${y - 14}" r="16" fill="${LINE}" stroke="none" filter="url(#g4)"/><path d="M${x - 30} ${y + 34} Q${x} ${y - 10} ${x + 30} ${y + 34} Z" fill="${LINE}" stroke="none" filter="url(#g4)"/>`;
  // envelopes: glowing
  const env = (x, y, c, s = 1) => `<g transform="translate(${x - 34 * s} ${y - 23 * s}) scale(${s})"><rect x="-8" y="-8" width="84" height="62" rx="12" fill="${GLOWB}" opacity=".6" filter="url(#g8)" stroke="none"/><rect width="68" height="46" rx="5" fill="#fff" stroke="${c}" stroke-width="2.4"/><path d="M0 5 L34 28 L68 5" stroke="${c}" stroke-width="2.2"/></g>`;
  g += env(740, 446, BLUE) + env(1440, 446, BLUE) + env(1250, 494, SLATE, 0.8);
  return SV(g);
}

// ---------------------------------------------------------------- act 6: hands
// tapered limb along a quadratic curve (fingers, thumb): polygon with a round tip
function limb(p0, p1, p2, w0, w1, fill, edge = '#7e97ae') {
  const N = 28, L = [], R = [], q = (t) => [(1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]];
  for (let i = 0; i <= N; i++) { const t = i / N, [x, y] = q(t), [x2, y2] = q(Math.min(1, t + .01)), [x1, y1] = q(Math.max(0, t - .01)); let dx = x2 - x1, dy = y2 - y1; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; const w = (w0 + (w1 - w0) * t) / 2; L.push([x - dy * w, y + dx * w]); R.push([x + dy * w, y - dx * w]); }
  const d = 'M' + L.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join('L') + 'A' + (w1 / 2) + ' ' + (w1 / 2) + ' 0 0 0 ' + R[N].map((v) => v.toFixed(1)).join(' ') + 'L' + R.reverse().slice(1).map((p) => p.map((v) => v.toFixed(1)).join(' ')).join('L') + 'Z';
  return `<path d="${d}" fill="${fill}" stroke="${edge}" stroke-width="1.8"/>`;
}
function hands11(dy = 0) {
  let g = `<defs>
  <linearGradient id="hl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbfdff"/><stop offset=".45" stop-color="#dde8f3"/><stop offset="1" stop-color="#a3bacf"/></linearGradient>
  <linearGradient id="hr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3f7fb"/><stop offset=".5" stop-color="#cfdeec"/><stop offset="1" stop-color="#94adc5"/></linearGradient>
  <linearGradient id="hf" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b9cde0"/><stop offset=".55" stop-color="#eef4fa"/><stop offset="1" stop-color="#dbe7f2"/></linearGradient>
  <linearGradient id="slL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b7db5"/><stop offset="1" stop-color="#1b4a70"/></linearGradient>
  <linearGradient id="slR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d3b49"/><stop offset="1" stop-color="#0f1822"/></linearGradient>
  <linearGradient id="cuff" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e8eff6"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#d4e0ec"/></linearGradient></defs>`;
  g += `<g transform="translate(0 ${dy})">`;
  g += `<ellipse cx="960" cy="700" rx="640" ry="34" fill="${INK}" opacity=".16" filter="url(#g40)" stroke="none"/>`;
  const sleeve = (x, sgn, grad, rim) => `<g transform="translate(${x} 480) scale(${sgn} 1) rotate(${-5})"><path d="M-1000 -112 L-50 -88 L-50 88 L-1000 120 Z" fill="url(#${grad})" stroke="${rim}" stroke-width="1.5"/><path d="M-900 -104 C-500 -84 -200 -66 -50 -64" stroke="#fff" stroke-opacity=".22" stroke-width="3"/><rect x="-58" y="-94" width="66" height="188" rx="14" fill="url(#cuff)" stroke="#aebfd0" stroke-width="1.5"/><circle cx="-22" cy="60" r="8" fill="#c9a45c" stroke="#8a6f35" stroke-width="1.5"/></g>`;
  g += sleeve(590, 1, 'slL', '#0f2f4a') + sleeve(1330, -1, 'slR', '#05090e');
  // left hand: back of the hand with knuckle ridge; wrist narrow, palm broad
  g += `<path d="M600 430 C680 408 750 396 820 388 C930 384 1010 400 1030 450 C1044 500 1020 548 960 574 C880 600 740 584 600 556 Z" fill="url(#hl)" stroke="#8da5bb" stroke-width="1.8"/>`;
  g += `<path d="M640 432 C700 418 780 410 860 408" stroke="#fff" stroke-width="7" opacity=".6" filter="url(#g4)"/><path d="M880 392 Q900 430 886 470 M936 392 Q956 432 942 472" stroke="#9db5cb" stroke-width="1.6" opacity=".7"/>`;
  // right hand: back of the hand toward the clasp; its fingers wrap over the left hand
  g += `<path d="M1320 436 C1260 416 1190 398 1140 392 C1060 390 1010 404 996 440 C986 490 1000 540 1050 566 C1130 598 1240 590 1320 560 Z" fill="url(#hr)" stroke="#8da5bb" stroke-width="1.8"/>`;
  g += `<path d="M1300 440 C1250 424 1200 414 1150 410" stroke="#fff" stroke-width="6" opacity=".45" filter="url(#g4)"/>`;
  // fingers (tapered, curling down and back), knuckles at about x=1010
  const F = [[404, 0, 176], [454, 6, 190], [504, 10, 182], [552, 14, 150]];
  for (const [y, dx, len] of F.slice().reverse()) {
    g += `<g filter="url(#softglow)" opacity=".0"></g><path d="M1020 ${y + 6} C ${960 - dx} ${y - 8} ${900 - dx} ${y - 2} ${1020 - len} ${y + 40}" stroke="#15202b" stroke-width="2" opacity=".14" transform="translate(-4 6)"/>`;
    g += limb([1030, y], [960 - dx, y - 12], [1030 - len, y + 38], 50, 36, 'url(#hf)');
    g += `<path d="M${1030 - len * .6} ${y - 14} C${1030 - len * .8} ${y - 12} ${1030 - len * .92} ${y + 6} ${1030 - len * .94} ${y + 22}" stroke="#fff" stroke-width="3" opacity=".7"/><path d="M${1030 - len * .3} ${y - 22} V${y + 8}" stroke="#8da5bb" stroke-width="1.4" opacity=".7"/>`;
  }
  // left thumb across the back of the right hand, with its nail
  g += limb([700, 410], [840, 330], [1060, 380], 58, 44, 'url(#hl)') + `<path d="M720 392 C810 336 930 332 1030 372" stroke="#fff" stroke-width="6" opacity=".75"/><ellipse cx="1034" cy="384" rx="20" ry="13" transform="rotate(30 1034 384)" fill="#fff" stroke="#9db5cb" stroke-width="1.4" opacity=".9"/>`;
  g += '</g>';
  g += `<circle cx="1000" cy="${480 + dy}" r="300" fill="url(#rgBlue)" opacity=".5" stroke="none"/><circle cx="1000" cy="${470 + dy}" r="110" fill="url(#rgWhite)" stroke="none" opacity=".75"/>`;
  g += `<path d="M1000 ${330 + dy} V${610 + dy} M860 ${470 + dy} H1140" stroke="#fff" stroke-width="2" opacity=".6" filter="url(#glow)"/>`;
  for (let i = 0; i < 26; i++) { const a = rnd() * 6.283, d = 140 + rnd() * 330; g += `<circle cx="${(1000 + Math.cos(a) * d * 1.5).toFixed(0)}" cy="${(470 + dy + Math.sin(a) * d * .5).toFixed(0)}" r="${(1.5 + rnd() * 3.5).toFixed(1)}" fill="#fff" opacity="${(0.4 + rnd() * .5).toFixed(2)}" filter="url(#g4)" stroke="none"/>`; }
  return SV(g);
}

// ---------------------------------------------------------------- act 7: fountain pen and signature
function signing11() {
  let g = `<defs>
  <linearGradient id="barrel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0c1824"/><stop offset=".3" stop-color="#2b5f8c"/><stop offset=".45" stop-color="#3f7fb2"/><stop offset=".7" stop-color="#17364f"/><stop offset="1" stop-color="#08111a"/></linearGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a6f35"/><stop offset=".35" stop-color="#f3dc9b"/><stop offset=".6" stop-color="#c9a45c"/><stop offset="1" stop-color="#6e5726"/></linearGradient>
  <linearGradient id="ink" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1b3f6b"/><stop offset="1" stop-color="#27618f"/></linearGradient>
  <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#eef4fa"/></linearGradient></defs>`;
  g += `<ellipse cx="960" cy="470" rx="640" ry="330" fill="${GLOWB}" opacity=".3" filter="url(#g70)" stroke="none"/>`;
  g += `<rect x="540" y="150" width="840" height="680" rx="8" fill="#15202b" opacity=".2" filter="url(#g40)" stroke="none" transform="translate(14 36)"/>`;
  g += `<rect x="540" y="130" width="840" height="680" rx="8" fill="url(#paper)" stroke="${LINE}" stroke-width="1.5"/>`;
  g += `<circle cx="1230" cy="250" r="54" stroke="${LINE}" stroke-width="2"/><circle cx="1230" cy="250" r="42" stroke="${LINE}" stroke-width="1"/>`;
  for (let i = 0; i < 6; i++) g += `<path d="M620 ${210 + i * 52} H${[1100, 1140, 960, 1120, 1060, 700][i]}" stroke="${LINE}" stroke-width="2.4" opacity=".9"/>`;
  g += `<path d="M620 700 H1120" stroke="${SLATE}" stroke-width="1.4"/><path d="M620 700 V680 M1120 700 V680" stroke="${SLATE}" stroke-width="1"/>`;
  const sig = 'M650 690 C690 590 720 570 742 640 C758 700 778 600 826 596 C868 594 846 690 896 664 C930 646 934 604 972 628 C1002 648 1036 690 1098 646';
  g += `<path d="${sig}" stroke="${BLUE}" stroke-width="9" opacity=".25" filter="url(#g4)"/><path d="${sig}" stroke="url(#ink)" stroke-width="4.6"/><path d="${sig}" stroke="#7fb4e0" stroke-width="1.4" opacity=".8" transform="translate(-1 -1.5)"/>`;
  g += `<path d="M640 742 C780 718 960 724 1120 706" stroke="url(#ink)" stroke-width="2.6" opacity=".85"/>`;
  g += `<circle cx="1098" cy="646" r="14" fill="url(#rgBlue)" stroke="none"/><circle cx="1099" cy="646" r="4" fill="#cfe8fb" stroke="none"/>`;
  // pen: tip at (1098,646), leaning 38 degrees to the right
  const pen = `<g transform="translate(1098 646) rotate(38)">
  <path d="M-16 -86 L0 0 L16 -86 Q0 -100 -16 -86 Z" fill="url(#gold)" stroke="#6e5726" stroke-width="1.4"/><path d="M0 -4 V-70" stroke="#4a3a15" stroke-width="1.6"/><circle cx="0" cy="-62" r="4.4" fill="#4a3a15" stroke="none"/>
  <path d="M-22 -90 L-17 -96 L17 -96 L22 -90 L24 -178 Q0 -190 -24 -178 Z" fill="#101b27" stroke="#2c4155" stroke-width="1.4"/><path d="M-9 -96 L-9 -176" stroke="#fff" stroke-width="2.4" opacity=".4"/>
  <rect x="-26" y="-192" width="52" height="14" rx="3" fill="url(#gold)" stroke="#6e5726"/><rect x="-26" y="-212" width="52" height="8" rx="3" fill="url(#gold)" stroke="#6e5726"/>
  <path d="M-27 -214 H27 L29 -560 Q0 -580 -29 -560 Z" fill="url(#barrel)" stroke="#06101a" stroke-width="1.6"/>
  <path d="M-17 -240 V-540" stroke="#fff" stroke-width="5" opacity=".5" filter="url(#g4)"/><path d="M-17 -240 V-540" stroke="#fff" stroke-width="1.6" opacity=".7"/>
  <path d="M29 -330 H40 Q47 -330 47 -322 V-470 Q47 -478 40 -478 H29" fill="url(#gold)" stroke="#6e5726" stroke-width="1.4"/>
  <rect x="-29" y="-560" width="58" height="16" rx="3" fill="url(#gold)" stroke="#6e5726"/></g>`;
  g += `<g transform="translate(26 40)" opacity=".24" filter="url(#g8)">${pen.replace(/url\(#[a-z]+\)/g, INK)}</g>`;
  g += pen;
  for (let i = 0; i < 18; i++) g += `<circle cx="${(rnd() * 1920).toFixed(0)}" cy="${(rnd() * 1080).toFixed(0)}" r="${(10 + rnd() * 30).toFixed(0)}" fill="#fff" opacity="${(0.15 + rnd() * .2).toFixed(2)}" filter="url(#g8)" stroke="none"/>`;
  return SV(g);
}

// ======================================================================== v12 replacements: act 2 ships, act 6 hands, act 7 signature
let seed12 = 12345; const r12 = () => { seed12 |= 0; seed12 = (seed12 + 0x6D2B79F5) | 0; let t = Math.imul(seed12 ^ (seed12 >>> 15), 1 | seed12); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// soft 3D rounding for any filled shape: diffuse shading from a blurred alpha height-map plus a specular rim, lit from the upper left
const bevelDef = (id, std, surf, diff, spec) => `<filter id="${id}" x="-6%" y="-6%" width="112%" height="112%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="${std}" result="b"/>
<feDiffuseLighting in="b" surfaceScale="${surf}" diffuseConstant="${diff}" lighting-color="#fff" result="d"><feDistantLight azimuth="225" elevation="55"/></feDiffuseLighting>
<feComposite in="SourceGraphic" in2="d" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="lit"/>
<feSpecularLighting in="b" surfaceScale="${surf}" specularConstant=".8" specularExponent="26" lighting-color="#fff" result="s"><feDistantLight azimuth="225" elevation="40"/></feSpecularLighting>
<feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/><feComposite in="lit" in2="s2" operator="arithmetic" k1="0" k2="1" k3="${spec}" k4="0"/></filter>`;
const BEVEL = bevelDef('bevel', 8, 7, 1.2, .5) + bevelDef('bevelF', 4, 5, 1.1, .22) + bevelDef('bevelS', 9, 6, .8, .12);
const fogDef = (id, y, h, sd, freq, rgb = '.62 .78 .9') => { const [r, g2, b] = rgb.split(' '); return `<linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient><filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="4" seed="${sd}"/><feColorMatrix type="matrix" values="0 0 0 0 ${r}  0 0 0 0 ${g2}  0 0 0 0 ${b}  0 0 0 2.4 -.7"/></filter><mask id="${id}m" maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080"><rect x="0" y="${y}" width="1920" height="${h}" fill="url(#${id}g)"/></mask>`; };
const fogUse = (id, op, dx = 0) => `<g mask="url(#${id}m)" opacity="${op}"><rect x="${dx}" width="2200" height="1080" filter="url(#${id})" stroke="none" fill="#000"/></g>`;
const CONT = ['#27618f', '#b3423a', '#22744a', '#c18a2e', '#52677a', '#8a5a9a'];

function ship12(id, x, y, sc, lit) {
  const lamps = [];
  const P = (lx, ly) => [x + lx * sc, y + ly * sc];
  const hull = 'M0 -92 H742 Q792 -100 816 -124 L764 -22 Q748 0 704 0 H44 Q10 0 4 -42 Z';
  let g = `<g transform="translate(${x} ${y}) scale(${sc})"><defs><clipPath id="hc${id}"><path d="${hull}"/></clipPath>
  <linearGradient id="hg${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lit ? '#2b465f' : '#16232f'}"/><stop offset=".55" stop-color="${lit ? '#16293a' : '#0a131c'}"/><stop offset="1" stop-color="${lit ? '#0a121a' : '#04080c'}"/></linearGradient>
  <linearGradient id="sg${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lit ? '#35506a' : '#152330'}"/><stop offset="1" stop-color="${lit ? '#16222e' : '#080f16'}"/></linearGradient></defs>`;
  g += `<path d="${hull}" fill="url(#hg${id})" stroke="${lit ? '#86a8c4' : '#27394b'}" stroke-width="2"/>`;
  g += `<g clip-path="url(#hc${id})"><rect x="0" y="-27" width="830" height="30" fill="${lit ? '#7a2a30' : '#3c1519'}"/><rect x="0" y="-27" width="830" height="3" fill="#fff" opacity="${lit ? .22 : .07}"/><rect x="0" y="-80" width="830" height="14" fill="#fff" opacity="${lit ? .1 : .035}"/><rect x="0" y="-92" width="830" height="4" fill="#bcd6ea" opacity="${lit ? .45 : .14}"/></g>`;
  for (let i = 0; i < 60; i++) g += `<path d="M${14 + i * 12} -92 v-9" stroke="${lit ? '#9bb9d0' : '#22364a'}" stroke-width="1" opacity=".7"/>`;
  g += `<path d="M10 -101 H760" stroke="${lit ? '#9bb9d0' : '#22364a'}" stroke-width="1.2" opacity=".7"/>`;
  // superstructure (stern)
  const blk = (bx, by, w, h) => `<rect x="${bx}" y="${by}" width="${w}" height="${h}" fill="url(#sg${id})" stroke="${lit ? '#86a8c4' : '#25384a'}" stroke-width="1.6"/>`;
  g += blk(28, -196, 170, 104) + blk(38, -252, 150, 56) + blk(20, -286, 178, 34) + `<rect x="200" y="-262" width="38" height="170" fill="url(#sg${id})" stroke="${lit ? '#86a8c4' : '#25384a'}" stroke-width="1.4"/><rect x="200" y="-246" width="38" height="14" fill="${lit ? '#27618f' : '#0f2233'}"/>`;
  g += `<path d="M112 -286 V-352 M84 -330 H140 M112 -352 l18 -8" stroke="${lit ? '#a9c4d9' : '#2a4054'}" stroke-width="2.4"/><rect x="92" y="-306" width="40" height="6" fill="${lit ? '#a9c4d9' : '#22364a'}"/>`;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 7; c++) g += `<rect x="${40 + c * 22}" y="${-180 + r * 30}" width="14" height="10" fill="${lit ? '#fff1c4' : '#0e1c29'}"/>`;
  for (let c = 0; c < 6; c++) g += `<rect x="${50 + c * 22}" y="-236" width="14" height="10" fill="${lit ? '#fff1c4' : '#0e1c29'}"/>`;
  g += `<rect x="26" y="-278" width="162" height="12" fill="${lit ? '#fff1c4' : '#0e1c29'}"/>`;
  // containers: front face + top face, three bays
  for (let row = 0; row < 4; row++) for (let c = 0; c < 9; c++) {
    if (row === 3 && (c < 1 || c > 7)) continue; const cx = 250 + c * 50 + (c > 2 ? 4 : 0) + (c > 5 ? 4 : 0), cy = -92 - 32 * (row + 1), col = CONT[(c * 3 + row * 2) % CONT.length], top = row === 3 || (row === 2 && (c < 1 || c > 7));
    if (lit) { g += `<rect x="${cx}" y="${cy}" width="46" height="30" fill="${col}"/><rect x="${cx}" y="${cy}" width="46" height="30" fill="url(#wl)" opacity=".5"/><path d="M${cx + 11} ${cy} V${cy + 30} M${cx + 23} ${cy} V${cy + 30} M${cx + 35} ${cy} V${cy + 30}" stroke="#000" stroke-opacity=".28"/><rect x="${cx}" y="${cy}" width="46" height="2" fill="#fff" opacity=".5"/>`; if (top) g += `<path d="M${cx} ${cy} L${cx + 10} ${cy - 8} H${cx + 56} L${cx + 46} ${cy} Z" fill="${col}" opacity=".85"/><path d="M${cx} ${cy} L${cx + 10} ${cy - 8} H${cx + 56} L${cx + 46} ${cy}" stroke="#fff" stroke-opacity=".4"/>`; }
    else { g += `<rect x="${cx}" y="${cy}" width="46" height="30" fill="#0a141d" stroke="#1b2d3d"/><path d="M${cx + 11} ${cy} V${cy + 30} M${cx + 23} ${cy} V${cy + 30} M${cx + 35} ${cy} V${cy + 30}" stroke="#16273a" stroke-opacity=".8"/>`; if (top) g += `<path d="M${cx} ${cy} L${cx + 10} ${cy - 8} H${cx + 56} L${cx + 46} ${cy} Z" fill="#101f2c" stroke="#1d3144"/>`; }
  }
  // lamps
  const lampPts = [[262, -104], [372, -104], [482, -104], [592, -104], [702, -104], [20, -300], [112, -352]];
  for (const [lx, ly] of lampPts) lamps.push(P(lx, ly));
  g += '</g>';
  return { svg: g, lamps, P };
}
function lampsOn(lamps, sc) { // halos (drawn after the fog so the light glows through it)
  let g = '';
  lamps.forEach(([lx, ly], i) => { const R = (i < 5 ? 120 : 90) * sc; g += `<circle cx="${lx}" cy="${ly}" r="${R * 1.8}" fill="url(#rgWarm)" opacity=".42" stroke="none"/><circle cx="${lx}" cy="${ly}" r="${R * .55}" fill="url(#rgWarm)" stroke="none"/><circle cx="${lx}" cy="${ly}" r="${5 * sc}" fill="#fff" stroke="none"/>`; });
  return g;
}
function radar12(cx, cy, r, mode) {
  let g = `<circle cx="${cx}" cy="${cy}" r="${r * 1.55}" fill="#5fb7e8" opacity=".16" filter="url(#g40)" stroke="none"/><circle cx="${cx}" cy="${cy}" r="${r + 16}" fill="#0a131c" stroke="#35506a" stroke-width="3"/><circle cx="${cx}" cy="${cy}" r="${r + 16}" stroke="#9fc3df" stroke-width="1.2" opacity=".5" transform="rotate(-30 ${cx} ${cy})" stroke-dasharray="120 900"/>`;
  g += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#04141f" stroke="#7cc4f0" stroke-width="1.6"/>`;
  for (const f of [.25, .5, .75]) g += `<circle cx="${cx}" cy="${cy}" r="${r * f}" stroke="#7cc4f0" stroke-width="1" opacity=".38"/>`;
  g += `<path d="M${cx - r} ${cy} H${cx + r} M${cx} ${cy - r} V${cy + r}" stroke="#7cc4f0" stroke-width="1" opacity=".3"/>`;
  for (let k = 0; k < 36; k++) { const a = k * Math.PI / 18, l = k % 3 ? 7 : 14; g += `<path d="M${cx + Math.cos(a) * (r - l)} ${cy + Math.sin(a) * (r - l)} L${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r}" stroke="#9fd8ff" stroke-width="1.2" opacity=".6"/>`; }
  const a0 = -52 * Math.PI / 180;
  for (let k = 0; k < 8; k++) { const aa = a0 - k * 0.2, ab = a0 - (k + 1) * 0.2; g += `<path d="M${cx} ${cy} L${cx + r * Math.cos(aa)} ${cy + r * Math.sin(aa)} A${r} ${r} 0 0 0 ${cx + r * Math.cos(ab)} ${cy + r * Math.sin(ab)} Z" fill="#5fd0ff" opacity="${(0.42 * (1 - k / 8)).toFixed(3)}" stroke="none"/>`; }
  g += `<path d="M${cx} ${cy} L${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)}" stroke="#c9f0ff" stroke-width="2.6" filter="url(#glow)"/>`;
  const bx = cx + r * .44, by = cy - r * .34;
  if (mode === 'blip') g += `<circle cx="${bx}" cy="${by}" r="${r * .26}" fill="#7cc4f0" opacity=".5" filter="url(#g8)" stroke="none"/><circle cx="${bx}" cy="${by}" r="${r * .1}" fill="#e9f7ff" filter="url(#g4)" stroke="none"/><text x="${bx}" y="${by + 11}" text-anchor="middle" font-family="Spectral,serif" font-size="32" fill="#e9f7ff" opacity=".92" stroke="none" filter="url(#g4)">?</text>`;
  else g += `<circle cx="${bx}" cy="${by}" r="${r * .3}" stroke="#9fd8ff" stroke-width="1.6" filter="url(#glow)"/><g transform="translate(${bx} ${by}) scale(.1)" stroke="none" filter="url(#g4)"><path d="M-300 20 H300 L330 20 L280 80 H-250 Z" fill="#e9f7ff"/><rect x="-260" y="-90" width="440" height="110" fill="#e9f7ff" opacity=".9"/><rect x="-250" y="-190" width="140" height="100" fill="#e9f7ff"/></g>`;
  return g;
}
function sea12(stage) {
  const lit = !!stage; const WL = 742, SC = 1.5, X0 = 70;
  let g = `<defs>${BEVEL}<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#02050a"/><stop offset=".6" stop-color="#0b1a28"/><stop offset="1" stop-color="#16324a"/></linearGradient>
  <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#143049"/><stop offset=".18" stop-color="#091a29"/><stop offset="1" stop-color="#02050a"/></linearGradient>
  <linearGradient id="wl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".18"/></linearGradient>
  <linearGradient id="rf" gradientUnits="userSpaceOnUse" x1="0" y1="${WL}" x2="0" y2="${WL + 280}"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
  <mask id="rfm" maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080"><rect x="0" y="${WL}" width="1920" height="340" fill="url(#rf)"/></mask>
  <filter id="rip" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="turbulence" baseFrequency="0.0025 0.09" numOctaves="2" seed="4" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="26" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="2.5"/></filter>
  ${fogDef('fb', 470, 330, 3, '0.0035 0.011')}${fogDef('fm', 600, 260, 8, '0.004 0.014')}${fogDef('ff', 880, 260, 15, '0.003 0.01')}</defs>`;
  g += `<rect width="1920" height="620" fill="url(#sky)" stroke="none"/><rect y="620" width="1920" height="460" fill="url(#sea)" stroke="none"/>`;
  g += `<ellipse cx="960" cy="616" rx="1000" ry="80" fill="#2a6fa8" opacity=".5" filter="url(#g70)" stroke="none"/><rect x="0" y="612" width="1920" height="3" fill="#9fc3df" opacity=".22" filter="url(#g4)" stroke="none"/>`;
  for (let i = 0; i < 90; i++) g += `<circle cx="${(r12() * 1920).toFixed(0)}" cy="${(r12() * 430).toFixed(0)}" r="${(0.6 + r12() * 1.1).toFixed(1)}" fill="#dff0ff" opacity="${(0.08 + r12() * 0.3).toFixed(2)}" stroke="none"/>`;
  // far ship (hidden): small, in the fog, bow to the left
  const far = ship12('far', 1790, 640, 0.5, false);
  g += `<g opacity=".6" filter="url(#g4)" transform="translate(3580 0) scale(-1 1)">${far.svg}</g>`;
  g += fogUse('fb', .55, -80);
  // waves in perspective
  for (let i = 0; i < 70; i++) { const y = 628 + Math.pow(i / 70, 1.7) * 450, w = 60 + r12() * 340 * (0.5 + i / 40), x = r12() * 1920; g += `<path d="M${x.toFixed(0)} ${y.toFixed(0)} h${w.toFixed(0)}" stroke="#7fb0d8" stroke-width="${(0.7 + i / 35).toFixed(1)}" opacity="${(0.05 + r12() * 0.1).toFixed(2)}"/>`; }
  // near ship, its reflection and the light glitter
  const near = ship12('near', X0, WL, SC, lit);
  g += `<g mask="url(#rfm)" opacity="${lit ? .5 : .3}"><g filter="url(#rip)"><g transform="translate(0 ${2 * WL}) scale(1 -1)">${ship12('nearr', X0, WL, SC, lit).svg}</g></g></g>`;
  if (lit) near.lamps.forEach(([lx]) => { for (let k = 0; k < 16; k++) { const w = (36 - k * 1.8) * (0.6 + r12() * .6); g += `<rect x="${(lx - w / 2 + (r12() - .5) * 14).toFixed(0)}" y="${(WL + 10 + k * 15)}" width="${Math.max(4, w).toFixed(0)}" height="2.4" fill="#ffe9a8" opacity="${(0.65 * (1 - k / 17)).toFixed(2)}" stroke="none"/>`; } });
  g += `<g filter="url(#bevelS)">${near.svg}</g>`;
  g += `<ellipse cx="${X0 + 816 * SC}" cy="${WL - 4}" rx="130" ry="14" fill="#cfe6f6" opacity="${lit ? .5 : .3}" filter="url(#g8)" stroke="none"/><ellipse cx="${X0 + 60}" cy="${WL + 6}" rx="150" ry="10" fill="#cfe6f6" opacity=".18" filter="url(#g8)" stroke="none"/>`;
  g += fogUse('fm', lit ? .5 : .62, 60);
  if (lit) { // light shafts and the lamps glowing through the fog
    for (const [lx, ly] of near.lamps.slice(0, 5)) g += `<path d="M${lx - 6} ${ly} L${lx - 70} ${ly - 330} L${lx + 70} ${ly - 330} L${lx + 6} ${ly} Z" fill="url(#rgWarm)" opacity=".16" filter="url(#g16)" stroke="none"/>`;
    g += `<ellipse cx="${X0 + 450 * SC}" cy="${WL - 150}" rx="620" ry="210" fill="#ffd98a" opacity=".2" filter="url(#g70)" stroke="none"/>` + lampsOn(near.lamps, SC);
  } else { // navigation lights only: barely there
    const [mx, my] = near.P(112, -352), [bx, by] = near.P(800, -122);
    g += `<circle cx="${mx}" cy="${my}" r="26" fill="url(#rgWhite)" opacity=".55" stroke="none"/><circle cx="${mx}" cy="${my}" r="4" fill="#fff" stroke="none"/><circle cx="${bx}" cy="${by}" r="22" fill="#4dff9a" opacity=".35" filter="url(#g8)" stroke="none"/><circle cx="${bx}" cy="${by}" r="3.5" fill="#b9ffd8" stroke="none"/>`;
  }
  g += fogUse('ff', .55, -120) + `<rect y="560" width="1920" height="140" fill="#a9c9e2" opacity=".07" filter="url(#g70)" stroke="none"/>`;
  g += radar12(310, 930, 100, 'blip') + radar12(1610, 930, 100, lit ? 'crisp' : 'blip');
  return SV(g);
}
const sea = (stage) => { sea11(stage); sea12(stage); return seaDay(stage); };

// ---------------------------------------------------------------- act 6 (v12): hands
const SKIN_A = ['#f5d9c3', '#e2b28f', '#b9805f'], SKIN_B = ['#e1b48c', '#bb8157', '#845235']; // two warm tones; one constant each to change
function limbPath(p0, p1, p2, p3, w0, w1) { // tapered limb along a cubic, round tip
  const N = 32, L = [], R = [], q = (t) => { const u = 1 - t; return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]; };
  for (let i = 0; i <= N; i++) { const t = i / N, [x, y] = q(t), [x2, y2] = q(Math.min(1, t + .01)), [x1, y1] = q(Math.max(0, t - .01)); let dx = x2 - x1, dy = y2 - y1; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; const w = (w0 + (w1 - w0) * Math.pow(t, .8)) / 2; L.push([x - dy * w, y + dx * w]); R.push([x + dy * w, y - dx * w]); }
  const f = (p) => p.map((v) => v.toFixed(1)).join(' ');
  return 'M' + L.map(f).join('L') + 'A' + (w1 / 2) + ' ' + (w1 / 2) + ' 0 0 0 ' + f(R[N]) + 'L' + R.slice(0, N).reverse().map(f).join('L') + 'Z';
}
function hands12(dy = 0) {
  const sk = (id, c) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset=".5" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></linearGradient>`;
  let g = `<defs>${BEVEL}${sk('skA', SKIN_A)}${sk('skB', SKIN_B)}
  <linearGradient id="suitL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3f7fb3"/><stop offset=".55" stop-color="#245a86"/><stop offset="1" stop-color="#143a5a"/></linearGradient>
  <linearGradient id="suitR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#43515f"/><stop offset=".55" stop-color="#27323d"/><stop offset="1" stop-color="#121a22"/></linearGradient>
  <linearGradient id="shirt" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#dfe8f1"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#c9d8e6"/></linearGradient>
  <pattern id="weave" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><rect width="6" height="6" fill="none"/><path d="M0 0 H6" stroke="#fff" stroke-opacity=".07" stroke-width="1"/></pattern></defs>`;
  // sleeve with gathered folds and a shirt cuff; local x runs along the arm, cuff end at x=0
  const sleeve = (suit, dark, light) => { let s = `<g filter="url(#bevel)"><path d="M-1100 -78 L-30 -104 Q-14 0 -30 104 L-1100 78 Z" fill="url(#${suit})"/><path d="M-1100 -78 L-30 -104 Q-14 0 -30 104 L-1100 78 Z" fill="url(#weave)"/></g>`;
    s += `<clipPath id="slv${suit}"><path d="M-1100 -78 L-30 -104 Q-14 0 -30 104 L-1100 78 Z"/></clipPath><g clip-path="url(#slv${suit})">`;
    for (let i = 0; i < 7; i++) { const y0 = -92 + i * 30 + (r12() - .5) * 8, len = 140 + r12() * 260, y1 = y0 * (1.1 + r12() * .25) + (r12() - .5) * 30, sag = 8 + r12() * 22; s += `<path d="M-34 ${y0.toFixed(0)} C${-34 - len * .4} ${(y0 + sag).toFixed(0)} ${-34 - len * .7} ${(y1 - sag).toFixed(0)} ${-34 - len} ${y1.toFixed(0)}" stroke="${dark}" stroke-opacity="${(.35 + r12() * .3).toFixed(2)}" stroke-width="${(7 + r12() * 8).toFixed(0)}" filter="url(#g4)"/><path d="M-36 ${(y0 + 8).toFixed(0)} C${-36 - len * .4} ${(y0 + sag + 8).toFixed(0)} ${-36 - len * .7} ${(y1 - sag + 8).toFixed(0)} ${-36 - len} ${(y1 + 8).toFixed(0)}" stroke="${light}" stroke-opacity=".28" stroke-width="3" filter="url(#g4)"/>`; }
    s += '</g>';
    s += `<path d="M-30 -104 Q-14 0 -30 104" stroke="#000" stroke-opacity=".35" stroke-width="10" filter="url(#g8)"/>`; return s; };
  const cuff = `<g filter="url(#bevel)"><rect x="-26" y="-92" width="58" height="184" rx="12" fill="url(#shirt)"/></g><path d="M-8 -86 V86 M14 -88 V88" stroke="#9db1c4" stroke-width="1.4" stroke-dasharray="3 5" opacity=".8"/><circle cx="4" cy="52" r="8" fill="#d9b96a" stroke="#8a6f35" stroke-width="1.4"/><circle cx="2" cy="50" r="3" fill="#fff" opacity=".8"/><path d="M32 -88 Q40 0 32 88" stroke="#000" stroke-opacity=".3" stroke-width="8" filter="url(#g4)"/>`;
  g += `<circle cx="1010" cy="${500 + dy}" r="380" fill="url(#rgBlue)" opacity=".45" stroke="none"/>`;
  g += `<g transform="translate(0 ${dy}) translate(960 520) scale(1.1) translate(-960 -520)">`;
  g += `<ellipse cx="960" cy="720" rx="640" ry="36" fill="#15202b" opacity=".2" filter="url(#g40)" stroke="none"/>`;
  g += `<g transform="translate(1316 500) scale(-1 1) rotate(-5)">${sleeve('suitR', '#05090e', '#8aa0b4')}${cuff}</g>`;
  g += `<g transform="translate(640 500) rotate(-5)">${sleeve('suitL', '#0a2236', '#8fc0e6')}${cuff}</g>`;
  // right hand (behind): back of the hand, tendons, knuckles
  g += `<g filter="url(#bevel)"><path d="M1298 456 C1250 446 1190 428 1130 408 C1070 390 1010 396 985 432 C964 472 972 524 1006 558 C1040 590 1110 598 1190 590 C1240 584 1275 574 1298 566 Z" fill="url(#skB)"/></g>`;
  g += `<path d="M1280 468 C1210 456 1130 440 1060 424 M1280 500 C1210 492 1130 480 1050 470 M1280 534 C1210 534 1130 526 1046 514" stroke="${SKIN_B[2]}" stroke-width="3" opacity=".35" filter="url(#g4)"/>`;
  for (const [kx, ky] of [[1010, 440], [1004, 478], [1008, 518], [1022, 552]]) g += `<ellipse cx="${kx}" cy="${ky}" rx="20" ry="17" fill="${SKIN_B[0]}" opacity=".5" filter="url(#g4)"/>`;
  // right thumb along the top, with nail
  g += `<g filter="url(#bevelF)"><path d="${limbPath([1170, 440], [1120, 380], [1010, 366], [900, 392], 60, 46)}" fill="url(#skB)"/></g><ellipse cx="912" cy="390" rx="20" ry="13" transform="rotate(-16 912 390)" fill="#f6e5d8" stroke="${SKIN_B[2]}" stroke-width="1.2" opacity=".95"/>`;
  // left hand (front): back of the hand
  g += `<g filter="url(#bevel)"><path d="M652 438 C710 422 780 404 856 392 C916 384 956 398 972 432 C988 474 984 524 954 556 C914 596 834 602 744 582 C704 572 676 562 652 552 Z" fill="url(#skA)"/></g>`;
  g += `<path d="M690 458 C760 442 840 432 920 426 M690 498 C770 490 850 486 930 480 M696 536 C770 538 850 536 930 530" stroke="${SKIN_A[2]}" stroke-width="3.2" opacity=".32" filter="url(#g4)"/>`;
  for (const [kx, ky] of [[944, 436], [958, 478], [956, 520], [940, 554]]) g += `<ellipse cx="${kx}" cy="${ky}" rx="22" ry="18" fill="${SKIN_A[0]}" opacity=".6" filter="url(#g4)"/>`;
  // left fingers wrap over the right hand (four, with joints and curled tips)
  const FG = [[440, 150, 54, 44], [484, 162, 56, 46], [526, 154, 54, 44], [560, 124, 44, 36]];
  for (const [y, len, w0, w1] of FG.slice().reverse()) {
    const x0 = 950, end = [x0 + len * .84, y + 34];
    g += `<path d="${limbPath([x0, y], [x0 + len * .5, y - 12], [x0 + len * .92, y - 8], end, w0, w1)}" fill="#15202b" opacity=".25" filter="url(#g8)" transform="translate(-4 8)"/>`;
    g += `<g filter="url(#bevelF)"><path d="${limbPath([x0, y], [x0 + len * .5, y - 12], [x0 + len * .92, y - 8], end, w0, w1)}" fill="url(#skA)"/></g>`;
    g += `<path d="M${x0 + len * .34} ${y - w0 * .46} Q${x0 + len * .36} ${y} ${x0 + len * .34} ${y + w0 * .46} M${x0 + len * .66} ${y - w0 * .42} Q${x0 + len * .68} ${y - 4} ${x0 + len * .66} ${y + w0 * .4}" stroke="${SKIN_A[2]}" stroke-width="2.2" opacity=".55"/>`;
  }
  // left thumb across the top
  g += `<path d="${limbPath([744, 424], [800, 372], [900, 356], [1000, 378], 64, 50)}" fill="#15202b" opacity=".25" filter="url(#g8)" transform="translate(-4 10)"/><g filter="url(#bevelF)"><path d="${limbPath([744, 424], [800, 372], [900, 356], [1000, 378], 64, 50)}" fill="url(#skA)"/></g><ellipse cx="992" cy="378" rx="22" ry="14" transform="rotate(12 992 378)" fill="#fbeee3" stroke="${SKIN_A[2]}" stroke-width="1.2" opacity=".95"/><path d="M780 392 C840 372 920 366 980 376" stroke="#fff" stroke-width="4" opacity=".45" filter="url(#g4)"/>`;
  g += '</g>';
  for (let i = 0; i < 24; i++) { const a = r12() * 6.283, d = 160 + r12() * 330; g += `<circle cx="${(1010 + Math.cos(a) * d * 1.5).toFixed(0)}" cy="${(480 + dy + Math.sin(a) * d * .5).toFixed(0)}" r="${(1.5 + r12() * 3.2).toFixed(1)}" fill="#fff" opacity="${(0.4 + r12() * .5).toFixed(2)}" filter="url(#g4)" stroke="none"/>`; }
  return SV(g);
}
const hands = (dy) => { hands11(dy); hands12(dy); return hands13(dy); };

// ---------------------------------------------------------------- act 7 (v12): calligraphic signature and fountain pen
function signature() { // one centre line (initial with a loop, flowing humps, a long underline flourish), then variable width from the stroke direction
  const key = [[655, 716], [668, 676], [690, 610], [716, 562], [742, 548], [754, 570], [742, 614], [712, 656], [690, 690], [706, 704], [742, 684], [772, 652], [790, 628], [804, 650], [808, 690], [826, 664], [852, 624], [872, 604], [884, 628], [886, 674], [904, 700], [930, 672], [956, 630], [976, 606], [990, 624], [992, 672], [1010, 702], [1038, 680], [1064, 640], [1084, 620], [1098, 640], [1096, 690], [1120, 712], [1160, 690], [1206, 650], [1244, 626], [1262, 648], [1236, 690], [1160, 722], [1040, 742], [900, 752], [780, 750], [690, 744]];
  const pts = []; // Catmull-Rom, centripetal enough at this density
  for (let i = 0; i < key.length - 1; i++) { const p0 = key[Math.max(0, i - 1)], p1 = key[i], p2 = key[i + 1], p3 = key[Math.min(key.length - 1, i + 2)]; for (let t = 0; t < 1; t += 0.1) { const t2 = t * t, t3 = t2 * t; pts.push([0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3), 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]); } }
  pts.push(key[key.length - 1]); return pts;
}
function inkPolygon(pts, upto) { // broad-nib model: thick on downstrokes (nib at ~40 degrees), hairline on upstrokes, pressure eases at start and end
  const n = Math.floor(pts.length * upto), L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 2)], b = pts[Math.min(pts.length - 1, i + 2)]; let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const ang = Math.atan2(dy, dx), nib = 0.7, k = Math.abs(Math.sin(ang - nib)); const t = i / (pts.length - 1);
    let w = 1.1 + 6.4 * Math.pow(k, 1.6); w *= Math.min(1, 0.35 + i / 14) * (t > .86 ? Math.max(.3, 1 - (t - .86) * 4) : 1);
    L.push([pts[i][0] - dy * w / 2, pts[i][1] + dx * w / 2]); R.push([pts[i][0] + dy * w / 2, pts[i][1] - dx * w / 2]);
  }
  const f = (p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1);
  return { d: 'M' + L.map(f).join('L') + 'L' + R.reverse().map(f).join('L') + 'Z', n, last: pts[n - 1], wet: pts.slice(Math.max(0, n - 40), n) };
}
function signing12() {
  const pts = signature(), UP = 0.8, ink = inkPolygon(pts, UP), tip = ink.last;
  let g = `<defs>${BEVEL}
  <linearGradient id="barrel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0a1520"/><stop offset=".25" stop-color="#2b5f8c"/><stop offset=".42" stop-color="#5a9bcf"/><stop offset=".62" stop-color="#17364f"/><stop offset="1" stop-color="#070f17"/></linearGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a6f35"/><stop offset=".3" stop-color="#fbe9b0"/><stop offset=".55" stop-color="#c9a45c"/><stop offset="1" stop-color="#6e5726"/></linearGradient>
  <linearGradient id="ink" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#14325a"/><stop offset="1" stop-color="#1f5a8f"/></linearGradient>
  <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#edf3f9"/></linearGradient>
  <filter id="fibre"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="3" seed="2"/><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .55  0 0 0 0 .6  0 0 0 .5 0"/></filter></defs>`;
  g += `<ellipse cx="960" cy="470" rx="660" ry="340" fill="${GLOWB}" opacity=".3" filter="url(#g70)" stroke="none"/>`;
  g += `<rect x="540" y="150" width="840" height="680" rx="8" fill="#15202b" opacity=".22" filter="url(#g40)" stroke="none" transform="translate(14 36)"/>`;
  g += `<rect x="540" y="130" width="840" height="680" rx="8" fill="url(#paper)" stroke="${LINE}" stroke-width="1.5"/><rect x="540" y="130" width="840" height="680" rx="8" filter="url(#fibre)" opacity=".16" stroke="none"/>`;
  g += `<circle cx="1230" cy="250" r="54" stroke="${LINE}" stroke-width="2"/><circle cx="1230" cy="250" r="42" stroke="${LINE}" stroke-width="1"/>`;
  for (let i = 0; i < 6; i++) g += `<path d="M620 ${210 + i * 52} H${[1100, 1140, 960, 1120, 1060, 700][i]}" stroke="${LINE}" stroke-width="2.4" opacity=".9"/>`;
  g += `<path d="M620 770 H1180" stroke="${SLATE}" stroke-width="1.2" opacity=".7"/>`;
  // ink: soft bleed, the line itself, a hairline highlight, and a wet sheen on the newest part only
  g += `<path d="${ink.d}" fill="${BLUE}" opacity=".3" filter="url(#g4)" stroke="${BLUE}" stroke-width="2"/><path d="${ink.d}" fill="url(#ink)" stroke="#17406b" stroke-width=".6"/>`;
  const wet = ink.wet.map((p, i) => (i ? 'L' : 'M') + (p[0] - 1.2).toFixed(1) + ' ' + (p[1] - 1.4).toFixed(1)).join('');
  g += `<path d="${wet}" stroke="#bfe0fa" stroke-width="2.2" opacity=".75" filter="url(#g4)"/><path d="${wet}" stroke="#fff" stroke-width="1" opacity=".85"/><circle cx="${tip[0]}" cy="${tip[1]}" r="22" fill="url(#rgBlue)" opacity=".9" stroke="none"/><circle cx="${tip[0] + 1}" cy="${tip[1] - 1}" r="3.6" fill="#e6f5ff" stroke="none"/>`;
  const pen = `<g transform="translate(${tip[0].toFixed(1)} ${tip[1].toFixed(1)}) rotate(36)">
  <path d="M-15 -92 L-1 -2 L1 -2 L15 -92 Q0 -106 -15 -92 Z" fill="url(#gold)" stroke="#6e5726" stroke-width="1.3"/><path d="M0 -4 V-74" stroke="#3d2f10" stroke-width="1.4"/><circle cx="0" cy="-66" r="4.6" fill="#3d2f10" stroke="none"/><path d="M-9 -30 L-1 -3 M-12 -52 L-5 -80" stroke="#6e5726" stroke-width="1" opacity=".7"/>
  <path d="M-23 -94 L-18 -102 L18 -102 L23 -94 L25 -186 Q0 -198 -25 -186 Z" fill="#0f1a26" stroke="#2c4155" stroke-width="1.4"/><path d="M-10 -102 V-182" stroke="#fff" stroke-width="2.4" opacity=".35"/>
  <rect x="-27" y="-200" width="54" height="14" rx="3" fill="url(#gold)" stroke="#6e5726"/><rect x="-27" y="-220" width="54" height="8" rx="3" fill="url(#gold)" stroke="#6e5726"/>
  <path d="M-28 -222 H28 L30 -570 Q0 -592 -30 -570 Z" fill="url(#barrel)" stroke="#06101a" stroke-width="1.6"/>
  <path d="M-18 -250 V-548" stroke="#fff" stroke-width="7" opacity=".4" filter="url(#g4)"/><path d="M-18 -250 V-548" stroke="#fff" stroke-width="1.8" opacity=".8"/><path d="M14 -250 V-548" stroke="#9fd0f5" stroke-width="2" opacity=".25"/>
  <path d="M30 -340 H42 Q49 -340 49 -332 V-484 Q49 -492 42 -492 H30" fill="url(#gold)" stroke="#6e5726" stroke-width="1.4"/><path d="M33 -338 V-488" stroke="#fff" stroke-width="1.6" opacity=".6"/>
  <rect x="-30" y="-570" width="60" height="16" rx="3" fill="url(#gold)" stroke="#6e5726"/></g>`;
  g += `<g transform="translate(24 38)" opacity=".26" filter="url(#g8)">${pen.replace(/url\(#[a-z]+\)/g, INK)}</g>` + pen;
  for (let i = 0; i < 18; i++) g += `<circle cx="${(r12() * 1920).toFixed(0)}" cy="${(r12() * 1080).toFixed(0)}" r="${(10 + r12() * 30).toFixed(0)}" fill="#fff" opacity="${(0.15 + r12() * .2).toFixed(2)}" filter="url(#g8)" stroke="none"/>`;
  return SV(g);
}
const signing = () => { signing11(); return signing12(); };

// ---------------------------------------------------------------- v13 act 2: DAYLIGHT, pale morning haze
let seed13 = 4242; const r13 = () => { seed13 |= 0; seed13 = (seed13 + 0x6D2B79F5) | 0; let t = Math.imul(seed13 ^ (seed13 >>> 15), 1 | seed13); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const fogHole = (id, y, h, hx, hy, hrx, hry) => `<mask id="${id}h" maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080"><rect x="0" y="${y}" width="1920" height="${h}" fill="url(#${id}g)"/><ellipse cx="${hx}" cy="${hy}" rx="${hrx}" ry="${hry}" fill="#000" filter="url(#g40)"/></mask>`;
const fogUseH = (id, op, dx = 0) => `<g mask="url(#${id}h)" opacity="${op}"><rect x="${dx}" width="2200" height="1080" filter="url(#${id})" stroke="none" fill="#000"/></g>`;
function shipDay(id, x, y, sc) { // bow to the right, y = waterline; full colour, the haze in front of it decides how much is seen
  const hull = 'M0 -92 H742 Q792 -100 816 -124 L764 -22 Q748 0 704 0 H44 Q10 0 4 -42 Z';
  let g = `<g transform="translate(${x} ${y}) scale(${sc})"><defs><clipPath id="hc${id}"><path d="${hull}"/></clipPath>
  <linearGradient id="hg${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f5273"/><stop offset=".6" stop-color="#1d3a55"/><stop offset="1" stop-color="#132a3f"/></linearGradient>
  <linearGradient id="sg${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d3e0ec"/></linearGradient>
  <linearGradient id="gl${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ec3e0"/><stop offset="1" stop-color="#2f5a80"/></linearGradient></defs>`;
  g += `<path d="${hull}" fill="url(#hg${id})" stroke="#0f2336" stroke-width="1.6"/>`;
  g += `<g clip-path="url(#hc${id})"><rect x="0" y="-27" width="830" height="30" fill="#9b3a40"/><rect x="0" y="-27" width="830" height="3" fill="#fff" opacity=".35"/><rect x="0" y="-92" width="830" height="5" fill="#fff" opacity=".7"/><rect x="0" y="-84" width="830" height="30" fill="#fff" opacity=".07"/>`;
  for (let i = 0; i < 12; i++) g += `<rect x="${60 + i * 62}" y="-70" width="34" height="10" fill="#fff" opacity="${i % 3 ? .0 : .22}"/>`; // white marking blocks on the hull
  g += `</g>`;
  for (let i = 0; i < 60; i++) g += `<path d="M${14 + i * 12} -92 v-9" stroke="#e7f0f8" stroke-width="1" opacity=".9"/>`;
  g += `<path d="M10 -101 H760" stroke="#e7f0f8" stroke-width="1.4"/>`;
  const blk = (bx, by, w, h) => `<rect x="${bx}" y="${by}" width="${w}" height="${h}" fill="url(#sg${id})" stroke="#9db5c9" stroke-width="1.4"/>`;
  g += blk(28, -196, 170, 104) + blk(38, -252, 150, 56) + blk(20, -286, 178, 34) + `<rect x="200" y="-262" width="38" height="170" fill="url(#sg${id})" stroke="#9db5c9" stroke-width="1.4"/><rect x="200" y="-246" width="38" height="16" fill="#27618f"/>`;
  g += `<path d="M112 -286 V-352 M84 -330 H140 M112 -352 l18 -8" stroke="#52677a" stroke-width="2.4"/><rect x="92" y="-306" width="40" height="6" fill="#52677a"/>`;
  g += `<path d="M112 -350 L200 -338 L112 -326 Z" fill="#27618f" stroke="#15202b" stroke-width=".8"/><path d="M112 -344 L200 -338" stroke="#fff" stroke-width="3"/>`; // pennant on the mast
  for (let r = 0; r < 3; r++) for (let c = 0; c < 7; c++) g += `<rect x="${40 + c * 22}" y="${-180 + r * 30}" width="14" height="11" fill="url(#gl${id})"/>`;
  for (let c = 0; c < 6; c++) g += `<rect x="${50 + c * 22}" y="-236" width="14" height="11" fill="url(#gl${id})"/>`;
  g += `<rect x="26" y="-278" width="162" height="12" fill="url(#gl${id})"/>`;
  for (let row = 0; row < 4; row++) for (let c = 0; c < 9; c++) {
    if (row === 3 && (c < 1 || c > 7)) continue; const cx = 250 + c * 50 + (c > 2 ? 4 : 0) + (c > 5 ? 4 : 0), cy = -92 - 32 * (row + 1), col = CONT[(c * 3 + row * 2) % CONT.length], top = row === 3 || (row === 2 && (c < 1 || c > 7));
    g += `<rect x="${cx}" y="${cy}" width="46" height="30" fill="${col}"/><rect x="${cx}" y="${cy}" width="46" height="30" fill="url(#wl)" opacity=".5"/><path d="M${cx + 11} ${cy} V${cy + 30} M${cx + 23} ${cy} V${cy + 30} M${cx + 35} ${cy} V${cy + 30}" stroke="#000" stroke-opacity=".25"/><rect x="${cx}" y="${cy}" width="46" height="2" fill="#fff" opacity=".55"/><rect x="${cx + 6}" y="${cy + 9}" width="${14 + (c % 3) * 6}" height="5" fill="#fff" opacity=".8"/>`; // white marking on every box
    if (top) g += `<path d="M${cx} ${cy} L${cx + 10} ${cy - 8} H${cx + 56} L${cx + 46} ${cy} Z" fill="${col}"/><path d="M${cx} ${cy} L${cx + 10} ${cy - 8} H${cx + 56} L${cx + 46} ${cy}" stroke="#fff" stroke-opacity=".6"/>`;
  }
  return g + '</g>';
}
function radarDay(cx, cy, r, mode) {
  let g = `<circle cx="${cx}" cy="${cy + 8}" r="${r + 18}" fill="#15202b" opacity=".22" filter="url(#g16)" stroke="none"/><circle cx="${cx}" cy="${cy}" r="${r + 18}" fill="#f6fafd" stroke="#9bb7cc" stroke-width="2.4"/><circle cx="${cx}" cy="${cy}" r="${r + 18}" stroke="#fff" stroke-width="2" opacity=".9" stroke-dasharray="150 900" transform="rotate(-140 ${cx} ${cy})"/>`;
  g += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#e9f4fb" stroke="#7fa6c4" stroke-width="2"/>`;
  for (const f of [.25, .5, .75]) g += `<circle cx="${cx}" cy="${cy}" r="${r * f}" stroke="#7fa6c4" stroke-width="1" opacity=".6"/>`;
  g += `<path d="M${cx - r} ${cy} H${cx + r} M${cx} ${cy - r} V${cy + r}" stroke="#7fa6c4" stroke-width="1" opacity=".5"/>`;
  for (let k = 0; k < 36; k++) { const a = k * Math.PI / 18, l = k % 3 ? 7 : 14; g += `<path d="M${cx + Math.cos(a) * (r - l)} ${cy + Math.sin(a) * (r - l)} L${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r}" stroke="#52677a" stroke-width="1.2" opacity=".6"/>`; }
  const a0 = -52 * Math.PI / 180;
  for (let k = 0; k < 8; k++) { const aa = a0 - k * 0.2, ab = a0 - (k + 1) * 0.2; g += `<path d="M${cx} ${cy} L${cx + r * Math.cos(aa)} ${cy + r * Math.sin(aa)} A${r} ${r} 0 0 0 ${cx + r * Math.cos(ab)} ${cy + r * Math.sin(ab)} Z" fill="#27618f" opacity="${(0.34 * (1 - k / 8)).toFixed(3)}" stroke="none"/>`; }
  g += `<path d="M${cx} ${cy} L${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)}" stroke="#27618f" stroke-width="2.8" filter="url(#glow)"/>`;
  const bx = cx + r * .44, by = cy - r * .34;
  if (mode === 'blip') g += `<circle cx="${bx}" cy="${by}" r="${r * .26}" fill="#27618f" opacity=".45" filter="url(#g8)" stroke="none"/><circle cx="${bx}" cy="${by}" r="${r * .1}" fill="#15202b" filter="url(#g4)" stroke="none"/><text x="${bx}" y="${by + 11}" text-anchor="middle" font-family="Spectral,serif" font-size="32" fill="#15202b" opacity=".9" stroke="none" filter="url(#g4)">?</text>`;
  else g += `<circle cx="${bx}" cy="${by}" r="${r * .3}" stroke="#27618f" stroke-width="1.6" filter="url(#glow)"/><g transform="translate(${bx} ${by}) scale(.1)" stroke="none" filter="url(#g4)"><path d="M-300 20 H300 L330 20 L280 80 H-250 Z" fill="#15202b"/><rect x="-260" y="-90" width="440" height="110" fill="#15202b" opacity=".9"/><rect x="-250" y="-190" width="140" height="100" fill="#15202b"/></g>`;
  return g;
}
// v14: the ship is a CC0 Openclipart drawing (Cargo Ship, j4p4n, https://openclipart.org/detail/322884), cut at the waterline so the red under-water paint is hidden
const SHIPSVG = fs.readFileSync(path.join(__dirname, 'ship-openclipart-322884.svg'));
const SHIPSYM = `<symbol id="shipSym" viewBox="0 0 1822.84 595.28"><image href="data:image/svg+xml;base64,${SHIPSVG.toString('base64')}" width="1822.84" height="595.28"/></symbol><clipPath id="wlclip"><rect x="0" y="0" width="1900" height="523"/></clipPath>`;
const shipImg = (x, wl, s) => `<g transform="translate(${x} ${wl - 523 * s}) scale(${s})"><g clip-path="url(#wlclip)"><use href="#shipSym" width="1822.84" height="595.28"/></g></g>`;
function seaDay(stage) {
  const clear = !!stage, WL = 742, SC = 0.76, X0 = 40, HZ = 570;
  const hx = X0 + 900 * SC, hy = WL - 110;
  let g = `<defs>${BEVEL}${SHIPSYM}
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6fafd"/><stop offset=".7" stop-color="#e3edf6"/><stop offset="1" stop-color="#d4e3ef"/></linearGradient>
  <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d3e3ef"/><stop offset=".25" stop-color="#a9c8de"/><stop offset="1" stop-color="#7fa6c4"/></linearGradient>
  <linearGradient id="wl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".25"/></linearGradient>
  <linearGradient id="rf" gradientUnits="userSpaceOnUse" x1="0" y1="${WL}" x2="0" y2="${WL + 260}"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
  <mask id="rfm" maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080"><rect x="0" y="${WL}" width="1920" height="320" fill="url(#rf)"/></mask>
  <linearGradient id="ray" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff8e0" stop-opacity=".85"/><stop offset="1" stop-color="#fff8e0" stop-opacity="0"/></linearGradient>
  <filter id="rip" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="turbulence" baseFrequency="0.0025 0.09" numOctaves="2" seed="4" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="22" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="2.5"/></filter>
  ${fogDef('hb', 440, 330, 21, '0.003 0.010', '.93 .97 1')}${fogDef('hm', 560, 300, 22, '0.0035 0.013', '.9 .95 1')}${fogDef('hf', 840, 240, 23, '0.003 0.01', '.92 .96 1')}${fogDef('hs', 60, 360, 24, '0.002 0.008', '1 1 1')}
  ${fogHole('hm', 560, 300, hx, hy, 520, 190)}${fogHole('hf', 840, 240, hx, WL + 40, 560, 150)}${fogHole('hb', 440, 330, hx, hy - 60, 520, 190)}</defs>`;
  g += `<rect width="1920" height="${HZ}" fill="url(#sky)" stroke="none"/><rect y="${HZ}" width="1920" height="${1080 - HZ}" fill="url(#sea)" stroke="none"/>`;
  g += `<circle cx="1530" cy="150" r="330" fill="url(#rgWarm)" opacity=".55" stroke="none"/><circle cx="1530" cy="150" r="70" fill="#fffaf0" opacity=".85" filter="url(#g16)" stroke="none"/>`;
  g += fogUse('hs', .5, -100);
  g += `<ellipse cx="960" cy="${HZ + 6}" rx="1100" ry="46" fill="#fff" opacity=".85" filter="url(#g40)" stroke="none"/><rect x="0" y="${HZ - 1}" width="1920" height="2" fill="#fff" opacity=".7" filter="url(#g4)" stroke="none"/>`;
  // far ship: small, veiled
  g += `<g opacity=".45" filter="url(#g4)" transform="translate(3580 0) scale(-1 1)">${shipImg(1790, 640, 0.22)}</g>`;
  g += clear ? fogUseH('hb', .5, -80) : fogUse('hb', .95, -80);
  g += `<ellipse cx="1500" cy="${HZ + 40}" rx="520" ry="26" fill="#fff" opacity=".6" filter="url(#g16)" stroke="none"/>`;
  for (let i = 0; i < 80; i++) { const y = HZ + 14 + Math.pow(i / 80, 1.7) * 470, w = 40 + r13() * 240 * (0.5 + i / 40), x = r13() * 1920; g += `<path d="M${x.toFixed(0)} ${y.toFixed(0)} h${w.toFixed(0)}" stroke="#fff" stroke-width="${(0.8 + i / 30).toFixed(1)}" opacity="${(0.12 + r13() * 0.28).toFixed(2)}"/>`; }
  // near ship (reflection first); veiled in 2a, sharp in 2b
  g += `<g mask="url(#rfm)" opacity="${clear ? .5 : .32}"><g filter="url(#rip)"><g transform="translate(0 ${2 * WL}) scale(1 -1)">${shipImg(X0, WL, SC)}</g></g></g>`;
  g += clear ? `<g>${shipImg(X0, WL, SC)}</g>` : `<g opacity=".62" filter="url(#g4)">${shipImg(X0, WL, SC)}</g>`;
  g += `<path d="M${X0 + 1690 * SC} ${WL} Q${X0 + 1745 * SC} ${WL - 10} ${X0 + 1790 * SC} ${WL + 2} Q${X0 + 1745 * SC} ${WL + 14} ${X0 + 1690 * SC} ${WL + 6} Z" fill="#10243a" opacity=".85" stroke="none"/><ellipse cx="${X0 + 1760 * SC}" cy="${WL + 2}" rx="120" ry="11" fill="#fff" opacity=".85" filter="url(#g8)" stroke="none"/><ellipse cx="${X0 + 40}" cy="${WL + 6}" rx="150" ry="9" fill="#fff" opacity=".5" filter="url(#g8)" stroke="none"/>`;
  g += clear ? fogUseH('hm', .32, 60) : fogUse('hm', .95, 60);
  if (!clear) g += `<rect x="0" y="470" width="1920" height="320" fill="#e8f1f8" opacity=".3" filter="url(#g40)" stroke="none"/>`;
  if (clear) { // a sunlit clearing: warm shafts through the parted haze, the cargo lit, sparkle on the water
    for (const [a, b, w] of [[1440, 520, 90], [1560, 600, 120], [1330, 430, 60]]) g += `<path d="M${a} -40 L${a + w} -40 L${b + 260} ${WL - 40} L${b - 220} ${WL - 40} Z" fill="url(#ray)" opacity=".5" filter="url(#g16)" stroke="none"/>`;
    g += `<ellipse cx="${hx}" cy="${hy}" rx="560" ry="150" fill="url(#rgWarm)" opacity=".4" stroke="none"/>`;
    for (let i = 0; i < 70; i++) { const x = 160 + r13() * 1000, y = WL + 12 + r13() * 150, w = 6 + r13() * 28; g += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="2.2" fill="#fff" opacity="${(0.5 + r13() * .5).toFixed(2)}" stroke="none"/>`; }
  }
  g += clear ? fogUseH('hf', .45, -120) : fogUse('hf', .85, -120);
  g += radarDay(310, 930, 100, 'blip') + radarDay(1610, 930, 100, clear ? 'crisp' : 'blip');
  return SV(g);
}

// ---------------------------------------------------------------- v13 act 6: the handshake, route (b): a public-domain Openclipart drawing, restyled
// Source art: handshake-openclipart.svg (Openclipart, public domain; source page recorded in storyboard.md). Only its outlines are used:
// every fill, outline, sleeve, cuff, fold and light below is ours (skin tones as v12, suit colours as v12).
const HS = fs.readFileSync(path.join(__dirname, 'handshake-openclipart.svg'), 'utf8');
const hsPath = (id) => { const m = HS.match(new RegExp('<path[^>]*id="' + id + '"[\\s\\S]*?/>')); return m[0].match(/\sd="([^"]*)"/)[1]; };
function hands13(dy = 0) {
  const P = { low: hsPath('path4929'), up: hsPath('path3686'), lsl: hsPath('path8038'), shade: hsPath('path13008'), wr: hsPath('path919'), rsl: hsPath('path9902') };
  const crease = ['path3604', 'path3604-1', 'path3604-1-7', 'path3604-1-7-4', 'path3604-1-7-9'].map(hsPath), nails = ['path3681', 'path3681-4', 'path3681-4-4', 'path3681-4-5'].map(hsPath);
  const sk = (id, c) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset=".55" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></linearGradient>`;
  const S = 1.1, ox = 960 - 467 * S, oy = 400 - 300 * S + dy;
  let g = `<defs>${BEVEL}${sk('skA3', SKIN_A)}${sk('skB3', SKIN_A)}
  <linearGradient id="suitL3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f6a9c"/><stop offset=".6" stop-color="#245a86"/><stop offset="1" stop-color="#143a5a"/></linearGradient>
  <linearGradient id="suitR3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#46586a"/><stop offset=".6" stop-color="#27323d"/><stop offset="1" stop-color="#121a22"/></linearGradient>
  <linearGradient id="shirt3" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#dfe8f1"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#c9d8e6"/></linearGradient>
  <pattern id="weave3" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><path d="M0 0 H6" stroke="#fff" stroke-opacity=".08" stroke-width="1"/></pattern>
  <radialGradient id="fade3" cx="467" cy="300" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(467 300) scale(500 370) translate(-467 -300)"><stop offset=".62" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>
  <mask id="m3" maskUnits="userSpaceOnUse" x="-100" y="-100" width="1200" height="900"><rect x="-100" y="-100" width="1200" height="900" fill="url(#fade3)"/></mask>
  <clipPath id="cLow"><path d="${P.low}"/></clipPath><clipPath id="cLs"><path d="${P.lsl}"/></clipPath><clipPath id="cRs"><path d="${P.rsl}"/></clipPath>
  <clipPath id="cutL"><rect x="150" y="0" width="400" height="700"/></clipPath><clipPath id="cutR"><rect x="560" y="0" width="200" height="500"/></clipPath></defs>`;
  g += `<ellipse cx="960" cy="${640 + dy}" rx="560" ry="30" fill="#15202b" opacity=".16" filter="url(#g40)" stroke="none"/><circle cx="1000" cy="${400 + dy}" r="380" fill="url(#rgBlue)" opacity=".4" stroke="none"/>`;
  g += `<g transform="translate(${ox.toFixed(1)} ${oy.toFixed(1)}) scale(${S})"><g mask="url(#m3)">`;
  // cuffs (shirt) peek out from under the sleeves toward the hands
  g += `<g clip-path="url(#cutL)"><path d="${P.lsl}" transform="translate(40 -5)" fill="url(#shirt3)" stroke="#aebfd0" stroke-width="1.5"/></g><g clip-path="url(#cutR)"><path d="${P.rsl}" transform="translate(-40 5)" fill="url(#shirt3)" stroke="#aebfd0" stroke-width="1.5"/></g>`;
  // hands: ours skin tones, rounded by the bevel light; a soft shadow from the upper hand falls on the lower one
  g += `<g filter="url(#bevelF)"><path d="${P.low}" fill="url(#skA3)"/></g><path d="${P.low}" fill="#fff" opacity=".28" transform="translate(0 0)" filter="url(#g16)" clip-path="url(#cLow)"/>`;
  g += `<g clip-path="url(#cLow)"><path d="${P.up}" fill="none" stroke="#3a1f10" stroke-width="22" opacity=".38" filter="url(#g8)" transform="translate(-4 8)"/></g>`;
  g += `<g filter="url(#bevelF)"><path d="${P.up}" fill="url(#skB3)"/><path d="${P.wr}" fill="url(#skB3)"/></g>`;
  g += `<path d="${P.up}" fill="none" stroke="${SKIN_A[2]}" stroke-width="1.6" opacity=".55"/><path d="${P.low}" fill="none" stroke="${SKIN_A[2]}" stroke-width="1.6" opacity=".55"/>`;
  for (const d of crease) g += `<path d="${d}" fill="none" stroke="${SKIN_A[2]}" stroke-width="2.2" opacity=".55"/>`;
  for (const d of nails) g += `<path d="${d}" fill="#efd2bd" stroke="${SKIN_A[2]}" stroke-width="1" opacity=".55"/>`;
  g += `<path d="${P.up}" fill="none" stroke="#fff" stroke-width="3" opacity=".35" filter="url(#g4)" transform="translate(-2 -3)" clip-path="url(#cLow)"/>`;
  // sleeves: suit cloth with weave and gathered folds, rounded by the bevel
  const sleeve = (d, grad, clip, dark, light, folds) => { let s = `<g filter="url(#bevel)"><path d="${d}" fill="url(#${grad})"/><path d="${d}" fill="url(#weave3)"/></g><g clip-path="url(#${clip})">`; for (const [x0, y0, x1, y1] of folds) s += `<path d="M${x0} ${y0} C${(x0 * 2 + x1) / 3} ${y0 + (y1 - y0) * .1 + 14} ${(x0 + x1 * 2) / 3} ${y1 - 12} ${x1} ${y1}" stroke="${dark}" stroke-opacity=".5" stroke-width="9" fill="none" filter="url(#g4)"/><path d="M${x0 - 2} ${y0 + 8} C${(x0 * 2 + x1) / 3} ${y0 + (y1 - y0) * .1 + 22} ${(x0 + x1 * 2) / 3} ${y1 - 4} ${x1} ${y1 + 8}" stroke="${light}" stroke-opacity=".3" stroke-width="3" fill="none" filter="url(#g4)"/>`; return s + '</g>'; };
  const lf = [], rf = []; for (let i = 0; i < 8; i++) { lf.push([236, 170 + i * 52 + (r12() - .5) * 10, 60 + r12() * 80, 150 + i * 62]); } for (let i = 0; i < 6; i++) { rf.push([640, 130 + i * 44 + (r12() - .5) * 10, 760 + r12() * 130, 90 + i * 52]); }
  g += sleeve(P.lsl, 'suitL3', 'cLs', '#0a2236', '#8fc0e6', lf) + sleeve(P.rsl, 'suitR3', 'cRs', '#05090e', '#8aa0b4', rf);
  g += `<path d="${P.shade}" fill="#0a131c" opacity=".35" filter="url(#g8)"/>`;
  g += '</g></g>';
  g += `<circle cx="1000" cy="${450 + dy}" r="70" fill="url(#rgWhite)" opacity=".25" stroke="none"/>`;
  for (let i = 0; i < 24; i++) { const a = r13() * 6.283, d = 200 + r13() * 330; g += `<circle cx="${(1000 + Math.cos(a) * d * 1.5).toFixed(0)}" cy="${(440 + dy + Math.sin(a) * d * .45).toFixed(0)}" r="${(1.5 + r13() * 3.2).toFixed(1)}" fill="#fff" opacity="${(0.4 + r13() * .5).toFixed(2)}" filter="url(#g4)" stroke="none"/>`; }
  return SV(g);
}

const hair = (x1, x2, y) => SV(`<path d="M${x1} ${y} H${x2}" stroke="${BLUE}" stroke-width="2.4" filter="url(#glow)"/>`);
const cb = meta.contactBtn || { x: 205, y: 451, w: 82, h: 34 };
const appImg = (f) => `<div class="abs" style="left:0;top:0;width:1920px;height:1080px;overflow:hidden"><img src="${b64(f)}" style="width:1920px;height:1200px;display:block"></div>`;
const WORDS3 = (n) => ['Commodity', 'Quantity', 'Origin', 'Incoterms'].map((w, i) => i < n ? `<span class="lit">${w}</span>` : w).join(' · ');

const acts = [
  { id: '1', sec: 8, voice: 'MyPlatform is a private marketplace to trade physical commodities. By invitation only.', screen: '"MyPlatform" next to the globe / "Physical commodities. By invitation only."',
    moves: 'Camera drifts in slowly (3 %) while the dotted globe rotates; 22 trade routes draw themselves in turn as glowing light-trails with a bright comet at the head; ~20 port dots bloom with a soft pulse ring; a light sweep crosses the sphere once; far motes drift slower than near motes (parallax).',
    next: 'The bright Chile-Rotterdam route keeps drawing out past the globe edge and becomes the horizon of the night sea in act 2 (the light dims to black behind it).',
    frames: [['', globe(1300, 540, 400, 28) + motes(26, GLOWB) + kw('big word', 110, 300, 760, 'MyPlatform') + kw('mid', 114, 480, 760, 'Physical commodities.<br>By invitation only.') + finish(false)]] },
  { id: '2', sec: 14, voice: 'In commodity trading, counterparties are often difficult to identify. Disclosing your position too early can weaken your commercial leverage.', screen: '"The counterparty." then "Too early." (in the empty sky above the ships)',
    moves: 'DAYLIGHT (v14: realistic ship). A pale morning sea in the app\'s light colours with a soft sun in the upper right; the near ship is a photo-traced container ship (bridge and lifeboat aft, mast, cranes, corrugated container stacks, hull plating, boot-topping, flared bow with bow foam), a far ship small; three layers of textured haze drift at different speeds (parallax) and the hull has a rippling reflection. Each captain sees only a blurred radar blip (?) of the other on a light radar dial. In 2a both ships are veiled in haze. In 2b the haze parts over the near ship: a sunlit clearing with warm light shafts exposes its cargo too early, with sparkle on the water, while the far ship stays veiled and its radar now shows the first ship crisp.',
    next: 'The light of the exposed ship swells into a white wash that becomes the white page of the app in act 3 (fade through white).',
    frames: [['a', sea(0) + kw('big', 100, 110, 1720, 'The <em>counterparty.</em>', 'center') + finish(false)], ['b', sea(1) + kw('big', 100, 110, 1720, '<em>Too</em> early.', 'center') + finish(false)]] },
  { id: '3', sec: 12, voice: 'Members post buying and selling opportunities with the key details: commodity, quantity, origin and Incoterms.', screen: '"Commodity · Quantity · Origin · Incoterms" (each word lights up as it is spoken)',
    moves: 'Smooth push-in from the real Browse screen onto the offer row; the app behind softens (depth blur). As the voice says each detail it lights up on the row in turn: commodity, quantity, origin, Incoterms (soft blue glow, the rest dimmed); a light sweep passes over the card; the pointer glides to Contact and clicks; the real Contact window opens.',
    next: 'The Contact window\'s edge becomes the frame of the row in act 4 (the camera pushes into it).',
    frames: [['a', appBlur('browse.png', 9, .55) + rowCard() + lit(285, 28, 238, 42) + lit(158, 84, 190, 38) + lit(364, 84, 40, 38, 4) + lit(424, 84, 246, 38) + cursor(RX + (25 + 85) * RS, RY + (330 + 6) * RS) + kw('mid', 110, 760, 1700, WORDS3(4), 'center') + motes(14, '#fff', .8) + finish(false)],
      ['b', appImg('contact.png') + cursor(((meta.contactSend || { x: 447, y: 303 }).x + 40) * SC, ((meta.contactSend || { x: 447, y: 303 }).y + 16) * SC) + finish(false, true)]] },
  { id: '4', sec: 12, voice: "Each member states their role and declares the documentation available. Other members see the opportunity, not the member's identity.", screen: '"The opportunity." / "Not the member."',
    moves: 'The offer row fills the frame; "Poster: Principal (Trader)" lights up when the role is spoken, then "Documents" lights up when the documentation is spoken; the member badge to the right stays out of focus, greyed and unchanged. The words fade in one after the other; a slow light sweep.',
    next: 'The row slides left and its right edge becomes the left member ring of act 5.',
    frames: [['', appBlur('browse.png', 14, .72) + kw('big', 100, 70, 1720, 'The <em>opportunity.</em>', 'center') + rowCard() + lit(20, 188, 318, 38) + lit(350, 188, 390, 38) +
      `<div class="abs" style="left:1590px;top:410px;width:130px;height:130px;border-radius:75px;border:2px solid ${LINE};background:radial-gradient(circle at 40% 35%,#f3f6f9,#cfd8e1);filter:blur(9px);box-shadow:0 0 60px rgba(95,163,214,.35)"></div>` + kw('small', 1545, 560, 220, 'Member', 'center', 'filter:blur(5px)') + kw('big', 100, 740, 1720, '<em>Not</em> the member.', 'center') + finish(false)]] },
  { id: '5', sec: 13, voice: "All communication passes through MyPlatform's Operator, who relays every message between the two sides.", screen: '"Through the Operator." (centre circle: "MyPlatform" with "Operator" under it)',
    moves: 'The real Mailbox (the two spots that show the plural are covered) dissolves into the diagram: glowing envelopes travel along the lanes in both directions; the centre circle pulses outward when a message arrives and again when it is forwarded; light trails follow each envelope; the camera drifts back slightly.',
    next: 'Both member lines pull together to the centre and the two rings become the two hands of act 6.',
    frames: [['a', appImg('mailbox.png') + covered() + finish(false, true)], ['b', operator() + kw('small', 150, 560, 340, 'Member', 'center') + kw('small', 1430, 560, 340, 'Member', 'center') + kw('word', 760, 418, 400, 'MyPlatform', 'center', 'font-size:42px') + kw('small', 760, 480, 400, 'Operator', 'center', 'font-size:24px') + kw('big', 160, 760, 1600, 'Through the <em>Operator.</em>', 'center') + motes(18, GLOWB) + finish(false)]] },
  { id: '6', sec: 16, voice: 'Introduction follows only once both sides agree on the essential terms and conditions and wish to proceed.', screen: '"Mutual agreement. Then the introduction." / then, ~10 s, the written card (not spoken) UNDER the dimmed handshake',
    moves: 'v13: a well-drawn, anatomically natural handshake (route b: a public-domain Openclipart drawing, only its outlines used and restyled: our skin tones, suit sleeves with fabric folds and weave, shirt cuffs, soft rounded lighting, a shadow from the upper hand on the lower, the arms fading softly into the page). The hands glide in from the sides and meet; a bloom of light opens at the clasp and sparks drift outward; the hands softly breathe (1 %). Then the picture dims to ~26 % and the written card, static, shows through the dimmed handshake: dark text on white, about 10 s.',
    next: 'The dimmed handshake fades out; the card\'s top edge becomes the paper edge of act 7.',
    frames: [['a', hands(-40) + kw('big', 100, 790, 1720, '<em>Mutual agreement.</em><br><span style="font-size:64px">Then the introduction.</span>', 'center') + finish(false)],
      ['b', `<div class="abs" style="left:210px;top:260px;width:1500px;padding:56px 70px;background:#fff;border:1px solid ${LINE};border-radius:12px;font-family:Spectral,serif;font-weight:400;font-size:46px;line-height:1.35;color:${INK};text-align:center;box-shadow:0 30px 80px rgba(21,32,43,.12)">Membership is provided without any membership or access fees. The Operator of MyPlatform is remunerated by commission on successfully concluded transactions resulting from introductions made through MyPlatform.</div><div class="abs" style="inset:0;opacity:.26;mix-blend-mode:multiply">${hands(60)}</div>` + finish(false)]] },
  { id: '7', sec: 9, voice: 'MyPlatform, the commercial intermediary, introduces; members transact on the strength of their own judgement and due diligence.', screen: '"Each member warrants their own representations."',
    moves: 'v12: a fountain pen glides across the paper and writes a calligraphic signature (thick downstrokes, hairline upstrokes, an initial with a loop, a long underline flourish): the ink line is drawn progressively by the nib (this still is about 80 % in; the flourish is still to come), wet and glossy only at the newest part, drying matte behind the nib; a soft glint travels with the nib; light blooms behind the paper; bokeh drifts in the foreground and the pen\'s shadow follows on the page.',
    next: 'The signature\'s underline lengthens into the hairline under the closing phrase in act 8.',
    frames: [['', signing() + kw('mid', 100, 880, 1720, 'Each member warrants <em>their own</em> representations.', 'center') + finish(false)]] },
  { id: '8', sec: 6, voice: 'Where opportunity meets discretion.', screen: '"MyPlatform" above "Where opportunity meets discretion." (no fee card, no web address)',
    moves: 'The act-1 globe returns, faint and softly blurred, rotating slowly behind; the name fades in, the phrase fades in, the hairline draws itself with a travelling glint; music resolves, low tone, fade to white.',
    next: 'End.',
    frames: [['', globe(960, 560, 560, 28, { op: .2, blur: 1.5, id: 'g8' }) + motes(14, GLOWB, .7) + hair(560, 1360, 630) + kw('mid word', 110, 250, 1700, 'MyPlatform', 'center') + kw('big', 110, 370, 1700, 'Where opportunity<br>meets <em>discretion.</em>', 'center') + finish(false)]] },
];

let SFX = {}, SFXSRC = '';
try { const s = JSON.parse(fs.readFileSync(path.join(__dirname, 'sfx.json'), 'utf8')); SFX = s.perAct; SFXSRC = s.sources; } catch (e) { SFXSRC = '(sfx.json missing)'; }
const LEVELS = 'All effects well under the music (about 20 dB below it); no effect longer than 1 s except the two low tones (about 2 s, fading). CC0 only; URL and licence of every file recorded above.';

(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  for (const a of acts) for (const [suffix, html] of a.frames) {
    await page.setContent(`<style>${css}</style>${DEFS}<div class="stage${a.dark ? ' dark' : ''}">${html}</div>`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(out, `act-${a.id}${suffix}.png`) });
  }
  await browser.close();
  let t = '| act | seconds | voice (exact) | on screen | what moves | match move into the next act | stills | sound effects (planned) |\n|---|---|---|---|---|---|---|---|\n';
  for (const a of acts) t += `| ${a.id} | ${a.sec} | ${a.voice} | ${a.screen} | ${a.moves} | ${a.next} | ${a.frames.map((f) => `act-${a.id}${f[0]}.png`).join(', ')} | ${SFX[a.id] || '(sfx.json missing)'} |\n`;
  t += `| | **${acts.reduce((s, a) => s + a.sec, 0)}** | | | | | | |\n`;
  t += `\n${LEVELS}\n\n${SFXSRC}\n`;
  fs.writeFileSync(path.join(out, 'storyboard.md'), '# Storyboard v14 - stills only\n\nLight app colours (#ffffff, #15202b, #52677a, #27618f, #f0f6fb, #e2ebf3), key words only, match moves. Act 2 is daylight, pale morning haze (v13), with a realistic container ship (v14). v14: both hands the same light skin tone, softer nails, lighter radar dials. Music: "Corporate advertising" (Nastelbom, Pixabay), kept out of the repository. Seconds are planned, not measured. App pictures are real screenshots (pieces lit or covered); globe, pen and the diagram are code-drawn; the ship is the Openclipart drawing "Cargo Ship" by j4p4n (CC0 / public domain, https://openclipart.org/download/322884/ , detail page https://openclipart.org/detail/322884/cargo-ship) cut at the waterline, with our haze, light, reflections and radar; the handshake restyles the outlines of Openclipart 57067 (Handshake with Black Outline, by palomaironique, public domain, https://openclipart.org/download/57067/Handshake-03.svg).\n\n' + t);
})();
