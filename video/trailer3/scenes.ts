// @ts-nocheck
// Trailer sample (acts 1-2): the storyboard v14/v15 drawings, now driven by time. Pure string builders: no photos, no stock.
// Source drawings: globe and haze/radar are ours; the ship is the CC0 Openclipart drawing "Cargo Ship" (j4p4n, https://openclipart.org/detail/322884).
export const INK = '#15202b', BLUE = '#27618f', SLATE = '#52677a', LINE = '#c9d7e4', GLOWB = '#5fa3d6';
const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const smooth = (x) => { x = cl(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
export const DEFS = `<svg width="0" height="0" style="position:absolute"><defs>
<filter id="g4" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
<filter id="g8" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
<filter id="g16" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="16"/></filter>
<filter id="g40" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="40"/></filter>
<filter id="g70" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="70"/></filter>
<filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<radialGradient id="rgBlue"><stop offset="0" stop-color="${GLOWB}" stop-opacity=".9"/><stop offset="1" stop-color="${GLOWB}" stop-opacity="0"/></radialGradient>
<radialGradient id="rgWhite"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset=".4" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<radialGradient id="rgWarm"><stop offset="0" stop-color="#fff4cf" stop-opacity=".95"/><stop offset="1" stop-color="#ffd98a" stop-opacity="0"/></radialGradient>
</defs></svg>`;
export const SV = (inner, extra = '') => `<svg width="1920" height="1080" viewBox="0 0 1920 1080" fill="none" stroke-linecap="round" stroke-linejoin="round" style="position:absolute;left:0;top:0" ${extra}>${inner}</svg>`;
let seed = 7; const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// drifting light motes; fixed positions from a seed, moved by time (far ones slower, near ones faster)
const MOTES = (() => { seed = 11; const a = []; for (let i = 0; i < 26; i++) { const near = rnd() < 0.3; a.push({ x: rnd() * 1920, y: rnd() * 1080, r: near ? 14 + rnd() * 30 : 2 + rnd() * 5, near, v: near ? 14 : 5, ph: rnd() * 6.28 }); } return a; })();
export const motes = (t, color) => SV(MOTES.map((m) => `<circle cx="${(((m.x + t * m.v) % 1980) - 30).toFixed(0)}" cy="${(m.y + Math.sin(t * .6 + m.ph) * 10).toFixed(0)}" r="${m.r.toFixed(1)}" fill="${color}" opacity="${(m.near ? 0.1 : 0.45)}" ${m.near ? 'filter="url(#g8)"' : ''} stroke="none"/>`).join(''));

// ---------------------------------------------------------------- act 1: globe
const LAND = [[-120, 55, 25, 12], [-100, 42, 30, 18], [-80, 30, 12, 10], [-100, 20, 12, 8], [-60, -12, 16, 24], [-70, -40, 6, 14], [-5, 40, 10, 7], [15, 52, 20, 10], [18, 66, 10, 7], [20, 5, 21, 28], [30, -20, 10, 14], [47, -19, 3, 8], [90, 55, 55, 12], [70, 40, 30, 12], [45, 25, 12, 10], [78, 20, 9, 11], [105, 30, 18, 14], [110, 5, 8, 5], [118, -2, 14, 5], [140, 37, 4, 8], [135, -25, 17, 11]];
const isLand = (lon, lat) => LAND.some(([cx, cy, rx, ry]) => ((lon - cx) / rx) ** 2 + ((lat - cy) / ry) ** 2 < 1);
const PORT = { val: [-72, -33], rdam: [4, 52], dbn: [31, -30], sha: [121, 31], hou: [-95, 29], sin: [104, 1], santos: [-46, -24], lagos: [3, 6], mba: [40, -4], bom: [73, 19], dxb: [55, 25], per: [116, -32], la: [-118, 34], psd: [32, 31], tyo: [140, 36], van: [-123, 49], cal: [-77, -12], tema: [0, 5], gla: [151, -23], ny: [-74, 41], cpt: [18, -34], hou2: [-90, 30] };
const ROUTES = [['val', 'rdam', 1], ['dbn', 'rdam', 0], ['dbn', 'sha', 0], ['sin', 'rdam', 0], ['hou', 'rdam', 0], ['val', 'sha', 0], ['santos', 'rdam', 0], ['santos', 'cpt', 0], ['lagos', 'rdam', 0], ['mba', 'bom', 0], ['dxb', 'sha', 0], ['per', 'sin', 0], ['la', 'tyo', 0], ['psd', 'rdam', 0], ['tema', 'santos', 0], ['cpt', 'per', 0], ['dxb', 'rdam', 0], ['ny', 'rdam', 1], ['cal', 'la', 0], ['gla', 'sha', 0], ['bom', 'sin', 0], ['mba', 'dbn', 0]];
export function globe(cx, cy, R, lon0, t) {
  const tilt = 20 * Math.PI / 180, id = 'gl';
  const vec = (lon, lat) => { const a = (lon - lon0) * Math.PI / 180, b = lat * Math.PI / 180; return [Math.cos(b) * Math.sin(a), Math.sin(b), Math.cos(b) * Math.cos(a)]; };
  const proj = (v) => { const y = v[1] * Math.cos(tilt) - v[2] * Math.sin(tilt), z = v[1] * Math.sin(tilt) + v[2] * Math.cos(tilt); return [cx + v[0] * R, cy - y * R, z]; };
  let g = `<defs><radialGradient id="${id}s" cx=".36" cy=".3" r=".9"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#eef4fa"/><stop offset="1" stop-color="#c3d6e8"/></radialGradient>
  <radialGradient id="${id}a" cx=".5" cy=".5" r=".5"><stop offset=".78" stop-color="${GLOWB}" stop-opacity="0"/><stop offset=".9" stop-color="${GLOWB}" stop-opacity=".28"/><stop offset="1" stop-color="${GLOWB}" stop-opacity="0"/></radialGradient>
  <radialGradient id="${id}d" cx=".35" cy=".3" r=".85"><stop offset=".55" stop-color="#15202b" stop-opacity="0"/><stop offset="1" stop-color="#15202b" stop-opacity=".22"/></radialGradient>
  <linearGradient id="${id}w" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <clipPath id="${id}c"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath></defs>`;
  g += `<ellipse cx="${cx}" cy="${cy + R * 1.14}" rx="${R * 0.86}" ry="${R * 0.07}" fill="${INK}" opacity=".16" filter="url(#g40)" stroke="none"/>`;
  g += `<circle cx="${cx}" cy="${cy}" r="${R * 1.28}" fill="url(#${id}a)" stroke="none"/><circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#${id}s)" stroke="none"/>`;
  for (let lon = -180; lon < 180; lon += 20) { let d = '', on = false; for (let lat = -90; lat <= 90; lat += 4) { const p = proj(vec(lon, lat)); if (p[2] > 0) { d += (on ? 'L' : 'M') + `${p[0].toFixed(1)} ${p[1].toFixed(1)}`; on = true; } else on = false; } g += `<path d="${d}" stroke="#b9cde0" stroke-width="1" opacity=".7"/>`; }
  for (let lat = -70; lat <= 70; lat += 20) { let d = '', on = false; for (let lon = -180; lon <= 180; lon += 4) { const p = proj(vec(lon, lat)); if (p[2] > 0) { d += (on ? 'L' : 'M') + `${p[0].toFixed(1)} ${p[1].toFixed(1)}`; on = true; } else on = false; } g += `<path d="${d}" stroke="#b9cde0" stroke-width="1" opacity=".7"/>`; }
  for (let lat = -82; lat <= 82; lat += 2.4) for (let lon = -180; lon < 180; lon += 2.4 / Math.max(0.25, Math.cos(lat * Math.PI / 180))) {
    if (!isLand(lon, lat)) continue; const p = proj(vec(lon, lat)); if (p[2] <= 0.03) continue;
    g += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${(0.9 + p[2] * 1.9).toFixed(1)}" fill="${p[2] > .7 ? '#3d5a75' : SLATE}" stroke="none" opacity="${(0.3 + p[2] * 0.62).toFixed(2)}"/>`;
  }
  g += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#${id}d)" stroke="none"/>`;
  const slerp = (a, b, tt) => { const d = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])), s = Math.sin(d); if (!s) return a; const k1 = Math.sin((1 - tt) * d) / s, k2 = Math.sin(tt * d) / s; return [0, 1, 2].map((i) => a[i] * k1 + b[i] * k2); };
  let comets = '', routesBase = '', routesHot = '';
  ROUTES.forEach(([a, b, hot], i) => {
    const A = vec(...PORT[a]), B = vec(...PORT[b]); const pts = [];
    for (let u = 0; u <= 1.001; u += 0.02) { const v = slerp(A, B, u), lift = 1 + 0.07 * Math.sin(Math.PI * u), p = proj([v[0] * lift, v[1] * lift, v[2] * lift]); pts.push({ t: u, x: p[0], y: p[1], front: proj(v)[2] > 0.02 }); }
    const path = (lo, hi) => { let d = '', on = false; for (const p of pts) { if (p.t < lo || p.t > hi || !p.front) { on = false; continue; } d += (on ? 'L' : 'M') + `${p.x.toFixed(1)} ${p.y.toFixed(1)}`; on = true; } return d; };
    routesBase += `<path d="${path(0, 1)}" stroke="${hot ? BLUE : SLATE}" stroke-width="${hot ? 1.8 : 1.1}" opacity="${hot ? .6 : .38}"/>`;
    // the lit stretch of every route travels from its start to its end, then starts again (each route on its own beat)
    const len = 0.3 + (hot ? .25 : 0), ph = ((i * 0.137 + t * 0.11) % 1) * (1 + len), h1 = Math.min(1, ph), h0 = Math.max(0, ph - len);
    if (h1 > h0) routesHot += `<path d="${path(h0, h1)}" stroke="${GLOWB}" stroke-width="${hot ? 4.2 : 2.6}" filter="url(#glow)"/><path d="${path(h0, h1)}" stroke="#fff" stroke-width="${hot ? 1.6 : 1}" opacity=".95"/>`;
    const hp = pts.find((p) => p.t >= h1 - 0.02 && p.front); if (hp && h1 > h0 && h1 < 1) comets += `<circle cx="${hp.x.toFixed(1)}" cy="${hp.y.toFixed(1)}" r="16" fill="url(#rgWhite)" stroke="none"/><circle cx="${hp.x.toFixed(1)}" cy="${hp.y.toFixed(1)}" r="4.2" fill="#fff" stroke="${BLUE}" stroke-width="1.6"/>`;
  });
  g += routesBase + routesHot + comets;
  let k = 0;
  for (const key of Object.keys(PORT)) {
    const p = proj(vec(...PORT[key])); if (p[2] <= 0.05) continue; const s = 0.7 + p[2] * 0.5, pulse = 1 + 0.18 * Math.sin(t * 3 + k);
    g += `<circle cx="${p[0]}" cy="${p[1]}" r="${36 * s}" fill="url(#rgBlue)" stroke="none" opacity=".75"/>`;
    if (k++ % 2 === 0) g += `<circle cx="${p[0]}" cy="${p[1]}" r="${22 * s * pulse}" stroke="${GLOWB}" stroke-width="1.4" opacity=".7"/><circle cx="${p[0]}" cy="${p[1]}" r="${32 * s * pulse}" stroke="${GLOWB}" stroke-width="1" opacity=".35"/>`;
    g += `<circle cx="${p[0]}" cy="${p[1]}" r="${8.5 * s}" fill="#fff" stroke="${BLUE}" stroke-width="2.4"/><circle cx="${p[0]}" cy="${p[1]}" r="${3.2 * s}" fill="${BLUE}" stroke="none"/>`;
  }
  const sx = cx - R * 1.1 + ((t / 6) % 1) * R * 2.4;
  g += `<g clip-path="url(#${id}c)"><rect x="${sx}" y="${cy - R * 1.2}" width="${R * 0.5}" height="${R * 2.4}" fill="url(#${id}w)" transform="rotate(24 ${cx} ${cy})" opacity=".45" stroke="none"/></g>`;
  g += `<circle cx="${cx}" cy="${cy}" r="${R}" stroke="#fff" stroke-width="3" opacity=".9"/><circle cx="${cx}" cy="${cy}" r="${R + 2}" stroke="${GLOWB}" stroke-width="1.5" opacity=".5"/>`;
  return SV(g);
}

// ---------------------------------------------------------------- act 2: daylight haze, ship, radar
const fogDef = (id, y, h, sd, freq, rgb) => { const [r, g2, b] = rgb.split(' '); return `<linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient><filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="4" seed="${sd}"/><feColorMatrix type="matrix" values="0 0 0 0 ${r}  0 0 0 0 ${g2}  0 0 0 0 ${b}  0 0 0 2.4 -.7"/></filter>`; };
const fogHole = (id, y, h, hx, hy, hrx, hry) => `<mask id="${id}h" maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080"><rect x="0" y="${y}" width="1920" height="${h}" fill="url(#${id}g)"/><ellipse cx="${hx}" cy="${hy}" rx="${Math.max(1, hrx)}" ry="${Math.max(1, hry)}" fill="#000" filter="url(#g40)"/></mask>`;
const fogUseH = (id, op, dx) => `<g mask="url(#${id}h)" opacity="${op.toFixed(3)}"><rect x="${dx.toFixed(1)}" width="2200" height="1080" filter="url(#${id})" stroke="none" fill="#000"/></g>`;
const fogUse = (id, op, dx) => `<g mask="url(#${id}m)" opacity="${op}"><rect x="${dx.toFixed(1)}" width="2200" height="1080" filter="url(#${id})" stroke="none" fill="#000"/></g>`;
const shipSym = (href) => `<symbol id="shipSym" viewBox="0 0 1822.84 595.28"><image href="${href}" width="1822.84" height="595.28"/></symbol><clipPath id="wlclip"><rect x="0" y="0" width="1900" height="523"/></clipPath>`;
const shipImg = (x, wl, s) => `<g transform="translate(${x} ${wl - 523 * s}) scale(${s})"><g clip-path="url(#wlclip)"><use href="#shipSym" width="1822.84" height="595.28"/></g></g>`;
function radarDay(cx, cy, r, blipA, crispA, sweep) {
  let g = `<circle cx="${cx}" cy="${cy + 8}" r="${r + 18}" fill="#15202b" opacity=".22" filter="url(#g16)" stroke="none"/><circle cx="${cx}" cy="${cy}" r="${r + 18}" fill="#f6fafd" stroke="#9bb7cc" stroke-width="2.4"/>`;
  g += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#e9f4fb" stroke="#7fa6c4" stroke-width="2"/>`;
  for (const f of [.25, .5, .75]) g += `<circle cx="${cx}" cy="${cy}" r="${r * f}" stroke="#7fa6c4" stroke-width="1" opacity=".6"/>`;
  g += `<path d="M${cx - r} ${cy} H${cx + r} M${cx} ${cy - r} V${cy + r}" stroke="#7fa6c4" stroke-width="1" opacity=".5"/>`;
  for (let k = 0; k < 36; k++) { const a = k * Math.PI / 18, l = k % 3 ? 7 : 14; g += `<path d="M${cx + Math.cos(a) * (r - l)} ${cy + Math.sin(a) * (r - l)} L${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r}" stroke="#52677a" stroke-width="1.2" opacity=".6"/>`; }
  const a0 = sweep;
  for (let k = 0; k < 8; k++) { const aa = a0 - k * 0.2, ab = a0 - (k + 1) * 0.2; g += `<path d="M${cx} ${cy} L${cx + r * Math.cos(aa)} ${cy + r * Math.sin(aa)} A${r} ${r} 0 0 0 ${cx + r * Math.cos(ab)} ${cy + r * Math.sin(ab)} Z" fill="#27618f" opacity="${(0.34 * (1 - k / 8)).toFixed(3)}" stroke="none"/>`; }
  g += `<path d="M${cx} ${cy} L${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)}" stroke="#27618f" stroke-width="2.8" filter="url(#glow)"/>`;
  const bx = cx + r * .44, by = cy - r * .34;
  if (blipA > 0.01) g += `<g opacity="${blipA.toFixed(3)}"><circle cx="${bx}" cy="${by}" r="${r * .26}" fill="#27618f" opacity=".45" filter="url(#g8)" stroke="none"/><circle cx="${bx}" cy="${by}" r="${r * .1}" fill="#15202b" filter="url(#g4)" stroke="none"/><text x="${bx}" y="${by + 11}" text-anchor="middle" font-family="Spectral,serif" font-size="32" fill="#15202b" opacity=".9" stroke="none" filter="url(#g4)">?</text></g>`;
  if (crispA > 0.01) g += `<g opacity="${crispA.toFixed(3)}"><circle cx="${bx}" cy="${by}" r="${r * .3}" stroke="#27618f" stroke-width="1.6" filter="url(#glow)"/><g transform="translate(${bx} ${by}) scale(.1)" stroke="none" filter="url(#g4)"><path d="M-300 20 H300 L330 20 L280 80 H-250 Z" fill="#15202b"/><rect x="-260" y="-90" width="440" height="110" fill="#15202b" opacity=".9"/><rect x="-250" y="-190" width="140" height="100" fill="#15202b"/></g></g>`;
  return g;
}
// t = seconds into act 2; r = reveal progress 0..1 (haze parts over the near ship)
export function seaDay(t, r, shipHref) {
  const WL = 742, SC = 0.76, HZ = 570, X0 = 40 + t * 3, bob = Math.sin(t * 1.3) * 1.6;
  const hx = X0 + 900 * SC, hy = WL - 110; seed = 99;
  let g = `<defs>${shipSym(shipHref)}
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6fafd"/><stop offset=".7" stop-color="#e3edf6"/><stop offset="1" stop-color="#d4e3ef"/></linearGradient>
  <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d3e3ef"/><stop offset=".25" stop-color="#a9c8de"/><stop offset="1" stop-color="#7fa6c4"/></linearGradient>
  <linearGradient id="rf" gradientUnits="userSpaceOnUse" x1="0" y1="${WL}" x2="0" y2="${WL + 260}"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
  <mask id="rfm" maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080"><rect x="0" y="${WL}" width="1920" height="320" fill="url(#rf)"/></mask>
  <linearGradient id="ray" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff8e0" stop-opacity=".85"/><stop offset="1" stop-color="#fff8e0" stop-opacity="0"/></linearGradient>
  <filter id="rip" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="turbulence" baseFrequency="0.0025 0.09" numOctaves="2" seed="4" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="22" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="2.5"/></filter>
  ${fogDef('hb', 440, 330, 21, '0.003 0.010', '.93 .97 1')}${fogDef('hm', 560, 300, 22, '0.0035 0.013', '.9 .95 1')}${fogDef('hf', 840, 240, 23, '0.003 0.01', '.92 .96 1')}${fogDef('hs', 60, 360, 24, '0.002 0.008', '1 1 1')}
  <mask id="hsm" maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080"><rect x="0" y="60" width="1920" height="360" fill="url(#hsg)"/></mask>
  ${fogHole('hm', 560, 300, hx, hy, 560 * r, 190 * r)}${fogHole('hf', 840, 240, hx, WL + 40, 560 * r, 150 * r)}${fogHole('hb', 440, 330, hx, hy - 60, 520 * r, 190 * r)}</defs>`;
  g += `<rect width="1920" height="${HZ}" fill="url(#sky)" stroke="none"/><rect y="${HZ}" width="1920" height="${1080 - HZ}" fill="url(#sea)" stroke="none"/>`;
  g += `<circle cx="1530" cy="150" r="330" fill="url(#rgWarm)" opacity="${(.45 + .15 * r).toFixed(2)}" stroke="none"/><circle cx="1530" cy="150" r="70" fill="#fffaf0" opacity=".85" filter="url(#g16)" stroke="none"/>`;
  g += fogUse('hs', .5, -100 + t * 4);
  g += `<ellipse cx="960" cy="${HZ + 6}" rx="1100" ry="46" fill="#fff" opacity=".85" filter="url(#g40)" stroke="none"/><rect x="0" y="${HZ - 1}" width="1920" height="2" fill="#fff" opacity=".7" filter="url(#g4)" stroke="none"/>`;
  g += `<g opacity=".45" filter="url(#g4)" transform="translate(${3580 - t * 2} 0) scale(-1 1)">${shipImg(1790, 640 + bob * .3, 0.22)}</g>`;
  g += fogUseH('hb', lerp(.95, .5, r), -80 + t * 6);
  g += `<ellipse cx="1500" cy="${HZ + 40}" rx="520" ry="26" fill="#fff" opacity=".6" filter="url(#g16)" stroke="none"/>`;
  for (let i = 0; i < 80; i++) { const y = HZ + 14 + Math.pow(i / 80, 1.7) * 470, w = 40 + rnd() * 240 * (0.5 + i / 40), x = (rnd() * 1920 + t * (4 + i * .3)) % 1960; g += `<path d="M${x.toFixed(0)} ${y.toFixed(0)} h${w.toFixed(0)}" stroke="#fff" stroke-width="${(0.8 + i / 30).toFixed(1)}" opacity="${(0.12 + rnd() * 0.28).toFixed(2)}"/>`; }
  g += `<g mask="url(#rfm)" opacity="${(.32 + .18 * r).toFixed(2)}"><g filter="url(#rip)"><g transform="translate(0 ${2 * WL}) scale(1 -1)">${shipImg(X0, WL + bob, SC)}</g></g></g>`;
  g += `<g style="filter:blur(${((1 - r) * 4).toFixed(2)}px)" opacity="${(.62 + .38 * r).toFixed(3)}">${shipImg(X0, WL + bob, SC)}</g>`;
  g += `<path d="M${X0 + 1690 * SC} ${WL} Q${X0 + 1745 * SC} ${WL - 10} ${X0 + 1790 * SC} ${WL + 2} Q${X0 + 1745 * SC} ${WL + 14} ${X0 + 1690 * SC} ${WL + 6} Z" fill="#10243a" opacity=".85" stroke="none"/><ellipse cx="${X0 + 1760 * SC}" cy="${WL + 2}" rx="${120 + 10 * Math.sin(t * 2)}" ry="11" fill="#fff" opacity=".85" filter="url(#g8)" stroke="none"/><ellipse cx="${X0 + 40}" cy="${WL + 6}" rx="150" ry="9" fill="#fff" opacity=".5" filter="url(#g8)" stroke="none"/>`;
  g += fogUseH('hm', lerp(.95, .32, r), 60 - t * 10);
  g += `<rect x="0" y="470" width="1920" height="320" fill="#e8f1f8" opacity="${(.3 * (1 - r)).toFixed(3)}" filter="url(#g40)" stroke="none"/>`;
  if (r > 0.01) {
    for (const [a, b, w] of [[1440, 520, 90], [1560, 600, 120], [1330, 430, 60]]) g += `<path d="M${a + Math.sin(t * .5) * 12} -40 L${a + w} -40 L${b + 260} ${WL - 40} L${b - 220} ${WL - 40} Z" fill="url(#ray)" opacity="${(.5 * r).toFixed(3)}" filter="url(#g16)" stroke="none"/>`;
    g += `<ellipse cx="${hx}" cy="${hy}" rx="560" ry="150" fill="url(#rgWarm)" opacity="${(.4 * r).toFixed(3)}" stroke="none"/>`;
    for (let i = 0; i < 70; i++) { const x = 160 + rnd() * 1000, y = WL + 12 + rnd() * 150, w = 6 + rnd() * 28, tw = .55 + .45 * Math.sin(t * 6 + i * 1.7); g += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="2.2" fill="#fff" opacity="${((0.5 + rnd() * .5) * r * tw).toFixed(2)}" stroke="none"/>`; }
  }
  g += fogUseH('hf', lerp(.85, .45, r), -120 + t * 16);
  const sw = -0.9 + t * 1.57;
  g += radarDay(310, 930, 100, 1, 0, sw) + radarDay(1610, 930, 100, 1 - smooth((r - .35) / .4), smooth((r - .35) / .4), sw);
  return SV(g);
}
