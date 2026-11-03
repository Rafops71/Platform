// @ts-nocheck
// Full trailer, 8 acts, about 90 s: SILENT (no music, no SFX, no voice). Time-driven versions of the approved storyboard drawings;
// the app pictures are the real captures (copper cathodes, South Africa, CIF) with the plural covered. Drawings only, no stock.
import React from "react";
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, staticFile, delayRender, continueRender } from "remotion";
import { loadFont as loadSpectral } from "@remotion/google-fonts/Spectral";
import { loadFont as loadSans } from "@remotion/google-fonts/SourceSans3";
import { DEFS, globe, seaDay, motes, smooth, INK, BLUE, SLATE, LINE } from "./scenes";
import { EXTRA_DEFS, hands13, signing12, diagram5 } from "./scenesFull";

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

// ---- app pieces (real captures) ----
const RS = 0.86, RX = 209, RY = 310;
const U = (f) => staticFile("mp/" + f);
const AppFull = ({ file }) => <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, overflow: "hidden" }}><Img src={U(file)} style={{ width: 1920, height: 1200, display: "block" }} /></div>;
const AppBlur = ({ file, blur, a }) => (<><div style={{ position: "absolute", left: -40, top: -40, width: 2000, height: 1160, overflow: "hidden", filter: `blur(${blur}px)` }}><Img src={U(file)} style={{ width: 2000, height: 1250, display: "block" }} /></div><div style={{ position: "absolute", inset: 0, background: `rgba(240,246,251,${a})` }} /></>);
const RowCard = () => (<div style={{ position: "absolute", left: RX, top: RY, width: 1788 * RS, height: 390 * RS, background: "#fff", borderRadius: 10, boxShadow: "0 60px 120px rgba(21,32,43,.24),0 8px 18px rgba(21,32,43,.10)", overflow: "hidden" }}><Img src={U("row.png")} style={{ width: "100%", display: "block" }} /><div style={{ position: "absolute", inset: 0, background: "rgba(240,246,251,.58)" }} /></div>);
const Lit = ({ x, y, w, h, pad = 5, op }) => op > 0.01 ? (<div style={{ position: "absolute", left: RX + (x - pad) * RS, top: RY + (y - pad) * RS, width: (w + 2 * pad) * RS, height: (h + 2 * pad) * RS, borderRadius: 12, overflow: "hidden", background: "#f6fbff", opacity: op, boxShadow: `0 0 0 2px ${BLUE},0 0 26px 6px rgba(95,163,214,.75),0 0 90px 18px rgba(95,163,214,.4)` }}><Img src={U("row.png")} style={{ position: "absolute", width: 1788 * RS, left: -(x - pad) * RS, top: -(y - pad) * RS, filter: "contrast(1.25) saturate(1.2)" }} /></div>) : null;
const Cursor = ({ x, y, s = 1 }) => (<svg width="1920" height="1080" style={{ position: "absolute", left: 0, top: 0, filter: "drop-shadow(0 6px 8px rgba(21,32,43,.4))" }}><g transform={`translate(${x} ${y}) scale(${s})`}><path d="M0 0 L0 34 L9 26 L16 42 L23 39 L16 24 L28 24 Z" fill="#fff" stroke={INK} strokeWidth="2" strokeLinejoin="round" /></g></svg>);
const Covered = () => (<><div style={{ position: "absolute", left: 780, top: 10, width: 360, height: 74, background: "rgb(29,74,109)" }} /><div style={{ position: "absolute", left: 296, top: 314, width: 300, height: 44, background: "rgb(240,246,251)" }} /></>);

const S = [0, 7.6, 21.6, 33.6, 45.6, 58.6, 74.6, 83.6], END = 90;
const Layer: React.FC<any> = ({ k, t, children, origin = "50% 50%", push = 0.03 }) => {
  const a0 = S[k], a1 = k + 1 < S.length ? S[k + 1] : END + 1, dur = a1 - a0 + 0.6;
  const op = (k === 0 ? 1 : ramp(t, a0, a0 + 0.6)) * (k + 1 < S.length ? 1 - ramp(t, a1, a1 + 0.6) : 1);
  if (op <= 0.001) return null;
  const lt = t - a0;
  return <AbsoluteFill style={{ opacity: op, transform: `scale(${1 + push * (lt / dur)})`, transformOrigin: origin }}>{children(lt)}</AbsoluteFill>;
};

export const TrailerFull: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const shipHref = staticFile("mp/ship.svg");
  const WORDS3 = (lt) => ["Commodity", "Quantity", "Origin", "Incoterms"].map((w, i) => <React.Fragment key={w}>{i ? " · " : ""}<Lite on={lt > [2.0, 3.5, 5.0, 6.5][i]}>{w}</Lite></React.Fragment>);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 42%,#ffffff 0%,#f0f6fb 62%,#e2ebf3 100%)`, overflow: "hidden" }}>
      <div dangerouslySetInnerHTML={html(DEFS + EXTRA_DEFS)} />

      {/* 1 - the globe */}
      <Layer k={0} t={t} origin="65% 50%">{(lt) => (<>
        <div dangerouslySetInnerHTML={html(globe(1300, 540, 400, 28 + 3.2 * t, t) + motes(t, "#5fa3d6"))} />
        <Word x={110} y={300} w={760} size={104} weight={500} op={ramp(lt, 0.5, 1.4)}>MyPlatform</Word>
        <Word x={114} y={480} w={760} size={64} op={ramp(lt, 1.6, 2.6)}>Physical commodities.<br />By invitation only.</Word>
      </>)}</Layer>

      {/* 2 - the ships in the haze */}
      <Layer k={1} t={t} origin="30% 60%">{(lt) => (<>
        <div dangerouslySetInnerHTML={html(seaDay(Math.max(0, lt), ramp(lt, 3.2, 4.7), shipHref))} />
        <Word x={100} y={110} w={1720} size={104} align="center" op={ramp(lt, 0.5, 1.2) * (1 - ramp(lt, 3.0, 3.5))}>The <Em>counterparty.</Em></Word>
        <Word x={100} y={110} w={1720} size={104} align="center" op={ramp(lt, 3.6, 4.3)}><Em>Too</Em> early.</Word>
      </>)}</Layer>

      {/* 3 - the offer lights up, the pointer clicks Contact, the Contact window opens */}
      <Layer k={2} t={t} origin="30% 40%">{(lt) => {
        const c = ramp(lt, 9.8, 10.5); const px = lt < 9.5 ? lerp(1500, RX + 110 * RS, ramp(lt, 6.8, 9.2)) : lerp(RX + 110 * RS, 730, ramp(lt, 10.4, 11.6)); const py = lt < 9.5 ? lerp(160, RY + 336 * RS, ramp(lt, 6.8, 9.2)) : lerp(RY + 336 * RS, 480, ramp(lt, 10.4, 11.6));
        const click = lt > 9.3 && lt < 9.6 ? 0.82 : 1;
        return (<>
          <div style={{ opacity: 1 - c }}>
            <AppBlur file="browse.png" blur={9} a={0.55} /><RowCard />
            <Lit x={285} y={28} w={238} h={42} op={ramp(lt, 2.0, 2.5)} /><Lit x={158} y={84} w={190} h={38} op={ramp(lt, 3.5, 4.0)} /><Lit x={424} y={84} w={246} h={38} op={ramp(lt, 5.0, 5.5)} /><Lit x={364} y={84} w={40} h={38} pad={4} op={ramp(lt, 6.5, 7.0)} />
            <Word x={110} y={760} w={1700} size={64} align="center" op={ramp(lt, 1.2, 2.0) * (1 - c)}>{WORDS3(lt)}</Word>
          </div>
          <div style={{ opacity: c }}><AppFull file="contact.png" /></div>
          {lt > 6.8 && <Cursor x={px} y={py} s={click} />}
        </>);
      }}</Layer>

      {/* 4 - role and documentation light up; the member stays out of focus */}
      <Layer k={3} t={t} origin="40% 40%">{(lt) => (<>
        <AppBlur file="browse.png" blur={14} a={0.72} />
        <Word x={100} y={70} w={1720} size={104} align="center" op={ramp(lt, 0.5, 1.3)}>The <Em>opportunity.</Em></Word>
        <RowCard />
        <Lit x={20} y={188} w={318} h={38} op={ramp(lt, 2.5, 3.0)} /><Lit x={350} y={188} w={390} h={38} op={ramp(lt, 5.0, 5.5)} />
        <div style={{ position: "absolute", left: 1590, top: 410, width: 130, height: 130, borderRadius: 65, border: `2px solid ${LINE}`, background: "radial-gradient(circle at 40% 35%,#f3f6f9,#cfd8e1)", filter: "blur(9px)", boxShadow: "0 0 60px rgba(95,163,214,.35)", opacity: ramp(lt, 1, 2) }} />
        <div style={{ opacity: ramp(lt, 1, 2), filter: "blur(5px)" }}><Small x={1545} y={560} w={220} op={1}>Member</Small></div>
        <Word x={100} y={740} w={1720} size={104} align="center" op={ramp(lt, 7.5, 8.4)}><Em>Not</Em> the member.</Word>
      </>)}</Layer>

      {/* 5 - the mailbox (plural covered) melts into the diagram; envelopes travel both ways through the centre */}
      <Layer k={4} t={t} origin="50% 40%" push={0.02}>{(lt) => {
        const d = ramp(lt, 3.8, 4.8);
        return (<>
          <div style={{ opacity: 1 - d }}><AppFull file="mailbox.png" /><Covered /></div>
          {d > 0 && (<div style={{ opacity: d }}>
            <div dangerouslySetInnerHTML={html(diagram5(Math.max(0, lt - 4.4)))} />
            <Small x={150} y={560} w={340} op={1}>Member</Small><Small x={1430} y={560} w={340} op={1}>Member</Small>
            <Word x={760} y={418} w={400} size={42} weight={500} align="center" op={1}>MyPlatform</Word>
            <div style={{ position: "absolute", left: 760, top: 480, width: 400, textAlign: "center", fontFamily: FS, fontSize: 24, letterSpacing: ".26em", textTransform: "uppercase", color: SLATE }}>Operator</div>
            <Word x={160} y={760} w={1600} size={104} align="center" op={ramp(lt, 5.6, 6.5)}>Through the <Em>Operator.</Em></Word>
          </div>)}
        </>);
      }}</Layer>

      {/* 6 - the handshake (two gentle shakes), then the written card under the dimmed picture */}
      <Layer k={5} t={t} push={0}>{(lt) => {
        const arrive = ramp(lt, 0, 1.4), sh = lt > 1.8 && lt < 4.2 ? Math.sin(2 * Math.PI * (lt - 1.8) / 1.2) * Math.min(1, (lt - 1.8) / 0.3, (4.2 - lt) / 0.3) : 0;
        const dim = ramp(lt, 5.0, 6.0);
        return (<>
          <div style={{ position: "absolute", left: 210, top: 260, width: 1500, padding: "56px 70px", background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, fontFamily: FF, fontWeight: 400, fontSize: 46, lineHeight: 1.35, color: INK, textAlign: "center", boxShadow: "0 30px 80px rgba(21,32,43,.12)", opacity: ramp(lt, 5.4, 6.2) }}>Membership is provided without any membership or access fees. The Operator of MyPlatform is remunerated by commission on successfully concluded transactions resulting from introductions made through MyPlatform.</div>
          <div style={{ position: "absolute", inset: 0, opacity: arrive * lerp(1, 0.26, dim), mixBlendMode: "multiply", transform: `translateY(${(-18 * sh).toFixed(1)}px) rotate(${(0.7 * sh).toFixed(2)}deg) scaleX(${(lerp(0.82, 1, arrive)).toFixed(3)})`, transformOrigin: "50% 45%" }} dangerouslySetInnerHTML={html(hands13(-40))} />
          <Word x={100} y={790} w={1720} size={104} align="center" op={ramp(lt, 1.0, 2.0) * (1 - ramp(lt, 4.6, 5.2))}><Em>Mutual agreement.</Em><br /><span style={{ fontSize: 64 }}>Then the introduction.</span></Word>
        </>);
      }}</Layer>

      {/* 7 - the pen writes the signature, stroke by stroke */}
      <Layer k={6} t={t}>{(lt) => (<>
        <div style={{ opacity: ramp(lt, 0, 1.0) }} dangerouslySetInnerHTML={html(signing12(ramp(lt, 1.2, 6.6)))} />
        <Word x={100} y={880} w={1720} size={64} align="center" op={ramp(lt, 6.8, 7.8)}>Each member warrants <Em>their own</Em> representations.</Word>
      </>)}</Layer>

      {/* 8 - the globe returns faintly; the name, the phrase, the hairline */}
      <Layer k={7} t={t} push={0.02}>{(lt) => (<>
        <div style={{ opacity: 0.2 * ramp(lt, 0, 1.2), filter: "blur(1.5px)" }} dangerouslySetInnerHTML={html(globe(960, 560, 560, 28 + 3.2 * t, t))} />
        <Word x={110} y={250} w={1700} size={64} weight={500} align="center" op={ramp(lt, 0.3, 1.2)}>MyPlatform</Word>
        <Word x={110} y={370} w={1700} size={104} align="center" op={ramp(lt, 1.2, 2.4)}>Where opportunity<br />meets <Em>discretion.</Em></Word>
        <svg width="1920" height="1080" style={{ position: "absolute", left: 0, top: 0 }}><path d={`M560 630 H${560 + 800 * ramp(lt, 2.4, 4.4)}`} stroke={BLUE} strokeWidth="2.4" strokeLinecap="round" filter="url(#glow)" /></svg>
      </>)}</Layer>

      <AbsoluteFill style={{ pointerEvents: "none", background: "radial-gradient(ellipse at 50% 50%,rgba(255,255,255,0) 55%,rgba(21,32,43,.14) 100%)" }} />
      <AbsoluteFill style={{ pointerEvents: "none", opacity: 0.07, mixBlendMode: "multiply", backgroundImage: GRAIN }} />
      {/* fade out to white at the very end */}
      <AbsoluteFill style={{ background: "#fff", opacity: ramp(t, 88.8, 90) }} />
    </AbsoluteFill>
  );
};
