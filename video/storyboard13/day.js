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
  g += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#0c2638" stroke="#27618f" stroke-width="2"/>`;
  for (const f of [.25, .5, .75]) g += `<circle cx="${cx}" cy="${cy}" r="${r * f}" stroke="#7cc4f0" stroke-width="1" opacity=".38"/>`;
  g += `<path d="M${cx - r} ${cy} H${cx + r} M${cx} ${cy - r} V${cy + r}" stroke="#7cc4f0" stroke-width="1" opacity=".3"/>`;
  for (let k = 0; k < 36; k++) { const a = k * Math.PI / 18, l = k % 3 ? 7 : 14; g += `<path d="M${cx + Math.cos(a) * (r - l)} ${cy + Math.sin(a) * (r - l)} L${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r}" stroke="#9fd8ff" stroke-width="1.2" opacity=".65"/>`; }
  const a0 = -52 * Math.PI / 180;
  for (let k = 0; k < 8; k++) { const aa = a0 - k * 0.2, ab = a0 - (k + 1) * 0.2; g += `<path d="M${cx} ${cy} L${cx + r * Math.cos(aa)} ${cy + r * Math.sin(aa)} A${r} ${r} 0 0 0 ${cx + r * Math.cos(ab)} ${cy + r * Math.sin(ab)} Z" fill="#5fd0ff" opacity="${(0.5 * (1 - k / 8)).toFixed(3)}" stroke="none"/>`; }
  g += `<path d="M${cx} ${cy} L${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)}" stroke="#d8f4ff" stroke-width="2.8" filter="url(#glow)"/>`;
  const bx = cx + r * .44, by = cy - r * .34;
  if (mode === 'blip') g += `<circle cx="${bx}" cy="${by}" r="${r * .26}" fill="#7cc4f0" opacity=".55" filter="url(#g8)" stroke="none"/><circle cx="${bx}" cy="${by}" r="${r * .1}" fill="#e9f7ff" filter="url(#g4)" stroke="none"/><text x="${bx}" y="${by + 11}" text-anchor="middle" font-family="Spectral,serif" font-size="32" fill="#e9f7ff" opacity=".95" stroke="none" filter="url(#g4)">?</text>`;
  else g += `<circle cx="${bx}" cy="${by}" r="${r * .3}" stroke="#9fd8ff" stroke-width="1.6" filter="url(#glow)"/><g transform="translate(${bx} ${by}) scale(.1)" stroke="none" filter="url(#g4)"><path d="M-300 20 H300 L330 20 L280 80 H-250 Z" fill="#e9f7ff"/><rect x="-260" y="-90" width="440" height="110" fill="#e9f7ff" opacity=".9"/><rect x="-250" y="-190" width="140" height="100" fill="#e9f7ff"/></g>`;
  return g;
}
function seaDay(stage) {
  const clear = !!stage, WL = 742, SC = 1.5, X0 = 70, HZ = 570;
  const hx = X0 + 470 * SC, hy = WL - 120;
  let g = `<defs>${BEVEL}
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
  g += `<g opacity=".45" filter="url(#g4)" transform="translate(3580 0) scale(-1 1)">${shipDay('far', 1790, 640, 0.5)}</g>`;
  g += clear ? fogUseH('hb', .7, -80) : fogUse('hb', .95, -80);
  g += `<ellipse cx="1500" cy="${HZ + 40}" rx="520" ry="26" fill="#fff" opacity=".6" filter="url(#g16)" stroke="none"/>`;
  for (let i = 0; i < 80; i++) { const y = HZ + 14 + Math.pow(i / 80, 1.7) * 470, w = 40 + r13() * 240 * (0.5 + i / 40), x = r13() * 1920; g += `<path d="M${x.toFixed(0)} ${y.toFixed(0)} h${w.toFixed(0)}" stroke="#fff" stroke-width="${(0.8 + i / 30).toFixed(1)}" opacity="${(0.12 + r13() * 0.28).toFixed(2)}"/>`; }
  // near ship (reflection first); veiled in 2a, sharp in 2b
  g += `<g mask="url(#rfm)" opacity="${clear ? .5 : .32}"><g filter="url(#rip)"><g transform="translate(0 ${2 * WL}) scale(1 -1)">${shipDay('nearr', X0, WL, SC)}</g></g></g>`;
  g += clear ? `<g filter="url(#bevelS)">${shipDay('near', X0, WL, SC)}</g>` : `<g opacity=".62" filter="url(#g4)">${shipDay('near', X0, WL, SC)}</g>`;
  g += `<ellipse cx="${X0 + 816 * SC}" cy="${WL - 4}" rx="130" ry="12" fill="#fff" opacity=".8" filter="url(#g8)" stroke="none"/><ellipse cx="${X0 + 60}" cy="${WL + 6}" rx="150" ry="9" fill="#fff" opacity=".5" filter="url(#g8)" stroke="none"/>`;
  g += clear ? fogUseH('hm', .5, 60) : fogUse('hm', .95, 60);
  if (!clear) g += `<rect x="0" y="470" width="1920" height="320" fill="#e8f1f8" opacity=".3" filter="url(#g40)" stroke="none"/>`;
  if (clear) { // a sunlit clearing: warm shafts through the parted haze, the cargo lit, sparkle on the water
    for (const [a, b, w] of [[1440, 520, 90], [1560, 600, 120], [1330, 430, 60]]) g += `<path d="M${a} -40 L${a + w} -40 L${b + 260} ${WL - 40} L${b - 220} ${WL - 40} Z" fill="url(#ray)" opacity=".5" filter="url(#g16)" stroke="none"/>`;
    g += `<ellipse cx="${hx}" cy="${hy}" rx="520" ry="160" fill="url(#rgWarm)" opacity=".55" stroke="none"/>`;
    for (let i = 0; i < 70; i++) { const x = 160 + r13() * 1000, y = WL + 12 + r13() * 150, w = 6 + r13() * 28; g += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="2.2" fill="#fff" opacity="${(0.5 + r13() * .5).toFixed(2)}" stroke="none"/>`; }
  }
  g += clear ? fogUseH('hf', .45, -120) : fogUse('hf', .85, -120);
  g += radarDay(310, 930, 100, 'blip') + radarDay(1610, 930, 100, clear ? 'crisp' : 'blip');
  return SV(g);
}
