// @ts-nocheck
// Draft sheet: the three drawn diagrams for the walkthrough films, one after the other (English and Spanish text).
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, delayRender, continueRender } from "remotion";
import { loadFont as loadSans } from "@remotion/google-fonts/SourceSans3";
import { DEFS, INK } from "./scenes";
import { EXTRA_DEFS } from "./scenesFull";
import { relayScene, docsScene, introScene } from "./filmDiagrams";
import TX from "./films-texts.json";
const sans = loadSans("normal", { weights: ["400", "600"] });
const h = delayRender("fonts");
sans.waitUntilDone().then(() => continueRender(h));
const PLAN = [["relay", 8.5], ["docs", 8], ["intro", 10.5]];
export const FilmsDiagramDraft: React.FC = () => {
  const frame = useCurrentFrame(), { fps } = useVideoConfig();
  const lang = ["en", "es"][Math.floor(frame / (fps * 28.5))] || "es";
  const t0 = (frame / fps) % 28.5;
  let acc = 0, svg = "";
  for (const [k, d] of PLAN) {
    if (t0 >= acc && t0 < acc + d + 0.5) { const T = TX[lang], t = t0 - acc; svg = k === "relay" ? relayScene(t, T) : k === "docs" ? docsScene(t, T) : introScene(t, T); break; }
    acc += d + 0.5;
  }
  return (<AbsoluteFill style={{ background: "linear-gradient(180deg,#f7fafd,#e7f0f8)", fontFamily: sans.fontFamily }}>
    <div dangerouslySetInnerHTML={{ __html: DEFS + EXTRA_DEFS + svg }} />
  </AbsoluteFill>);
};
