// @ts-nocheck
// A walkthrough film: real screens of the DEMO build (states captured by capture-lib.js, fake data) with a camera, a cursor and
// soft highlights, plus drawn diagrams and the closing card. Everything is timed to the voice: marks in the capture timeline
// are pinned to spoken words (plan.json "anchors"), segments start and end on words.
import React from "react";
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, staticFile, delayRender, continueRender } from "remotion";
import { loadFont as loadSpectral } from "@remotion/google-fonts/Spectral";
import { loadFont as loadSans } from "@remotion/google-fonts/SourceSans3";
import { DEFS, smooth, INK, BLUE, SLATE } from "./scenes";
import { EXTRA_DEFS } from "./scenesFull";
import { relayScene, docsScene, introScene } from "./filmDiagrams";
import PLAN from "./film/plan.json";
import TL from "./film/timeline.json";
import VO from "./film/timings.json";
import TX from "./films-texts.json";

const roman = loadSpectral("normal", { weights: ["300", "400", "500"] });
const italic = loadSpectral("italic", { weights: ["300"] });
const sans = loadSans("normal", { weights: ["400", "600"] });
const fh = delayRender("fonts");
Promise.all([roman.waitUntilDone(), italic.waitUntilDone(), sans.waitUntilDone()]).then(() => continueRender(fh));
const FF = roman.fontFamily, FS = sans.fontFamily;

const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ramp = (t, a, b) => smooth((t - a) / (b - a));
const lerp = (a, b, u) => a + (b - a) * u;
const K = 1920 / TL.vw;

// ---- word anchors: "b3:^mailbox$:+0.2" or "b3:^the$#2:-0.1" (block, regex on the normalised word, nth, offset seconds)
const norm = (w) => w.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9']/g, "");
const wordTime = (spec) => {
  const m = /^b(\d+):(.*?)(?:#(\d+))?(?::([+-]?[\d.]+))?$/.exec(spec);
  if (!m) throw new Error("bad anchor " + spec);
  const b = VO.blocks[+m[1] - 1], re = new RegExp(m[2]), nth = +(m[3] || 1), off = +(m[4] || 0);
  let n = 0;
  for (const w of b.words) if (re.test(norm(w.w))) { n++; if (n === nth) return w.start + off; }
  throw new Error("anchor not found: " + spec);
};
const at = (v) => (typeof v === "number" ? v : v === "end" ? VO.total_s : v.startsWith("b") ? wordTime(v) : +v);

// ---- app segments: action time <- film time, piecewise linear through the anchored marks
const markT = {}; for (const e of TL.events) if (e.k === "mark") markT[e.name] = e.t;
const states = TL.events.filter((e) => e.k === "state");
const stateAt = (ta) => { let lo = 0, hi = states.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (states[mid].t <= ta + 1e-6) lo = mid; else hi = mid - 1; } return states[lo]; };
const SEGS = PLAN.segments.map((s) => {
  const t0 = at(s.t0), t1 = at(s.t1);
  if (s.kind !== "app") return { ...s, T0: t0, T1: t1 };
  const pts = (s.pin || []).map(([mark, spec]) => [at(spec), markT[mark]]).sort((a, b) => a[0] - b[0]);
  const aEnd = s.to ? markT[s.to] : TL.total;
  return { ...s, T0: t0, T1: t1, pts, aStart: markT[s.from], aEnd };
});
const actionAt = (seg, tf) => {
  const p = seg.pts;
  if (!p.length) return Math.min(seg.aEnd, seg.aStart + (tf - seg.T0));
  if (tf <= p[0][0]) return Math.max(seg.aStart, Math.min(p[0][1], p[0][1] - (p[0][0] - tf)));
  for (let i = 0; i + 1 < p.length; i++) if (tf < p[i + 1][0]) { const sl = cl((p[i + 1][1] - p[i][1]) / (p[i + 1][0] - p[i][0]), 1.0, 3.0); return Math.min(p[i + 1][1], p[i][1] + (tf - p[i][0]) * sl); } // natural speed (or faster when the beat is short), then hold
  const last = p[p.length - 1]; return Math.min(seg.aEnd, last[1] + (tf - last[0]));
};

// ---- camera, cursor, highlights from the capture timeline
const ev = (k) => TL.events.filter((e) => e.k === k);
const CAMS = ev("cam"), CUR = ev("cursor"), CLK = ev("click"), HLS = ev("hl"), SHOW = ev("cursorShow");
const FULL = { x: 0, y: 0, w: TL.vw, h: TL.vh };
const camAt = (ta) => {
  let cur = FULL;
  for (let i = 0; i < CAMS.length; i++) {
    const c = CAMS[i]; if (c.t > ta) break;
    const u = smooth((ta - c.t) / (c.dur || 0.9)), prev = i ? CAMS[i - 1].rect : FULL;
    const from = i && CAMS[i - 1].t + (CAMS[i - 1].dur || 0.9) > c.t ? prev : (i ? CAMS[i - 1].rect : FULL);
    cur = { x: lerp(from.x, c.rect.x, u), y: lerp(from.y, c.rect.y, u), w: lerp(from.w, c.rect.w, u), h: lerp(from.h, c.rect.h, u) };
  }
  return cur;
};
const cursorAt = (ta) => {
  if (!CUR.length || ta < CUR[0].t) return null;
  let p = null;
  for (const c of CUR) { if (c.t > ta) break; const u = smooth((ta - c.t) / c.dur); p = { x: lerp(c.x0, c.x1, u), y: lerp(c.y0, c.y1, u) }; }
  return p;
};
const Cursor = ({ x, y, s = 1.15 }) => (
  <svg width="1920" height="1080" style={{ position: "absolute", left: 0, top: 0, filter: "drop-shadow(0 6px 8px rgba(21,32,43,.4))", pointerEvents: "none" }}>
    <g transform={`translate(${x} ${y}) scale(${s})`}><path d="M0 0 L0 34 L9 26 L16 42 L23 39 L16 24 L28 24 Z" fill="#fff" stroke={INK} strokeWidth="2" strokeLinejoin="round" /></g>
  </svg>
);

const AppSeg: React.FC<any> = ({ seg, tf }) => {
  const ta = actionAt(seg, tf);
  const st = stateAt(ta), cam = camAt(ta), z = TL.vw / cam.w;
  const toC = (x, y) => [(x - cam.x) * K * z, (y - cam.y) * K * z];
  const cp = cursorAt(ta);
  let click = 0; for (const c of CLK) if (ta >= c.t && ta - c.t < 0.5) click = 1 - (ta - c.t) / 0.5;
  const hls = HLS.filter((h) => ta >= h.t && ta < h.t + h.dur);
  return (<AbsoluteFill style={{ background: "#fff", overflow: "hidden" }}>
    <Img src={staticFile("film/states/" + st.f)} style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: "0 0", transform: `scale(${z}) translate(${-cam.x * K}px, ${-cam.y * K}px)` }} />
    {hls.map((h, hi) => h.rects.map((r, i) => { const a = ramp(ta, h.t, h.t + 0.4) * (1 - ramp(ta, h.t + h.dur - 0.5, h.t + h.dur)); const [x, y] = toC(r.x, r.y); return <div key={hi + "_" + i} style={{ position: "absolute", left: x, top: y, width: r.w * K * z, height: r.h * K * z, borderRadius: 12, boxShadow: `0 0 0 3px ${BLUE}, 0 0 28px 8px rgba(95,163,214,.75), 0 0 90px 18px rgba(95,163,214,.35)`, opacity: a * 0.95 }} />; }))}
    {cp && (() => { const [x, y] = toC(cp.x, cp.y); return <><Cursor x={x} y={y} />{click > 0 && <div style={{ position: "absolute", left: x - 28, top: y - 28, width: 56, height: 56, borderRadius: 56, border: `3px solid ${BLUE}`, opacity: click * 0.8, transform: `scale(${1.6 - click * 0.6})` }} />}</>; })()}
  </AbsoluteFill>);
};

const DiagramSeg: React.FC<any> = ({ seg, tf, lang }) => {
  const t = tf - seg.T0, T = TX[lang];
  const P = {}; for (const [k, v] of Object.entries(seg.times || {})) P[k] = at(v) - seg.T0;
  const svg = seg.name === "relay" ? relayScene(t, T) : seg.name === "docs" ? docsScene(t, T) : introScene(t, T, P);
  return (<AbsoluteFill style={{ background: "linear-gradient(180deg,#f7fafd,#e7f0f8)", fontFamily: FS }}><div dangerouslySetInnerHTML={{ __html: DEFS + EXTRA_DEFS + svg }} /></AbsoluteFill>);
};

const CardSeg: React.FC<any> = ({ seg, tf }) => {
  const t = tf - seg.T0;
  return (<AbsoluteFill style={{ background: "linear-gradient(180deg,#f7fafd,#e7f0f8)" }}>
    <div style={{ position: "absolute", left: 0, top: 380, width: 1920, textAlign: "center", fontFamily: FS, fontSize: 30, letterSpacing: ".26em", textTransform: "uppercase", color: SLATE, opacity: ramp(t, 0, 0.8) }}>{seg.small}</div>
    <div style={{ position: "absolute", left: 160, top: 450, width: 1600, textAlign: "center", fontFamily: FF, fontWeight: 300, fontSize: 84, lineHeight: 1.1, color: INK, opacity: ramp(t, 0.3, 1.3), transform: `translateY(${(1 - ramp(t, 0.3, 1.3)) * 14}px)` }}>
      {seg.big.split("*").map((p, i) => i % 2 ? <em key={i} style={{ fontStyle: "italic", color: BLUE }}>{p}</em> : <span key={i}>{p}</span>)}
    </div>
  </AbsoluteFill>);
};

export const Film: React.FC = () => {
  const frame = useCurrentFrame(), { fps } = useVideoConfig();
  const tf = frame / fps, XF = 0.45;
  const lang = PLAN.lang;
  const layers = SEGS.map((s, i) => {
    const a = ramp(tf, s.T0 - XF / 2, s.T0 + XF / 2) * (i === 0 ? 0 : 1) + (i === 0 ? 1 : 0);
    const b = i + 1 < SEGS.length ? 1 - ramp(tf, s.T1 - XF / 2, s.T1 + XF / 2) : 1;
    const op = Math.min(a, b);
    if (tf < s.T0 - XF || (i + 1 < SEGS.length && tf > s.T1 + XF)) return null;
    const tt = cl(tf, s.T0 - 0.0001, 1e9);
    return <AbsoluteFill key={i} style={{ opacity: op }}>{s.kind === "app" ? <AppSeg seg={s} tf={tf} /> : s.kind === "diagram" ? <DiagramSeg seg={s} tf={tf} lang={lang} /> : <CardSeg seg={s} tf={tf} />}</AbsoluteFill>;
  });
  return <AbsoluteFill style={{ background: "#fff" }}>{layers}</AbsoluteFill>;
};
