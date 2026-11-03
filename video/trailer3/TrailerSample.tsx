// @ts-nocheck
// Trailer sample, acts 1-2 (about 14 s), no voice, no music file, no photos. Time-driven version of the approved storyboard stills.
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, staticFile, delayRender, continueRender } from "remotion";
import { loadFont as loadSpectral } from "@remotion/google-fonts/Spectral";
import { DEFS, globe, seaDay, motes, smooth, INK, BLUE } from "./scenes";

const roman = loadSpectral("normal", { weights: ["300", "500"] });
const italic = loadSpectral("italic", { weights: ["300"] });
const fontHandle = delayRender("fonts");
Promise.all([roman.waitUntilDone(), italic.waitUntilDone()]).then(() => continueRender(fontHandle));
const FF = roman.fontFamily;

const ramp = (t, a, b) => smooth((t - a) / (b - a));
const Word: React.FC<{ x: number; y: number; w: number; size: number; weight?: number; op: number; align?: string; children: React.ReactNode }> = ({ x, y, w, size, weight = 300, op, align = "left", children }) => (
  <div style={{ position: "absolute", left: x, top: y + (1 - op) * 14, width: w, textAlign: align as any, fontFamily: FF, fontWeight: weight, fontSize: size, lineHeight: 1.05, color: INK, letterSpacing: ".01em", opacity: op, textShadow: "0 0 50px rgba(95,163,214,.28)" }}>{children}</div>
);
const Em: React.FC<{ children: React.ReactNode }> = ({ children }) => <em style={{ fontStyle: "italic", color: BLUE }}>{children}</em>;
const GRAIN = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .1  0 0 0 0 .15  0 0 0 0 .2  0 0 0 .9 0'/></filter><rect width='240' height='240' filter='url(%23n)'/></svg>")`;

export const TrailerSample: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const T2 = 7.6; // act 2 starts while act 1 dissolves out
  const t2 = t - T2;
  const a1 = t < T2 + 0.6 ? 1 - ramp(t, T2, T2 + 0.6) : 0;
  const a2 = ramp(t, T2, T2 + 0.6);
  const r = ramp(t2, 3.2, 4.7); // the haze parts over the near ship
  const shipHref = staticFile("mp/ship.svg");
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 42%,#ffffff 0%,#f0f6fb 62%,#e2ebf3 100%)`, overflow: "hidden" }}>
      <div dangerouslySetInnerHTML={{ __html: DEFS }} />
      {a1 > 0 && (
        <AbsoluteFill style={{ opacity: a1, transform: `scale(${1 + 0.03 * (t / 8)})`, transformOrigin: "65% 50%" }}>
          <div dangerouslySetInnerHTML={{ __html: globe(1300, 540, 400, 28 + 3.2 * t, t) + motes(t, "#5fa3d6") }} />
          <Word x={110} y={300} w={760} size={104} weight={500} op={ramp(t, 0.5, 1.4)}>MyPlatform</Word>
          <Word x={114} y={480} w={760} size={64} op={ramp(t, 1.6, 2.6)}>Physical commodities.<br />By invitation only.</Word>
        </AbsoluteFill>
      )}
      {a2 > 0 && (
        <AbsoluteFill style={{ opacity: a2, transform: `scale(${1 + 0.03 * (t2 / 6.4)})`, transformOrigin: "30% 60%" }}>
          <div dangerouslySetInnerHTML={{ __html: seaDay(Math.max(0, t2), r, shipHref) }} />
          <Word x={100} y={110} w={1720} size={104} align="center" op={ramp(t2, 0.5, 1.2) * (1 - ramp(t2, 3.0, 3.5))}>The <Em>counterparty.</Em></Word>
          <Word x={100} y={110} w={1720} size={104} align="center" op={ramp(t2, 3.6, 4.3)}><Em>Too</Em> early.</Word>
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{ pointerEvents: "none", background: "radial-gradient(ellipse at 50% 50%,rgba(255,255,255,0) 55%,rgba(21,32,43,.14) 100%)" }} />
      <AbsoluteFill style={{ pointerEvents: "none", opacity: 0.07, mixBlendMode: "multiply", backgroundImage: GRAIN }} />
    </AbsoluteFill>
  );
};
