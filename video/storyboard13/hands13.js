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
  let g = `<defs>${BEVEL}${sk('skA3', SKIN_A)}${sk('skB3', SKIN_B)}
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
  g += `<path d="${P.up}" fill="none" stroke="${SKIN_B[2]}" stroke-width="1.6" opacity=".55"/><path d="${P.low}" fill="none" stroke="${SKIN_A[2]}" stroke-width="1.6" opacity=".55"/>`;
  for (const d of crease) g += `<path d="${d}" fill="none" stroke="${SKIN_A[2]}" stroke-width="2.2" opacity=".55"/>`;
  for (const d of nails) g += `<path d="${d}" fill="#fbeee3" stroke="${SKIN_A[2]}" stroke-width="1" opacity=".95"/>`;
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
