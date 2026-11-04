// @ts-nocheck
// Drawn diagrams for the walkthrough films, in the trailer's style. Pure string builders driven by time (seconds
// since the diagram appeared). Nothing here names how many Operators there are: the centre circle says "the Operator".
import { SV, INK, BLUE, SLATE, LINE, GLOWB, smooth } from "./scenes";
const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ramp = (t, a, b) => smooth((t - a) / (b - a));
const f = (a, b, u) => a + (b - a) * u;
const CORE = `<radialGradient id="core" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#eaf2f9"/><stop offset="1" stop-color="#c9dcec"/></radialGradient>`;
const figure = (x, y, a = 1, tone = LINE, ring = INK) => `<g opacity="${a}"><circle cx="${x}" cy="${y}" r="92" fill="${GLOWB}" opacity=".2" filter="url(#g16)" stroke="none"/><circle cx="${x}" cy="${y}" r="66" fill="url(#core)" stroke="${ring}" stroke-width="1.8"/><circle cx="${x}" cy="${y - 14}" r="16" fill="${tone}" stroke="none" filter="url(#g4)"/><path d="M${x - 30} ${y + 34} Q${x} ${y - 10} ${x + 30} ${y + 34} Z" fill="${tone}" stroke="none" filter="url(#g4)"/></g>`;
const centre = (x, y, pulse = 0, a = 1, r = 120) => `<g opacity="${a}"><circle cx="${x}" cy="${y}" r="${r + 40}" fill="${GLOWB}" opacity="${(.2 + pulse * .3).toFixed(2)}" filter="url(#g40)" stroke="none"/><circle cx="${x}" cy="${y}" r="${r}" fill="url(#core)" stroke="#fff" stroke-width="3"/><circle cx="${x}" cy="${y}" r="${r}" stroke="${BLUE}" stroke-width="2.4"/><circle cx="${x}" cy="${y}" r="${r - 14}" stroke="${LINE}" stroke-width="1.2"/></g>`;
const label = (x, y, s, size = 30, a = 1, w = 600, anchor = "middle") => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Source Sans 3, sans-serif" font-size="${size}" fill="${SLATE}" letter-spacing="3" opacity="${a}" stroke="none">${s}</text>`;
const envelope = (x, y, c = BLUE, s = 1, a = 1) => `<g opacity="${a}" transform="translate(${x - 34 * s} ${y - 23 * s}) scale(${s})"><rect x="-8" y="-8" width="84" height="62" rx="12" fill="${GLOWB}" opacity=".5" filter="url(#g8)" stroke="none"/><rect width="68" height="46" rx="5" fill="#fff" stroke="${c}" stroke-width="2.4"/><path d="M0 5 L34 28 L68 5" stroke="${c}" stroke-width="2.2"/></g>`;
const doc = (x, y, s = 1, a = 1, c = BLUE) => `<g opacity="${a}" transform="translate(${x - 26 * s} ${y - 34 * s}) scale(${s})"><rect x="-6" y="-6" width="64" height="80" rx="12" fill="${GLOWB}" opacity=".4" filter="url(#g8)" stroke="none"/><path d="M0 0 H34 L52 18 V68 H0 Z" fill="#fff" stroke="${c}" stroke-width="2.4"/><path d="M34 0 V18 H52" stroke="${c}" stroke-width="2"/><path d="M10 34 H42 M10 44 H42 M10 54 H30" stroke="${LINE}" stroke-width="2.4"/></g>`;
// the small signed seal for the commission agreement (a ring, a pen tick, tiny fine print under it)
const seal = (x, y, u, text, fine = true) => {
  const a = cl(u * 2), tick = cl((u - 0.35) / 0.5), sc = 0.6 + 0.4 * smooth(cl(u * 1.6));
  const tp = `M-17 2 L-5 15 L19 -14`, len = 60;
  return `<g opacity="${a}" transform="translate(${x} ${y}) scale(${sc})"><circle r="52" fill="${GLOWB}" opacity=".3" filter="url(#g16)" stroke="none"/><circle r="40" fill="#fff" stroke="${BLUE}" stroke-width="2.6"/><circle r="33" stroke="${LINE}" stroke-width="1.4"/><path d="${tp}" stroke="${BLUE}" stroke-width="5" stroke-dasharray="${len}" stroke-dashoffset="${(len * (1 - tick)).toFixed(1)}"/></g>` +
    (fine ? label(x, y + 78, text, 20, a, 400) : "");
};
const dir = (a, b, u) => [f(a[0], b[0], u), f(a[1], b[1], u)];

// 1. every message goes through the Operator (centre circle), relayed to the other side; neither side learns who the other is.
export function relayScene(t, T) {
  const cx = 960, cy = 470, L = [320, 470], R = [1600, 470];
  let g = `<defs>${CORE}</defs>`;
  g += `<ellipse cx="${cx}" cy="${cy}" rx="760" ry="230" fill="${GLOWB}" opacity=".14" filter="url(#g70)" stroke="none"/>`;
  g += `<path d="M${L[0] + 66} ${cy} H${cx - 125}" stroke="${LINE}" stroke-width="2"/><path d="M${cx + 125} ${cy} H${R[0] - 66}" stroke="${LINE}" stroke-width="2"/>`;
  const p = cl((t - 0.8) / 5.2); // 0..1 over the journey
  const pulse = (p > 0.38 && p < 0.58) ? 1 - Math.abs(p - 0.48) / 0.1 : 0;
  g += centre(cx, cy, cl(pulse), ramp(t, 0, 0.8)) + figure(L[0], L[1], ramp(t, 0, 0.6)) + figure(R[0], R[1], ramp(t, 0.2, 0.8));
  g += label(L[0], L[1] + 130, T.you, 26, ramp(t, 0.6, 1.2)) + label(R[0], R[1] + 130, T.other, 26, ramp(t, 0.8, 1.4));
  g += label(cx, cy + 8, T.centre, 30, ramp(t, 0.4, 1.2), 600);
  if (t > 0.8 && p < 1) {
    let x;
    if (p < 0.4) x = f(L[0] + 70, cx - 120, p / 0.4); else if (p < 0.56) x = cx; else x = f(cx + 120, R[0] - 70, (p - 0.56) / 0.44);
    g += envelope(x, cy - 52 * (p >= 0.4 && p < 0.56 ? 0 : 1), BLUE, p >= 0.4 && p < 0.56 ? 0.6 : 1, p >= 0.4 && p < 0.56 ? 0.7 : 1);
  }
  // "neither side learns who the other is": two crossed-out name tags near the figures at the end
  const n = ramp(t, 6.2, 7.2);
  for (const [x, y] of [L, R]) g += `<g opacity="${n}"><circle cx="${x}" cy="${y - 4}" r="66" fill="${BLUE}" opacity=".08" stroke="none"/></g>`;
  g += label(cx, 790, T.neither, 34, ramp(t, 6.4, 7.4), 400);
  return SV(g);
}

// 2. documents are never shared through MyPlatform: the signed seal first, then two documents pass directly between the parties.
export function docsScene(t, T) {
  const cx = 960, cy = 270, L = [320, 640], R = [1600, 640], ly = 640;
  let g = `<defs>${CORE}</defs>`;
  g += centre(cx, cy, 0, 0.5 * ramp(t, 0, 0.8), 90) + label(cx, cy + 8, T.centre, 24, 0.7 * ramp(t, 0.2, 1));
  g += figure(L[0], L[1], ramp(t, 0, 0.6)) + figure(R[0], R[1], ramp(t, 0.2, 0.8));
  g += label(L[0], L[1] + 130, T.you, 26, ramp(t, 0.6, 1.2)) + label(R[0], R[1] + 130, T.other, 26, ramp(t, 0.8, 1.4));
  // the direct line between the parties; it never touches the centre
  const lu = ramp(t, 1.0, 2.0);
  g += `<path d="M${L[0] + 70} ${ly} H${f(L[0] + 70, R[0] - 70, lu)}" stroke="${GLOWB}" stroke-width="7" opacity=".3" filter="url(#g8)"/><path d="M${L[0] + 70} ${ly} H${f(L[0] + 70, R[0] - 70, lu)}" stroke="${BLUE}" stroke-width="2.4"/>`;
  g += seal(cx, ly, ramp(t, 2.2, 3.4), T.seal);
  // two documents pass directly, one each way, offset above/below the line
  const d1 = cl((t - 4.2) / 2.8), d2 = cl((t - 5.0) / 2.8);
  if (d1 > 0 && d1 < 1) g += doc(f(L[0] + 110, R[0] - 110, smooth(d1)), ly - 46, 0.8, Math.sin(Math.PI * Math.min(1, d1 * 1.05)) > 0.05 ? 1 : 0);
  if (d2 > 0 && d2 < 1) g += doc(f(R[0] - 110, L[0] + 110, smooth(d2)), ly + 46, 0.8, 1, SLATE);
  g += label(cx, 900, T.never, 32, ramp(t, 5.6, 6.6), 400);
  return SV(g);
}

// 3. when both sides agree on the essential terms: the commission agreement is executed first (card with pen tick), then introduction.
export function introScene(t, T) {
  const cx = 960, L = [520, 700], R = [1400, 700];
  let g = `<defs>${CORE}</defs>`;
  const cardA = ramp(t, 0.3, 1.2) * (1 - ramp(t, 6.2, 7.2));
  const tick = cl((t - 2.6) / 1.4);
  g += `<g opacity="${cardA}"><rect x="${cx - 360}" y="170" width="720" height="260" rx="22" fill="#fff" stroke="${LINE}" stroke-width="2"/><rect x="${cx - 360}" y="170" width="720" height="260" rx="22" fill="${GLOWB}" opacity=".08" filter="url(#g16)" stroke="none"/>`;
  g += `<path d="M${cx - 300} 250 H${cx + 300} M${cx - 300} 290 H${cx + 200} M${cx - 300} 330 H${cx + 120}" stroke="${LINE}" stroke-width="3"/>`;
  g += `<path d="M${cx + 90} 380 q22 -30 40 -2 t38 -4 t36 0" stroke="${BLUE}" stroke-width="3.4" stroke-dasharray="190" stroke-dashoffset="${(190 * (1 - tick)).toFixed(1)}"/></g>`;
  g += label(cx, 480, T.executed, 34, cardA, 400);
  const au = ramp(t, 1.0, 2.0) * (1 - ramp(t, 6.4, 7.0));
  const j = ramp(t, 6.8, 8.4);
  g += figure(L[0], L[1], ramp(t, 4.0, 5.0), LINE) + figure(R[0], R[1], ramp(t, 4.2, 5.2), LINE);
  const lu = ramp(t, 7.0, 8.6);
  g += `<path d="M${L[0] + 70} ${L[1]} H${f(L[0] + 70, R[0] - 70, lu)}" stroke="${GLOWB}" stroke-width="9" opacity=".4" filter="url(#g8)"/><path d="M${L[0] + 70} ${L[1]} H${f(L[0] + 70, R[0] - 70, lu)}" stroke="${BLUE}" stroke-width="3"/>`;
  g += label(cx, 860, T.intro, 34, ramp(t, 8.2, 9.2), 400);
  return SV(g);
}
