// @ts-nocheck
// Full trailer (8 acts): time-driven versions of the approved storyboard drawings. No photos, no stock, no voice, no music.
import { DEFS, SV, INK, BLUE, SLATE, LINE, GLOWB, smooth } from "./scenes";
import { HSP } from "./handshakeData";
let seed12 = 12345; const r12 = () => { seed12 |= 0; seed12 = (seed12 + 0x6D2B79F5) | 0; let t = Math.imul(seed12 ^ (seed12 >>> 15), 1 | seed12); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let seed13 = 4242; const r13 = () => { seed13 |= 0; seed13 = (seed13 + 0x6D2B79F5) | 0; let t = Math.imul(seed13 ^ (seed13 >>> 15), 1 | seed13); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const EXTRA_DEFS = `<svg width="0" height="0" style="position:absolute"><defs><filter id="g1" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation=".7"/></filter><filter id="softglow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="12" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs></svg>`;
const SKIN_A = ['#f5d9c3', '#e2b28f', '#b9805f'];
const bevelDef = (id, std, surf, diff, spec) => `<filter id="${id}" x="-6%" y="-6%" width="112%" height="112%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="${std}" result="b"/>
<feDiffuseLighting in="b" surfaceScale="${surf}" diffuseConstant="${diff}" lighting-color="#fff" result="d"><feDistantLight azimuth="225" elevation="55"/></feDiffuseLighting>
<feComposite in="SourceGraphic" in2="d" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="lit"/>
<feSpecularLighting in="b" surfaceScale="${surf}" specularConstant=".8" specularExponent="26" lighting-color="#fff" result="s"><feDistantLight azimuth="225" elevation="40"/></feSpecularLighting>
<feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/><feComposite in="lit" in2="s2" operator="arithmetic" k1="0" k2="1" k3="${spec}" k4="0"/></filter>`;
const BEVEL = bevelDef('bevel', 8, 7, 1.2, .5) + bevelDef('bevelF', 4, 5, 1.1, .22) + bevelDef('bevelS', 9, 6, .8, .12) + bevelDef('bevelSkin', 6, 4, 1.05, .07);

export function hands13(dy = 0) {
  seed12 = 12345; seed13 = 4242; const P = HSP;
  const crease = HSP.crease, nails = HSP.nails;
  const sk = (id, c) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset=".55" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></linearGradient>`;
  const S = 1.1, ox = 960 - 467 * S, oy = 400 - 300 * S + dy;
  let g = `<defs>${BEVEL}<linearGradient id="skin3" gradientUnits="userSpaceOnUse" x1="0" y1="80" x2="0" y2="640"><stop offset="0" stop-color="#f3d6c0"/><stop offset=".5" stop-color="#eec5a8"/><stop offset="1" stop-color="#e6b698"/></linearGradient>
  <radialGradient id="blush3"><stop offset="0" stop-color="#e98a82" stop-opacity=".55"/><stop offset=".6" stop-color="#e98a82" stop-opacity=".18"/><stop offset="1" stop-color="#e98a82" stop-opacity="0"/></radialGradient>
  <filter id="pore3" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 .62  0 0 0 0 .38  0 0 0 0 .3  0 0 0 .5 -.08"/></filter>
  <clipPath id="cUp"><path d="${P.up}"/></clipPath><clipPath id="cWr"><path d="${P.wr}"/></clipPath>
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
  const SKINP = (d) => `<g filter="url(#bevelSkin)"><path d="${d}" fill="url(#skin3)"/></g>`;
  const warm = (clip, d) => `<g clip-path="url(#${clip})"><path d="${d}" fill="none" stroke="#e0746a" stroke-width="34" opacity=".3" filter="url(#g8)"/><path d="${d}" fill="none" stroke="#fff" stroke-width="10" opacity=".22" filter="url(#g8)" transform="translate(-3 -4)"/></g>`;
  g += SKINP(P.low) + warm('cLow', P.low);
  g += `<g clip-path="url(#cLow)"><path d="${P.up}" fill="none" stroke="#7a3f2a" stroke-width="20" opacity=".16" filter="url(#g8)" transform="translate(-3 6)"/></g>`;
  g += SKINP(P.up) + SKINP(P.wr) + warm('cUp', P.up) + warm('cWr', P.wr);
  // pink knuckles and fingertips, a faint pore texture, fine creases (no hard outlines)
  const blush = [[565, 430, 44], [512, 490, 44], [462, 546, 42], [254, 322, 30], [385, 528, 28], [434, 582, 28], [451, 632, 26], [260, 330, 40]];
  g += `<g clip-path="url(#cLow)">` + blush.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#blush3)"/>`).join('') + `</g><g clip-path="url(#cUp)"><circle cx="262" cy="326" r="34" fill="url(#blush3)"/><circle cx="300" cy="290" r="40" fill="url(#blush3)" opacity=".6"/><circle cx="430" cy="170" r="130" fill="url(#blush3)" opacity=".35"/><circle cx="560" cy="250" r="90" fill="url(#blush3)" opacity=".3"/></g>`;
  g += `<g opacity=".3" style="mix-blend-mode:multiply"><g clip-path="url(#cLow)"><rect x="0" y="0" width="1000" height="700" filter="url(#pore3)"/></g><g clip-path="url(#cUp)"><rect x="0" y="0" width="1000" height="700" filter="url(#pore3)"/></g></g>`;
  g += `<path d="${P.up}" fill="none" stroke="${SKIN_A[2]}" stroke-width="1" opacity=".18"/><path d="${P.low}" fill="none" stroke="${SKIN_A[2]}" stroke-width="1" opacity=".16"/>`;
  for (const d of crease) g += `<path d="${d}" fill="none" stroke="#a8644a" stroke-width="1.3" opacity=".34" filter="url(#g1)"/>`;
  for (const [x, y] of [[560, 428], [508, 486], [458, 542]]) g += `<path d="M${x - 16} ${y - 10} q8 4 22 -2 M${x - 18} ${y + 2} q9 4 24 -3 M${x - 14} ${y + 14} q8 3 20 -2" stroke="#a8644a" stroke-width=".9" opacity=".28" fill="none"/>`;
  for (const d of nails) g += `<path d="${d}" fill="#efd2bd" stroke="#c99c86" stroke-width=".6" opacity=".5"/>`;
  g += `<path d="${P.up}" fill="none" stroke="#fff" stroke-width="3" opacity=".25" filter="url(#g4)" transform="translate(-2 -3)" clip-path="url(#cLow)"/>`;
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


export function signature() { // one centre line (initial with a loop, flowing humps, a long underline flourish), then variable width from the stroke direction
  const key = [[655, 716], [668, 676], [690, 610], [716, 562], [742, 548], [754, 570], [742, 614], [712, 656], [690, 690], [706, 704], [742, 684], [772, 652], [790, 628], [804, 650], [808, 690], [826, 664], [852, 624], [872, 604], [884, 628], [886, 674], [904, 700], [930, 672], [956, 630], [976, 606], [990, 624], [992, 672], [1010, 702], [1038, 680], [1064, 640], [1084, 620], [1098, 640], [1096, 690], [1120, 712], [1160, 690], [1206, 650], [1244, 626], [1262, 648], [1236, 690], [1160, 722], [1040, 742], [900, 752], [780, 750], [690, 744]];
  const pts = []; // Catmull-Rom, centripetal enough at this density
  for (let i = 0; i < key.length - 1; i++) { const p0 = key[Math.max(0, i - 1)], p1 = key[i], p2 = key[i + 1], p3 = key[Math.min(key.length - 1, i + 2)]; for (let t = 0; t < 1; t += 0.1) { const t2 = t * t, t3 = t2 * t; pts.push([0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3), 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]); } }
  pts.push(key[key.length - 1]); return pts;
}
export function inkPolygon(pts, upto) { // broad-nib model: thick on downstrokes (nib at ~40 degrees), hairline on upstrokes, pressure eases at start and end
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
export function signing12(UP) {
  seed12 = 777; const pts = signature(), ink = inkPolygon(pts, Math.max(UP, 0.02)), tip = ink.last;
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


// ---------------------------------------------------------------- act 5: the diagram, with envelopes travelling both ways
export function diagram5(t) { // t = seconds since the diagram appeared
  const cx = 960, cy = 470, L = [320, 470], R = [1600, 470];
  const p = (((t - 0.4) / 6.0) % 1 + 1) % 1, active = t > 0.4;
  let g = `<defs><radialGradient id="core" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#eaf2f9"/><stop offset="1" stop-color="#c9dcec"/></radialGradient>
  <linearGradient id="trailR" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${GLOWB}" stop-opacity="0"/><stop offset="1" stop-color="${GLOWB}" stop-opacity=".9"/></linearGradient>
  <linearGradient id="trailL" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="${GLOWB}" stop-opacity="0"/><stop offset="1" stop-color="${GLOWB}" stop-opacity=".9"/></linearGradient></defs>`;
  g += `<ellipse cx="${cx}" cy="${cy}" rx="760" ry="230" fill="${GLOWB}" opacity=".16" filter="url(#g70)" stroke="none"/>`;
  for (const y of [446, 494]) g += `<path d="M${L[0] + 66} ${y} H${cx - 150}" stroke="${LINE}" stroke-width="2"/><path d="M${cx + 150} ${y} H${R[0] - 66}" stroke="${LINE}" stroke-width="2"/>`;
  g += `<path d="M386 446 H810" stroke="${GLOWB}" stroke-width="8" opacity=".35" filter="url(#g8)"/><path d="M386 446 H810" stroke="${BLUE}" stroke-width="2.6" opacity=".8"/><path d="M1110 446 H1534" stroke="${GLOWB}" stroke-width="8" opacity=".35" filter="url(#g8)"/><path d="M1110 446 H1534" stroke="${BLUE}" stroke-width="2.6" opacity=".8"/>`;
  g += `<path d="M1534 494 H1110" stroke="${SLATE}" stroke-width="2.2" stroke-dasharray="2 8" opacity=".9"/><path d="M810 494 H386" stroke="${SLATE}" stroke-width="2.2" stroke-dasharray="2 8" opacity=".9"/>`;
  // which pulse is alive: receive at p=.3 (from the left) and p=.8 (from the right), each lasts .18 of a cycle
  let ring = 0; for (const ev of [0.3, 0.8]) { const u = (p - ev) / 0.18; if (active && u >= 0 && u <= 1) ring = Math.max(ring, 1 - u); }
  const pulse = ring;
  for (const [r0, o] of [[260, .1], [215, .2], [178, .38]]) g += `<circle cx="${cx}" cy="${cy}" r="${r0}" stroke="${GLOWB}" stroke-width="2" opacity="${(o + pulse * .3).toFixed(2)}"/>`;
  if (pulse > 0) { const u = 1 - pulse; g += `<circle cx="${cx}" cy="${cy}" r="${150 + 120 * u}" stroke="${GLOWB}" stroke-width="3" opacity="${(0.7 * pulse).toFixed(2)}" filter="url(#glow)"/>`; }
  g += `<circle cx="${cx}" cy="${cy}" r="${170 + pulse * 14}" fill="${GLOWB}" opacity="${(.28 + pulse * .3).toFixed(2)}" filter="url(#g40)" stroke="none"/><circle cx="${cx}" cy="${cy}" r="150" fill="url(#core)" stroke="#fff" stroke-width="3"/><circle cx="${cx}" cy="${cy}" r="150" stroke="${BLUE}" stroke-width="2.6" filter="url(#softglow)"/><circle cx="${cx}" cy="${cy}" r="134" stroke="${LINE}" stroke-width="1.2"/>`;
  for (const [x, y] of [L, R]) g += `<circle cx="${x}" cy="${y}" r="92" fill="${GLOWB}" opacity=".24" filter="url(#g16)" stroke="none"/><circle cx="${x}" cy="${y}" r="66" fill="url(#core)" stroke="${INK}" stroke-width="1.8"/><circle cx="${x}" cy="${y - 14}" r="16" fill="${LINE}" stroke="none" filter="url(#g4)"/><path d="M${x - 30} ${y + 34} Q${x} ${y - 10} ${x + 30} ${y + 34} Z" fill="${LINE}" stroke="none" filter="url(#g4)"/>`;
  const env = (x, y, c, s, dir) => `<rect x="${dir > 0 ? x - 190 : x + 20}" y="${y - 8}" width="170" height="16" fill="url(#${dir > 0 ? 'trailR' : 'trailL'})" filter="url(#g4)" stroke="none"/><g transform="translate(${x - 34 * s} ${y - 23 * s}) scale(${s})"><rect x="-8" y="-8" width="84" height="62" rx="12" fill="${GLOWB}" opacity=".6" filter="url(#g8)" stroke="none"/><rect width="68" height="46" rx="5" fill="#fff" stroke="${c}" stroke-width="2.4"/><path d="M0 5 L34 28 L68 5" stroke="${c}" stroke-width="2.2"/></g>`;
  const f = (a, b, u) => a + (b - a) * u;
  if (active) {
    if (p < 0.3) g += env(f(386, 810, p / 0.3), 446, BLUE, 1, 1);
    else if (p < 0.6) g += env(f(1110, 1534, (p - 0.3) / 0.3), 446, BLUE, 1, 1);
    else if (p < 0.8) g += env(f(1534, 1110, (p - 0.6) / 0.2), 494, SLATE, 0.8, -1);
    else g += env(f(810, 386, (p - 0.8) / 0.2), 494, SLATE, 0.8, -1);
  }
  return SV(g);
}
