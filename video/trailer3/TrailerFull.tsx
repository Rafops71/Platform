// @ts-nocheck
// Full trailer, 8 acts, about 90 s: SILENT (no music, no SFX, no voice). Time-driven versions of the approved storyboard drawings;
// the app pictures are the real captures (copper cathodes, South Africa, CIF) with the plural covered. Drawings only, no stock.
import React from "react";
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, staticFile, delayRender, continueRender } from "remotion";
import { loadFont as loadSpectral } from "@remotion/google-fonts/Spectral";
import { loadFont as loadSans } from "@remotion/google-fonts/SourceSans3";
import { DEFS, globe, seaDock, motes, smooth, INK, BLUE, SLATE, LINE } from "./scenes";
import { EXTRA_DEFS, hands14, signing12, diagram5 } from "./scenesFull";
import TIM from "./timings.json";
import T from "./texts.json";
import META from "./meta.json";

const roman = loadSpectral("normal", { weights: ["300", "400", "500"] });
const italic = loadSpectral("italic", { weights: ["300"] });
const sans = loadSans("normal", { weights: ["400"] });
const fontHandle = delayRender("fonts");
Promise.all([roman.waitUntilDone(), italic.waitUntilDone(), sans.waitUntilDone()]).then(() => continueRender(fontHandle));
const FF = roman.fontFamily, FS = sans.fontFamily;

const ramp = (t, a, b) => smooth((t - a) / (b - a));
const lerp = (a, b, u) => a + (b - a) * u;
const Word: React.FC<any> = ({ x, y, w, size, weight = 300, op, align = "left", children }) => (
  <div style={{ position: "absolute", left: x, top: y + (1 - op) * 14, width: w, textAlign: align, fontFamily: FF, fontWeight: weight, fontSize: size, lineHeight: 1.05, color: INK, letterSpacing: ".01em", opacity: op, textShadow: "0 0 50px rgba(95,163,214,.28)" }}>{children}</div>
);
const Small: React.FC<any> = ({ x, y, w, op, children }) => (
  <div style={{ position: "absolute", left: x, top: y, width: w, textAlign: "center", fontFamily: FS, fontWeight: 400, fontSize: 30, letterSpacing: ".26em", textTransform: "uppercase", color: SLATE, opacity: op }}>{children}</div>
);
const Em: React.FC<any> = ({ children }) => <em style={{ fontStyle: "italic", color: BLUE }}>{children}</em>;
const Lite: React.FC<any> = ({ on, children }) => <span style={on ? { color: BLUE, textShadow: "0 0 28px rgba(95,163,214,.75)" } : {}}>{children}</span>;
const GRAIN = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .1  0 0 0 0 .15  0 0 0 0 .2  0 0 0 .9 0'/></filter><rect width='240' height='240' filter='url(%23n)'/></svg>")`;
const html = (s) => ({ __html: s });
// texts: "*...*" is the italic blue emphasis, "\n" a line break
const R = (str) => str.split("\n").map((line, li) => <React.Fragment key={li}>{li ? <br /> : null}{line.split("*").map((p, i) => i % 2 ? <Em key={i}>{p}</Em> : <React.Fragment key={i}>{p}</React.Fragment>)}</React.Fragment>);
const REG = (k) => new RegExp(T.re[k]);
const covers = (spots, fixed) => (spots && spots.length ? spots.map((s) => ({ left: s.x * 1.5 - 14, top: s.y * 1.5 - 10, width: s.w * 1.5 + 28, height: s.h * 1.5 + 20, background: s.y * 1.5 < 90 ? "rgb(29,74,109)" : "rgb(240,246,251)" })) : fixed);
const COV_MAIL = covers(META.pluralMailbox, [{ left: 780, top: 10, width: 360, height: 74, background: "rgb(29,74,109)" }, { left: 296, top: 314, width: 300, height: 44, background: "rgb(240,246,251)" }]);
const COV_BROWSE = covers(META.pluralBrowse, []);
const COV_CONTACT = covers(META.pluralContact, []);

// ---- app pieces (real captures) ----
const RS = 0.86, RX = 209, RY = 310;
const U = (f) => staticFile("mp/" + f);
const AppFull = ({ file }) => <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, overflow: "hidden" }}><Img src={U(file)} style={{ width: 1920, height: 1200, display: "block" }} /></div>;
const AppBlur = ({ file, blur, a }) => (<><div style={{ position: "absolute", left: -40, top: -40, width: 2000, height: 1160, overflow: "hidden", filter: `blur(${blur}px)` }}><Img src={U(file)} style={{ width: 2000, height: 1250, display: "block" }} /></div><div style={{ position: "absolute", inset: 0, background: `rgba(240,246,251,${a})` }} /></>);
const RowCard = () => (<div style={{ position: "absolute", left: RX, top: RY, width: 1788 * RS, height: 390 * RS, background: "#fff", borderRadius: 10, boxShadow: "0 60px 120px rgba(21,32,43,.24),0 8px 18px rgba(21,32,43,.10)", overflow: "hidden" }}><Img src={U("row.png")} style={{ width: "100%", display: "block" }} /><div style={{ position: "absolute", inset: 0, background: "rgba(240,246,251,.58)" }} /></div>);
const Lit = ({ x, y, w, h, pad = 5, op }) => op > 0.01 ? (<div style={{ position: "absolute", left: RX + (x - pad) * RS, top: RY + (y - pad) * RS, width: (w + 2 * pad) * RS, height: (h + 2 * pad) * RS, borderRadius: 12, overflow: "hidden", background: "#f6fbff", opacity: op, boxShadow: `0 0 0 2px ${BLUE},0 0 26px 6px rgba(95,163,214,.75),0 0 90px 18px rgba(95,163,214,.4)` }}><Img src={U("row.png")} style={{ position: "absolute", width: 1788 * RS, left: -(x - pad) * RS, top: -(y - pad) * RS, filter: "contrast(1.25) saturate(1.2)" }} /></div>) : null;
const Cursor = ({ x, y, s = 1 }) => (<svg width="1920" height="1080" style={{ position: "absolute", left: 0, top: 0, filter: "drop-shadow(0 6px 8px rgba(21,32,43,.4))" }}><g transform={`translate(${x} ${y}) scale(${s})`}><path d="M0 0 L0 34 L9 26 L16 42 L23 39 L16 24 L28 24 Z" fill="#fff" stroke={INK} strokeWidth="2" strokeLinejoin="round" /></g></svg>);
const Covered = ({ list }) => (<>{list.map((c, i) => <div key={i} style={{ position: "absolute", ...c }} />)}</>);

const S = [0, 7.6, 25.6, 37.0, 48.4, 60.4, 74.4, 84.0], END = 90;
// the voice: when each word of an act's line is spoken (seconds into that act); falls back to the planned time without timings
const tw = (act, re, fb, lead = 0) => { const l = (TIM.lines || []).find((x) => x.act === act); if (!l) return fb; const w = l.words.find((x) => re.test(x.w.toLowerCase().replace(/[^a-z']/g, ""))); return w ? w.start - S[act - 1] - lead : fb; };
const eio = (x) => smooth(x);
const Layer: React.FC<any> = ({ k, t, children, origin = "50% 50%", push = 0.03, outT }) => {
  const a0 = S[k], a1 = k + 1 < S.length ? S[k + 1] : END + 1, dur = a1 - a0 + 0.6;
  const op = (k === 0 ? 1 : ramp(t, a0, a0 + 0.6)) * (k + 1 < S.length ? 1 - ramp(t, a1, a1 + 0.6) : 1);
  if (op <= 0.001) return null;
  const lt = t - a0, o = k + 1 < S.length ? ramp(t, a1, a1 + 0.6) : 0;
  return <AbsoluteFill style={{ opacity: op, transform: `${outT ? outT(o) : ""} scale(${1 + push * (lt / dur)})`, transformOrigin: origin }}>{children(lt)}</AbsoluteFill>;
};
// camera push onto a point of the picture: z grows from 1, the focus point F (picture coordinates) slides to the target on screen
const zoomOf = (w, z1, F, T) => { const z = 1 + (z1 - 1) * w; return { z, tx: w * (T[0] - z * F[0]) + (1 - w) * 0, ty: w * (T[1] - z * F[1]) + (1 - w) * 0 }; };

export const TrailerFull: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const shipHref = staticFile("mp/ship.svg");
  const L3 = [tw(3, new RegExp(T.re.w3[0]), 2.0, 0.15), tw(3, new RegExp(T.re.w3[1]), 3.5, 0.15), tw(3, new RegExp(T.re.w3[2]), 5.0, 0.15), tw(3, new RegExp(T.re.w3[3]), 6.5, 0.15)];
  const WORDS3 = (lt) => T.words3.map((w, i) => <React.Fragment key={w}>{i ? " · " : ""}<Lite on={lt > L3[i]}>{w}</Lite></React.Fragment>);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 42%,#ffffff 0%,#f0f6fb 62%,#e2ebf3 100%)`, overflow: "hidden" }}>
      <div dangerouslySetInnerHTML={html(DEFS + EXTRA_DEFS)} />

      {/* 1 - the globe */}
      <Layer k={0} t={t} origin="65% 50%">{(lt) => (<>
        <div dangerouslySetInnerHTML={html(globe(1300, 540, 400, 28 + 3.2 * t, t) + motes(t, "#5fa3d6"))} />
        <Word x={110} y={300} w={760} size={104} weight={500} op={ramp(lt, 0.5, 1.4)}>{T.title}</Word>
        <Word x={114} y={480} w={760} size={64} op={ramp(lt, tw(1, REG("tag"), 3.2, 0.5), tw(1, REG("tag"), 3.2, 0.5) + 0.9)}>{R(T.tag)}</Word>
      </>)}</Layer>

      {/* 2 - clear sunny daylight: the ship sails in, docks, the crane unloads onto trucks, the trucks drive away; "Too early." lands on the spoken words */}
      <Layer k={1} t={t} push={0}>{(lt) => { const e0 = tw(2, REG("early"), 9.4), r0 = e0 - 1.2; return (<AbsoluteFill>
        <AbsoluteFill style={{ transform: `scale(${lerp(1, 1.15, eio((lt - 6) / 5))})`, transformOrigin: "50% 52%" }}><div dangerouslySetInnerHTML={html(seaDock(Math.max(0, lt), ramp(lt, r0, r0 + 1.4), shipHref, 0))} /></AbsoluteFill>
        <Word x={100} y={110} w={1720} size={104} align="center" op={ramp(lt, 0.5, 1.2) * (1 - ramp(lt, e0 - 0.9, e0 - 0.4))}>{R(T.a2a)}</Word>
        <Word x={100} y={110} w={1720} size={104} align="center" op={ramp(lt, e0 - 0.15, e0 + 0.5)}>{R(T.a2b)}</Word>
      </AbsoluteFill>); }}</Layer>

      {/* 3 - zoom onto the offer; each detail lights up; the pointer clicks Contact; the Contact window opens */}
      <Layer k={2} t={t} push={0}>{(lt) => {
        const w = eio((lt - 0.2) / 2.0), Z = zoomOf(w, 1.85, [520, 430], [960, 480]); const c = ramp(lt, 9.8, 10.5);
        const cardP = (x, y) => [Z.z * x + Z.tx, Z.z * y + Z.ty];
        const p0 = [1500, 160], pc = [RX + 110 * RS, RY + 336 * RS];
        const u = ramp(lt, 6.8, 9.2); const cp = lt < 9.8 ? cardP(lerp(p0[0], pc[0], u), lerp(p0[1], pc[1], u)) : [lerp(cardP(...pc)[0], 730, ramp(lt, 10.4, 11.4)), lerp(cardP(...pc)[1], 480, ramp(lt, 10.4, 11.4))];
        const click = lt > 9.3 && lt < 9.6 ? 0.8 : 1;
        return (<>
          <div style={{ opacity: 1 - c }}>
            <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: "0 0", transform: `translate(${Z.tx}px,${Z.ty}px) scale(${Z.z})` }}>
              <AppBlur file="browse.png" blur={9} a={0.55} /><Covered list={COV_BROWSE} /><RowCard />
              <Lit x={285} y={28} w={238} h={42} op={ramp(lt, L3[0], L3[0] + 0.4)} /><Lit x={158} y={84} w={190} h={38} op={ramp(lt, L3[1], L3[1] + 0.4)} /><Lit x={424} y={84} w={246} h={38} op={ramp(lt, L3[2], L3[2] + 0.4)} /><Lit x={364} y={84} w={40} h={38} pad={4} op={ramp(lt, L3[3], L3[3] + 0.4)} />
            </div>
            <Word x={110} y={110} w={1700} size={64} align="center" op={ramp(lt, 1.2, 2.0) * (1 - c)}>{WORDS3(lt)}</Word>
          </div>
          <div style={{ opacity: c }}><AppFull file="contact.png" /><Covered list={COV_CONTACT} /></div>
          {lt > 6.8 && <Cursor x={cp[0]} y={cp[1]} s={click} />}
        </>);
      }}</Layer>

      {/* 4 - zoom onto the role and the documents; the member stays out of focus */}
      <Layer k={3} t={t} push={0} outT={(o) => `translateX(${(-420 * o).toFixed(1)}px)`}>{(lt) => {
        const w = eio((lt - 0.2) / 2.0), Z = zoomOf(w, 1.8, [480, 488], [960, 470]);
        return (<>
          <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: "0 0", transform: `translate(${Z.tx}px,${Z.ty}px) scale(${Z.z})` }}>
            <AppBlur file="browse.png" blur={14} a={0.72} /><RowCard />
            <Lit x={20} y={188} w={318} h={38} op={ramp(lt, tw(4, REG("role"), 2.5, 0.2), tw(4, REG("role"), 2.5, 0.2) + 0.4)} /><Lit x={350} y={188} w={390} h={38} op={ramp(lt, tw(4, REG("doc"), 5.0, 0.2), tw(4, REG("doc"), 5.0, 0.2) + 0.4)} />
          </div>
          <Word x={100} y={40} w={1720} size={104} align="center" op={ramp(lt, tw(4, REG("opp"), 5.8, 0.4), tw(4, REG("opp"), 5.8, 0.4) + 0.8)}>{R(T.a4a)}</Word>
          <div style={{ position: "absolute", left: 1600, top: 420, width: 150, height: 150, borderRadius: 75, border: `2px solid ${LINE}`, background: "radial-gradient(circle at 40% 35%,#f3f6f9,#cfd8e1)", filter: "blur(9px)", boxShadow: "0 0 60px rgba(95,163,214,.35)", opacity: ramp(lt, 1, 2) }} />
          <div style={{ opacity: ramp(lt, 1, 2), filter: "blur(5px)" }}><Small x={1565} y={600} w={220} op={1}>{T.member}</Small></div>
          <Word x={100} y={820} w={1720} size={104} align="center" op={ramp(lt, tw(4, REG("not"), 7.4, 0.2), tw(4, REG("not"), 7.4, 0.2) + 0.8)}>{R(T.a4b)}</Word>
        </>);
      }}</Layer>

      {/* 5 - the mailbox (plural covered) clears away completely, then the diagram: envelopes travel both ways through the centre */}
      <Layer k={4} t={t} origin="50% 40%" push={0.02} outT={(o) => `scale(${(1 - 0.22 * o).toFixed(3)})`}>{(lt) => {
        const mb = 1 - ramp(lt, 2.6, 3.3), d = ramp(lt, 3.6, 4.4);
        return (<>
          {mb > 0.001 && <div style={{ opacity: mb }}><AppFull file="mailbox.png" /><Covered list={COV_MAIL} /></div>}
          {d > 0 && (<div style={{ opacity: d }}>
            <div dangerouslySetInnerHTML={html(diagram5(Math.max(0, lt - 4.0)))} />
            <Small x={150} y={560} w={340} op={1}>{T.member}</Small><Small x={1430} y={560} w={340} op={1}>{T.member}</Small>
            <Word x={760} y={418} w={400} size={42} weight={500} align="center" op={1}>MyPlatform</Word>
            <div style={{ position: "absolute", left: 760, top: 480, width: 400, textAlign: "center", fontFamily: FS, fontSize: 24, letterSpacing: ".26em", textTransform: "uppercase", color: SLATE }}>{T.operator}</div>
            <Word x={160} y={760} w={1600} size={104} align="center" op={ramp(lt, Math.max(4.2, tw(5, REG("op"), 4.2, 0.3)), Math.max(4.2, tw(5, REG("op"), 4.2, 0.3)) + 0.9)}>{R(T.a5)}</Word>
          </div>)}
        </>);
      }}</Layer>

      {/* 6 - each hand glides in from its side, they meet, two gentle shakes, then the small written card BELOW the hands (hands stay clear) */}
      <Layer k={5} t={t} push={0}>{(lt) => {
        const gap = 700 * (1 - eio(lt / 1.6)), sh = lt > 1.9 && lt < 4.3 ? Math.sin(2 * Math.PI * (lt - 1.9) / 1.2) * Math.min(1, (lt - 1.9) / 0.3, (4.3 - lt) / 0.3) : 0;
        return (<>
          <div style={{ position: "absolute", inset: 0, opacity: ramp(lt, 0, 0.5), transform: `translateY(${(-18 * sh).toFixed(1)}px) rotate(${(0.7 * sh).toFixed(2)}deg)`, transformOrigin: "50% 45%" }} dangerouslySetInnerHTML={html(hands14(-40, gap))} />
          <Word x={100} y={790} w={1720} size={104} align="center" op={ramp(lt, tw(6, REG("agree"), 3.0, 0.4), tw(6, REG("agree"), 3.0, 0.4) + 0.9) * (1 - ramp(lt, 7.6, 8.2))}><Em>{T.a6a.replace(/\*/g, "")}</Em><br /><span style={{ fontSize: 64 }}>{T.a6b}</span></Word>
          <div style={{ position: "absolute", left: 410, top: 800, width: 1100, padding: "22px 36px", background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, fontFamily: FF, fontWeight: 400, fontSize: 28, lineHeight: 1.36, color: INK, textAlign: "center", boxShadow: "0 18px 50px rgba(21,32,43,.12)", opacity: ramp(lt, 8.3, 8.9) }}>{T.card}</div>
        </>);
      }}</Layer>

      {/* 7 - the pen writes the signature, stroke by stroke */}
      <Layer k={6} t={t}>{(lt) => (<>
        <div style={{ opacity: ramp(lt, 0, 1.0) }} dangerouslySetInnerHTML={html(signing12(ramp(lt, 1.0, 7.2)))} />
        <Word x={100} y={880} w={1720} size={64} align="center" op={ramp(lt, tw(7, REG("own"), 6.0, 0.4), tw(7, REG("own"), 6.0, 0.4) + 0.8)}>{R(T.a7)}</Word>
      </>)}</Layer>

      {/* 8 - the globe returns faintly; the name, the phrase, the hairline */}
      <Layer k={7} t={t} push={0.02}>{(lt) => (<>
        <div style={{ opacity: 0.2 * ramp(lt, 0, 1.2), filter: "blur(1.5px)" }} dangerouslySetInnerHTML={html(globe(960, 560, 560, 28 + 3.2 * t, t))} />
        <Word x={110} y={250} w={1700} size={64} weight={500} align="center" op={ramp(lt, 0.2, 0.9)}>{T.a8a}</Word>
        <Word x={110} y={370} w={1700} size={104} align="center" op={ramp(lt, 0.8, 1.8)}>{R(T.a8b)}</Word>
        <svg width="1920" height="1080" style={{ position: "absolute", left: 0, top: 0 }}><path d={`M560 630 H${560 + 800 * ramp(lt, 2.2, 4.2)}`} stroke={BLUE} strokeWidth="2.4" strokeLinecap="round" filter="url(#glow)" /></svg>
      </>)}</Layer>

      {/* joins: 1 to 2 the lit lane runs out of the globe and becomes the horizon; 2 to 3 a wash of white */}
      {t > S[1] - 0.3 && t < S[1] + 1.2 && (() => { const u = ramp(t, S[1] - 0.2, S[1] + 0.9), op = Math.sin(Math.PI * Math.min(1, u)) * 0.9; return <svg width="1920" height="1080" style={{ position: "absolute", left: 0, top: 0, opacity: op }}><path d={`M${1300 - 1300 * u} 570 H${1300 + 620 * u}`} stroke="#fff" strokeWidth="6" filter="url(#glow)" /><path d={`M${1300 - 1300 * u} 570 H${1300 + 620 * u}`} stroke="#5fa3d6" strokeWidth="2" /></svg>; })()}
      <AbsoluteFill style={{ background: "#fff", opacity: Math.sin(Math.PI * Math.min(1, Math.max(0, (t - (S[2] - 0.3)) / 1.0))) * 0.8 * (t > S[2] - 0.3 && t < S[2] + 0.7 ? 1 : 0), pointerEvents: "none" }} />
      <AbsoluteFill style={{ pointerEvents: "none", background: "radial-gradient(ellipse at 50% 50%,rgba(255,255,255,0) 55%,rgba(21,32,43,.14) 100%)" }} />
      <AbsoluteFill style={{ pointerEvents: "none", opacity: 0.07, mixBlendMode: "multiply", backgroundImage: GRAIN }} />
      {/* fade out to white at the very end */}
      <AbsoluteFill style={{ background: "#fff", opacity: ramp(t, 88.8, 90) }} />
    </AbsoluteFill>
  );
};
