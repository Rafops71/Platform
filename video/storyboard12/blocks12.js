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
const sea = (stage) => { sea11(stage); return sea12(stage); };

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
const hands = (dy) => { hands11(dy); return hands12(dy); };

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
