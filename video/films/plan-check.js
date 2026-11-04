'use strict';
// Checks a film plan against the paced voice and the capture timeline BEFORE rendering: every anchor must resolve to a word,
// anchors must be in order, and the action-speed slope between pinned marks is reported (0.45-3.0 are the limits the render clamps to).
// node plan-check.js plan.json timings.json timeline.json
const fs = require('fs');
const [pf, tf, lf] = process.argv.slice(2);
const P = JSON.parse(fs.readFileSync(pf, 'utf8')), V = JSON.parse(fs.readFileSync(tf, 'utf8')), L = JSON.parse(fs.readFileSync(lf, 'utf8'));
const norm = (w) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9']/g, '');
function wt(spec) {
  const m = /^b(\d+):(.*?)(?:#(\d+))?(?::([+-]?[\d.]+))?$/.exec(spec);
  if (!m) throw new Error('bad ' + spec);
  const b = V.blocks[+m[1] - 1], re = new RegExp(m[2]); let n = 0;
  for (const w of b.words) if (re.test(norm(w.w))) { n++; if (n === +(m[3] || 1)) return w.start + +(m[4] || 0); }
  throw new Error('NOT FOUND ' + spec + ' (block words: ' + b.words.map((w) => norm(w.w)).join(' ') + ')');
}
let missing = 0;
const at = (v) => { if (typeof v === 'number') return v; if (v === 'end') return V.total_s; try { return wt(v); } catch (e) { console.log('  ' + e.message.slice(0, 120)); missing++; return 0; } };
const mark = {}; for (const e of L.events) if (e.k === 'mark') mark[e.name] = e.t;
let bad = 0, prevEnd = 0;
P.segments.forEach((s, i) => {
  const t0 = at(s.t0), t1 = at(s.t1);
  console.log(`seg ${i} ${s.kind}${s.name ? ' ' + s.name : ''} ${t0.toFixed(2)} -> ${t1.toFixed(2)} (${(t1 - t0).toFixed(1)} s)`);
  if (t0 < prevEnd - 0.01 || t1 <= t0) { console.log('  ORDER PROBLEM'); bad++; }
  prevEnd = t1;
  if (s.pin) {
    const pts = s.pin.map(([m, sp]) => [m, at(sp), mark[m]]);
    for (const p of pts) if (p[2] === undefined) { console.log('  unknown mark', p[0]); bad++; }
    pts.sort((a, b) => a[1] - b[1]);
    for (let k = 0; k + 1 < pts.length; k++) {
      const ratio = (pts[k + 1][2] - pts[k][2]) / (pts[k + 1][1] - pts[k][1]), sl = Math.max(1, ratio);
      const flag = ratio > 3 ? '  <-- too fast, clamped' : ratio > 1.8 ? '  (fast)' : ratio < 0.5 ? '  (holds ' + ((pts[k + 1][1] - pts[k][1]) - (pts[k + 1][2] - pts[k][2])).toFixed(1) + ' s at the end)' : '';
      console.log(`  ${pts[k][0]} -> ${pts[k + 1][0]}: film ${(pts[k + 1][1] - pts[k][1]).toFixed(1)} s, action ${(pts[k + 1][2] - pts[k][2]).toFixed(1)} s, x${ratio.toFixed(2)}${flag}`);
      if (ratio > 3) bad++;
    }
  }
});
bad += missing;
console.log(bad ? `PROBLEMS: ${bad}` : 'plan ok');
process.exit(bad ? 1 : 0);
