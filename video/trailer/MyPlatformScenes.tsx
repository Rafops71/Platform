import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";

// The platform's trailer scenes (bespoke "atelier" mode). Bright "sky" look:
// light blue-white backgrounds, dark-blue text, gold and green accents, and
// something always moving - drifting shapes, a slow camera push, particles.
// SVG/CSS only: no emoji, no images, the same on any machine.

const NAVY = "#123049";
const BLUE = "#1d4a6d";
const SKY1 = "#EAF4FC";
const SKY2 = "#FFFFFF";
const GOLD = "#E3A63A";
const GREEN = "#2FA672";
const RED = "#D9534F";
const FONT = "Source Sans 3, Inter, system-ui, sans-serif";
const SERIF = "Spectral, Georgia, serif";

type Labels = Record<string, string>;
const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

// ---------------------------------------------------------------- ambience
// Light background with slowly drifting soft blobs, floating particles, a
// gentle camera push, and a soft fade/blur at the start and end of a scene.
const Stage: React.FC<{ children: React.ReactNode; seconds: number; seed?: number }> = ({ children, seconds, seed = 1 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const end = seconds * fps;
  const push = interpolate(frame, [0, end], [1, 1.06]);
  const enter = interpolate(frame, [0, fps * 0.5], [0, 1], clamp);
  const exit = interpolate(frame, [end - fps * 0.4, end], [1, 0], clamp);
  const o = Math.min(enter, exit);
  const blobs = [0, 1, 2, 3].map((i) => ({
    x: 300 + ((i * 523 + seed * 211) % 1400) + 120 * Math.sin((frame + i * 40) / (70 + i * 9)),
    y: 200 + ((i * 337 + seed * 97) % 700) + 90 * Math.cos((frame + i * 25) / (80 + i * 7)),
    r: 260 + i * 70,
    c: i % 2 ? "rgba(227,166,58,0.16)" : "rgba(29,74,109,0.10)",
  }));
  const dots = Array.from({ length: 26 }, (_, i) => ({
    x: (i * 173 + seed * 59) % 1920,
    y: (1080 + ((i * 97) % 1080) - frame * (0.6 + (i % 5) * 0.25)) % 1080,
    s: 4 + (i % 4) * 2,
  }));
  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${SKY1}, ${SKY2} 60%, #F3F8FD)` }}>
      {blobs.map((b, i) => (
        <div key={i} style={{ position: "absolute", left: b.x - b.r, top: b.y - b.r, width: b.r * 2, height: b.r * 2, borderRadius: "50%", background: b.c, filter: "blur(60px)" }} />
      ))}
      {dots.map((d, i) => (
        <div key={i} style={{ position: "absolute", left: d.x, top: d.y < 0 ? d.y + 1080 : d.y, width: d.s, height: d.s, borderRadius: "50%", background: i % 3 ? "rgba(29,74,109,0.25)" : "rgba(227,166,58,0.5)" }} />
      ))}
      <AbsoluteFill style={{ transform: `scale(${push})`, opacity: o, filter: `blur(${(1 - o) * 8}px)` }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};

// Words that rise in one after another.
const Kinetic: React.FC<{ text: string; start: number; size: number; color?: string; weight?: number; font?: string; step?: number }> = ({
  text, start, size, color = NAVY, weight = 700, font = FONT, step = 4,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: `0 ${size * 0.28}px`, fontFamily: font, fontSize: size, fontWeight: weight, color }}>
      {text.split(" ").map((w, i) => {
        const s = spring({ frame: frame - start - i * step, fps, config: { damping: 13, stiffness: 140 } });
        return <span key={i} style={{ display: "inline-block", opacity: s, transform: `translateY(${(1 - s) * 40}px)` }}>{w}</span>;
      })}
    </div>
  );
};

// ---------------------------------------------------------------- icons
const Ship: React.FC<{ c?: string }> = ({ c = BLUE }) => (
  <svg width="64" height="40" viewBox="0 0 64 40"><path d="M4 24 H60 L52 36 H12 Z" fill={c} /><rect x="16" y="12" width="12" height="12" fill={GOLD} /><rect x="30" y="12" width="12" height="12" fill={GREEN} /><rect x="23" y="2" width="12" height="10" fill="#6FA3C8" /></svg>
);
const Barrel: React.FC = () => (
  <svg width="40" height="52" viewBox="0 0 40 52"><rect x="4" y="2" width="32" height="48" rx="8" fill={BLUE} /><rect x="4" y="14" width="32" height="4" fill={GOLD} /><rect x="4" y="34" width="32" height="4" fill={GOLD} /></svg>
);
const GoldBar: React.FC = () => (
  <svg width="62" height="34" viewBox="0 0 62 34"><path d="M10 2 H52 L60 32 H2 Z" fill={GOLD} /><path d="M14 6 H48" stroke="#F6D58F" strokeWidth="3" /></svg>
);
const Wheat: React.FC = () => (
  <svg width="40" height="64" viewBox="0 0 40 64"><path d="M20 62 V14" stroke={GOLD} strokeWidth="4" />{[0, 1, 2, 3].map((i) => (<g key={i}><ellipse cx="13" cy={14 + i * 11} rx="6" ry="9" fill={GOLD} transform={`rotate(-30 13 ${14 + i * 11})`} /><ellipse cx="27" cy={14 + i * 11} rx="6" ry="9" fill={GOLD} transform={`rotate(30 27 ${14 + i * 11})`} /></g>))}</svg>
);
const Container: React.FC = () => (
  <svg width="70" height="36" viewBox="0 0 70 36"><rect x="2" y="2" width="66" height="32" rx="3" fill={GREEN} />{[0, 1, 2, 3, 4].map((i) => <rect key={i} x={10 + i * 12} y="6" width="4" height="24" fill="#5CC497" />)}</svg>
);

const Person: React.FC<{ x: number; y: number; blur?: number; color?: string; label?: string; bob?: number }> = ({ x, y, blur = 0, color = BLUE, label, bob = 0 }) => (
  <div style={{ position: "absolute", left: x - 80, top: y - 110 + bob, width: 160, textAlign: "center" }}>
    <div style={{ filter: `blur(${blur}px)` }}>
      <div style={{ width: 80, height: 80, borderRadius: "50%", background: color, margin: "0 auto", boxShadow: "0 8px 24px rgba(18,48,73,0.25)" }} />
      <div style={{ width: 140, height: 80, borderRadius: "70px 70px 14px 14px", background: color, margin: "12px auto 0", boxShadow: "0 8px 24px rgba(18,48,73,0.25)" }} />
    </div>
    {label && <div style={{ marginTop: 14, fontFamily: FONT, fontSize: 30, color: NAVY, fontWeight: 700 }}>{label}</div>}
  </div>
);

const Handshake: React.FC<{ split: number; color?: string; shake?: number }> = ({ split, color = BLUE, shake = 0 }) => (
  <svg width="300" height="140" viewBox="0 0 300 140" style={{ transform: `translateX(${shake}px)` }}>
    <g transform={`translate(${-split} ${split * 0.7}) rotate(${-split / 2} 140 70)`}>
      <rect x="10" y="48" width="140" height="44" rx="22" fill={color} />
    </g>
    <g transform={`translate(${split} ${split * 0.7}) rotate(${split / 2} 160 70)`}>
      <rect x="150" y="48" width="140" height="44" rx="22" fill={color} />
    </g>
  </svg>
);

// ---------------------------------------------------------------- scene 1
// A dotted world, trade routes drawing themselves, goods travelling along
// them, and the title words rising in.
const ROUTES = [
  { a: [430, 420], b: [980, 360], h: 160, icon: "ship" },
  { a: [980, 360], b: [1500, 470], h: 140, icon: "container" },
  { a: [600, 640], b: [1120, 600], h: 180, icon: "barrel" },
  { a: [1120, 600], b: [1560, 360], h: 200, icon: "gold" },
  { a: [760, 300], b: [1300, 720], h: 120, icon: "wheat" },
];
const qpt = (a: number[], b: number[], h: number, t: number) => {
  const cx = (a[0] + b[0]) / 2, cy = Math.min(a[1], b[1]) - h;
  const x = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * cx + t * t * b[0];
  const y = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * cy + t * t * b[1];
  return [x, y];
};
const GoodsIcon: React.FC<{ kind: string }> = ({ kind }) =>
  kind === "ship" ? <Ship /> : kind === "container" ? <Container /> : kind === "barrel" ? <Barrel /> : kind === "gold" ? <GoldBar /> : <Wheat />;

const WorldScene: React.FC<{ labels: Labels; seconds: number }> = ({ labels, seconds }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const grid: React.ReactNode[] = [];
  for (let gx = 0; gx < 48; gx++) for (let gy = 0; gy < 22; gy++) {
    const x = 260 + gx * 29, y = 220 + gy * 29;
    // a rough "continents" mask from a few overlapping ellipses
    const inside = [[560, 420, 220, 170], [980, 380, 200, 210], [1420, 470, 260, 190], [700, 720, 150, 120], [1560, 760, 120, 80]]
      .some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1);
    if (!inside) continue;
    const tw = 0.35 + 0.25 * Math.sin((frame + gx * 7 + gy * 11) / 18);
    grid.push(<div key={`${gx}-${gy}`} style={{ position: "absolute", left: x, top: y, width: 7, height: 7, borderRadius: "50%", background: `rgba(29,74,109,${tw})` }} />);
  }
  return (
    <Stage seconds={seconds} seed={1}>
      <AbsoluteFill style={{ opacity: 0.9 }}>{grid}</AbsoluteFill>
      <svg width="1920" height="1080" style={{ position: "absolute" }}>
        {ROUTES.map((r, i) => {
          const start = fps * (0.3 + i * 0.35);
          const p = interpolate(frame, [start, start + fps * 1.4], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
          const cx = (r.a[0] + r.b[0]) / 2, cy = Math.min(r.a[1], r.b[1]) - r.h;
          const d = `M${r.a[0]} ${r.a[1]} Q${cx} ${cy} ${r.b[0]} ${r.b[1]}`;
          return (
            <g key={i}>
              <path d={d} stroke={i % 2 ? GOLD : BLUE} strokeWidth="4" fill="none" strokeDasharray="1400" strokeDashoffset={1400 * (1 - p)} strokeLinecap="round" />
              <circle cx={r.a[0]} cy={r.a[1]} r={10 * p} fill={GOLD} />
              <circle cx={r.b[0]} cy={r.b[1]} r={10 * p} fill={GOLD} />
            </g>
          );
        })}
      </svg>
      {ROUTES.map((r, i) => {
        const start = fps * (1.2 + i * 0.35);
        const t = ((frame - start) / (fps * 3.2)) % 1;
        if (frame < start) return null;
        const [x, y] = qpt(r.a, r.b, r.h, t);
        return <div key={i} style={{ position: "absolute", left: x - 32, top: y - 26, filter: "drop-shadow(0 6px 10px rgba(18,48,73,0.25))" }}><GoodsIcon kind={r.icon} /></div>;
      })}
      <div style={{ position: "absolute", top: 70, width: "100%", textAlign: "center" }}>
        <Kinetic text={labels.title || "The Platform"} start={fps * 0.4} size={120} font={SERIF} weight={600} step={6} />
      </div>
      <div style={{ position: "absolute", bottom: 90, width: "100%", textAlign: "center", padding: "0 160px", boxSizing: "border-box" }}>
        <Kinetic text={labels.caption || ""} start={fps * 1.6} size={50} weight={600} color={BLUE} step={3} />
      </div>
    </Stage>
  );
};

// ---------------------------------------------------------------- scene 2
const TrustScene: React.FC<{ labels: Labels; seconds: number }> = ({ labels, seconds }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inP = spring({ frame, fps, config: { damping: 14 } });
  const crackAt = seconds * fps * 0.55;
  const crack = interpolate(frame, [crackAt, crackAt + fps * 0.6], [0, 46], { ...clamp, easing: Easing.out(Easing.back(2)) });
  const shake = frame > crackAt && frame < crackAt + fps * 0.5 ? 10 * Math.sin(frame * 2.2) : 0;
  const flash = interpolate(frame, [crackAt, crackAt + 4, crackAt + fps * 0.6], [0, 0.35, 0], clamp);
  const goods = [
    { k: "barrel", x: 300, y: 260 }, { k: "gold", x: 1580, y: 240 }, { k: "wheat", x: 240, y: 760 },
    { k: "container", x: 1600, y: 780 }, { k: "ship", x: 900, y: 180 },
  ];
  return (
    <Stage seconds={seconds} seed={2}>
      {goods.map((g, i) => {
        const s = spring({ frame: frame - i * 5, fps, config: { damping: 12 } });
        return (
          <div key={i} style={{ position: "absolute", left: g.x, top: g.y + 18 * Math.sin((frame + i * 20) / 16), opacity: 0.85 * s, transform: `scale(${1.6 * s}) rotate(${6 * Math.sin((frame + i * 13) / 20)}deg)` }}>
            <GoodsIcon kind={g.k} />
          </div>
        );
      })}
      <Person x={600 - 200 * (1 - inP)} y={560} label={labels.trader} bob={8 * Math.sin(frame / 10)} />
      <Person x={1320 + 200 * (1 - inP)} y={560} label={labels.trader} bob={8 * Math.sin(frame / 10 + 2)} />
      {[0, 1, 2].map((i) => {
        const o = interpolate(frame, [fps * (0.5 + i * 0.4), fps * (0.9 + i * 0.4), crackAt - 6, crackAt], [0, 1, 1, 0], clamp);
        return (
          <div key={i} style={{ position: "absolute", left: 860 + (i - 1) * 110, top: 300 - 30 * Math.abs(Math.sin((frame + i * 9) / 7)), fontFamily: FONT, fontWeight: 800, fontSize: 110 - i * 15, color: i === 1 ? GOLD : BLUE, opacity: o }}>?</div>
        );
      })}
      <div style={{ position: "absolute", left: 810, top: 480, opacity: interpolate(frame, [crackAt - fps * 0.8, crackAt - fps * 0.4], [0, 1], clamp) }}>
        <Handshake split={crack} shake={shake} color={crack > 5 ? RED : BLUE} />
      </div>
      <AbsoluteFill style={{ background: RED, opacity: flash }} />
      <div style={{ position: "absolute", width: "100%", bottom: 110, textAlign: "center" }}>
        <Kinetic text={labels.caption || ""} start={fps * 0.8} size={54} weight={700} step={3} />
      </div>
    </Stage>
  );
};

// ---------------------------------------------------------------- scene 3
const BrokerScene: React.FC<{ labels: Labels; seconds: number }> = ({ labels, seconds }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const end = seconds * fps;
  const reveal = interpolate(frame, [end - fps * 3.2, end - fps * 2.0], [0, 1], clamp);
  const blur = 16 * (1 - reveal);
  const msgs = [0, 1, 2].map((k) => {
    const cycle = fps * 1.8;
    const f = frame - k * fps * 0.6;
    if (f < fps * 0.6) return null;
    const t = (f % cycle) / cycle;
    const right = Math.floor(f / cycle + k) % 2 === 0;
    const x = right ? interpolate(t, [0, 1], [580, 1340]) : interpolate(t, [0, 1], [1340, 580]);
    const y = 470 - 60 * Math.sin(t * Math.PI) + (k - 1) * 22;
    return { x, y, o: (1 - reveal) * Math.min(1, Math.sin(t * Math.PI) * 3) };
  });
  const rings = [0, 1, 2].map((i) => ((frame + i * 20) % 60) / 60);
  const line = interpolate(frame, [end - fps * 2.0, end - fps * 1.2], [0, 1], clamp);
  const hs = spring({ frame: frame - (end - fps * 1.3), fps, config: { damping: 10 } });
  return (
    <Stage seconds={seconds} seed={3}>
      <div style={{ position: "absolute", left: 580, right: 580, top: 468, height: 4, background: "rgba(29,74,109,0.18)" }} />
      <svg width="1920" height="1080" style={{ position: "absolute" }}>
        <path d="M580 690 Q960 830 1340 690" stroke={GREEN} strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray="900" strokeDashoffset={900 * (1 - line)} />
      </svg>
      <Person x={580} y={540} blur={blur} label={labels.memberA} bob={6 * Math.sin(frame / 12)} />
      <Person x={1340} y={540} blur={blur} label={labels.memberB} bob={6 * Math.sin(frame / 12 + 1.5)} />
      {rings.map((r, i) => (
        <div key={i} style={{ position: "absolute", left: 960 - 100 - 80 * r, top: 470 - 100 - 80 * r, width: 200 + 160 * r, height: 200 + 160 * r, borderRadius: 40 + 40 * r, border: `4px solid rgba(227,166,58,${0.6 * (1 - r) * (1 - reveal)})` }} />
      ))}
      <div style={{ position: "absolute", left: 960 - 100, top: 370, width: 200, height: 200, borderRadius: 40, background: `linear-gradient(145deg, #F2BE5C, ${GOLD})`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 18px 50px rgba(227,166,58,0.45)", transform: `scale(${1 + 0.04 * Math.sin(frame / 6)})` }}>
        <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 32, color: NAVY }}>{labels.operator}</div>
      </div>
      {msgs.map((m, i) => m && (
        <div key={i} style={{ position: "absolute", left: m.x - 36, top: m.y - 28, width: 72, height: 54, borderRadius: 10, background: "#FFFFFF", border: `3px solid ${BLUE}`, opacity: m.o, boxShadow: "0 8px 20px rgba(18,48,73,0.25)" }}>
          <div style={{ margin: "12px 12px 0", height: 6, background: BLUE, borderRadius: 3 }} />
          <div style={{ margin: "8px 12px 0", height: 6, width: 30, background: GOLD, borderRadius: 3 }} />
        </div>
      ))}
      <div style={{ position: "absolute", left: 810, top: 760, opacity: reveal, transform: `scale(${0.5 + 0.5 * hs})` }}>
        <Handshake split={0} color={GREEN} />
      </div>
      <div style={{ position: "absolute", width: "100%", top: 110, textAlign: "center" }}>
        {reveal < 0.5
          ? <Kinetic text={labels.caption || ""} start={fps * 0.4} size={54} weight={700} step={3} />
          : <Kinetic text={labels.agreed || ""} start={end - fps * 2.6} size={58} weight={800} color={GREEN} step={3} />}
      </div>
    </Stage>
  );
};

// ---------------------------------------------------------------- scene 4
const LockIcon: React.FC<{ p: number }> = ({ p }) => (
  <svg width="130" height="130" viewBox="0 0 130 130">
    <rect x="28" y="58" width="74" height="58" rx="12" fill={GOLD} />
    <path d={`M42 58 V${40 - 14 * (1 - p)} a23 23 0 0 1 46 0 V${58 - 22 * (1 - p)}`} stroke={GOLD} strokeWidth="11" fill="none" strokeLinecap="round" />
    <circle cx="65" cy="86" r="8" fill={NAVY} />
  </svg>
);
// A document whose lines write themselves in: offers state what exists.
// Deliberately not a tick - the platform verifies nothing (owner, 2026-10-28).
const CheckIcon: React.FC<{ p: number }> = ({ p }) => (
  <svg width="130" height="130" viewBox="0 0 130 130">
    <path d="M30 14 H82 L102 34 V116 H30 Z" fill="#FFFFFF" stroke={BLUE} strokeWidth="6" strokeLinejoin="round" />
    <path d="M82 14 V34 H102" fill="none" stroke={BLUE} strokeWidth="6" strokeLinejoin="round" />
    {[0, 1, 2, 3].map((i) => (
      <rect key={i} x="42" y={50 + i * 15} width={(i === 3 ? 30 : 48) * Math.max(0, Math.min(1, p * 4 - i))} height="7" rx="3" fill={i === 0 ? GOLD : BLUE} />
    ))}
  </svg>
);
const LinkIcon: React.FC<{ p: number }> = ({ p }) => (
  <svg width="170" height="130" viewBox="0 0 170 130">
    <line x1="24" y1="70" x2={24 + 61 * p} y2="70" stroke={BLUE} strokeWidth="7" />
    <line x1="146" y1="70" x2={146 - 61 * p} y2="70" stroke={BLUE} strokeWidth="7" />
    <circle cx="24" cy="70" r="20" fill={BLUE} /><circle cx="146" cy="70" r="20" fill={BLUE} />
    <rect x="55" y="34" width="60" height="72" rx="14" fill={GOLD} transform={`scale(${0.6 + 0.4 * p})`} style={{ transformOrigin: "85px 70px" }} />
    <circle cx="85" cy="58" r="11" fill={NAVY} /><rect x="70" y="74" width="30" height="20" rx="10" fill={NAVY} />
  </svg>
);

const BenefitsScene: React.FC<{ labels: Labels; at: number[]; seconds: number }> = ({ labels, at, seconds }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items = [
    { title: labels.b1, line: labels.b1line },
    { title: labels.b2, line: labels.b2line },
    { title: labels.b3, line: labels.b3line },
  ];
  return (
    <Stage seconds={seconds} seed={4}>
      <AbsoluteFill style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 56, perspective: 1400 }}>
        {items.map((it, i) => {
          const s = spring({ frame: frame - at[i] * fps, fps, config: { damping: 12, stiffness: 110 } });
          const p = interpolate(frame, [at[i] * fps + 8, at[i] * fps + 28], [0, 1], clamp);
          const active = frame >= at[i] * fps && (i === 2 || frame < at[i + 1] * fps);
          const float = 8 * Math.sin((frame + i * 25) / 14);
          return (
            <div key={i} style={{
              width: 500, height: 560, borderRadius: 32, background: "#FFFFFF", padding: 44, boxSizing: "border-box", textAlign: "center",
              boxShadow: active ? "0 30px 70px rgba(29,74,109,0.28)" : "0 14px 36px rgba(29,74,109,0.14)",
              border: active ? `3px solid ${GOLD}` : "3px solid transparent",
              opacity: s, transform: `translateY(${120 * (1 - s) + float}px) rotateY(${(1 - s) * (i - 1) * 35}deg) scale(${active ? 1.05 : 1})`,
            }}>
              <div style={{ height: 140, display: "flex", justifyContent: "center", alignItems: "center" }}>
                {i === 0 ? <LockIcon p={p} /> : i === 1 ? <CheckIcon p={p} /> : <LinkIcon p={p} />}
              </div>
              <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 46, color: NAVY, marginTop: 24, lineHeight: 1.15 }}>{it.title}</div>
              <div style={{ fontFamily: FONT, fontSize: 32, lineHeight: 1.35, color: BLUE, marginTop: 18 }}>{it.line}</div>
            </div>
          );
        })}
      </AbsoluteFill>
    </Stage>
  );
};

// ---------------------------------------------------------------- scene 5
const TaglineScene: React.FC<{ labels: Labels; seconds: number }> = ({ labels, seconds }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const text = labels.title || "";
  const sweep = interpolate(frame, [fps * 1.4, fps * 2.6], [-30, 130], clamp);
  const parts = Array.from({ length: 36 }, (_, i) => {
    const a = (i / 36) * Math.PI * 2;
    const t = interpolate(frame, [0, fps * 1.6], [1, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
    return { x: 960 + Math.cos(a) * (120 + 900 * t), y: 540 + Math.sin(a) * (60 + 500 * t), o: 1 - t * 0.3 };
  });
  return (
    <Stage seconds={seconds} seed={5}>
      {parts.map((p, i) => (
        <div key={i} style={{ position: "absolute", left: p.x, top: p.y, width: 10, height: 10, borderRadius: "50%", background: i % 2 ? GOLD : BLUE, opacity: p.o * interpolate(frame, [fps * 1.6, fps * 2.4], [1, 0], clamp) }} />
      ))}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={{ position: "relative", fontFamily: SERIF, fontWeight: 600, fontSize: 96, color: NAVY, display: "flex" }}>
          {text.split("").map((ch, i) => {
            const s = spring({ frame: frame - fps * 0.4 - i * 1.3, fps, config: { damping: 14 } });
            return <span key={i} style={{ display: "inline-block", whiteSpace: "pre", opacity: s, transform: `translateY(${(1 - s) * 30}px)` }}>{ch}</span>;
          })}
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(100deg, transparent ${sweep - 12}%, rgba(255,226,150,0.85) ${sweep}%, transparent ${sweep + 12}%)`, mixBlendMode: "screen" }} />
        </div>
        <div style={{ width: interpolate(frame, [fps * 1.8, fps * 2.8], [0, 700], clamp), height: 5, background: GOLD, borderRadius: 3, marginTop: 26 }} />
      </AbsoluteFill>
    </Stage>
  );
};

// ---------------------------------------------------------------- globe
// A spinning dotted globe (orthographic), continents from rough lon/lat
// ellipses, great-circle routes drawing themselves, ships travelling them.
const LAND = [
  [-100, 45, 32, 20], [-80, 30, 12, 10], [-60, -15, 16, 26], [15, 50, 18, 11], [20, 5, 21, 28],
  [90, 47, 48, 20], [78, 20, 9, 11], [110, 25, 14, 12], [115, 0, 14, 6], [135, -25, 17, 11], [45, 25, 10, 8],
];
const isLand = (lon: number, lat: number) => LAND.some(([cx, cy, rx, ry]) => ((lon - cx) / rx) ** 2 + ((lat - cy) / ry) ** 2 < 1);
const CITIES: Record<string, [number, number]> = {
  santos: [-46, -24], rotterdam: [4, 52], lagos: [3, 6], shanghai: [121, 31], houston: [-95, 30],
  singapore: [104, 1], perth: [116, -32], dubai: [55, 25], mumbai: [73, 19],
};
const GROUTES: [string, string][] = [["santos", "rotterdam"], ["houston", "rotterdam"], ["lagos", "shanghai"], ["perth", "singapore"], ["dubai", "mumbai"], ["singapore", "rotterdam"]];
const toVec = (lon: number, lat: number) => {
  const a = (lon * Math.PI) / 180, b = (lat * Math.PI) / 180;
  return [Math.cos(b) * Math.cos(a), Math.cos(b) * Math.sin(a), Math.sin(b)];
};
const slerp = (p: number[], q: number[], t: number) => {
  const d = Math.acos(Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2]));
  if (d < 1e-6) return p;
  const s = Math.sin(d), a = Math.sin((1 - t) * d) / s, b = Math.sin(t * d) / s;
  return [a * p[0] + b * q[0], a * p[1] + b * q[1], a * p[2] + b * q[2]];
};

const GlobeScene: React.FC<{ labels: Labels; seconds: number }> = ({ labels, seconds }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const R = 360, CX = 960, CY = 600;
  const rot = -40 + frame * 0.45;            // degrees of spin
  const tilt = (18 * Math.PI) / 180;
  const project = (v: number[]) => {
    const r = (rot * Math.PI) / 180;
    // spin about the polar axis, then tilt towards the viewer
    const x1 = v[0] * Math.cos(r) - v[1] * Math.sin(r);
    const y1 = v[0] * Math.sin(r) + v[1] * Math.cos(r);
    const z1 = v[2];
    const y2 = y1, z2 = z1 * Math.cos(tilt) - x1 * Math.sin(tilt), x2 = z1 * Math.sin(tilt) + x1 * Math.cos(tilt);
    return { sx: CX + R * y2, sy: CY - R * z2, front: x2 > 0, depth: x2 };
  };
  const dots: React.ReactNode[] = [];
  for (let lat = -70; lat <= 75; lat += 3) for (let lon = -180; lon < 180; lon += 3) {
    if (!isLand(lon, lat)) continue;
    const p = project(toVec(lon, lat));
    if (!p.front) continue;
    dots.push(<circle key={`${lon},${lat}`} cx={p.sx} cy={p.sy} r={3.2} fill={BLUE} opacity={0.35 + 0.6 * p.depth} />);
  }
  const appear = spring({ frame, fps, config: { damping: 16 } });
  return (
    <Stage seconds={seconds} seed={1}>
      <div style={{ position: "absolute", left: CX - R - 40, top: CY - R - 40, width: 2 * R + 80, height: 2 * R + 80, borderRadius: "50%", background: "radial-gradient(circle at 40% 35%, rgba(255,255,255,0.95), rgba(214,233,248,0.9) 55%, rgba(170,205,232,0.9))", boxShadow: "0 40px 120px rgba(29,74,109,0.25)", transform: `scale(${0.85 + 0.15 * appear})` }} />
      <svg width="1920" height="1080" style={{ position: "absolute", transform: `scale(${0.85 + 0.15 * appear})`, transformOrigin: `${CX}px ${CY}px` }}>
        {dots}
        {GROUTES.map(([a, b], i) => {
          const P = toVec(...CITIES[a]), Q = toVec(...CITIES[b]);
          const start = fps * (0.6 + i * 0.45);
          const prog = interpolate(frame, [start, start + fps * 1.6], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
          const pts: string[] = [];
          const N = 40;
          for (let k = 0; k <= N * prog; k++) {
            const v = slerp(P, Q, k / N);
            const lift = 1 + 0.12 * Math.sin((Math.PI * k) / N);   // arc above the surface
            const p = project([v[0] * lift, v[1] * lift, v[2] * lift]);
            pts.push(p.front ? `${p.sx},${p.sy}` : "|");
          }
          // a route behind the globe is hidden: split wherever it goes round
          const segs = pts.join(" ").split("|").map((x) => x.trim()).filter((x) => x.includes(" "));
          const ship = frame > start + fps * 1.6 ? ((frame - start - fps * 1.6) / (fps * 2.6)) % 1 : -1;
          let shipP = null;
          if (ship >= 0) { const v = slerp(P, Q, ship); const l = 1 + 0.12 * Math.sin(Math.PI * ship); shipP = project([v[0] * l, v[1] * l, v[2] * l]); }
          const ends = [P, Q].map((v) => project(v));
          return (
            <g key={i}>
              {segs.map((s, j) => <polyline key={j} points={s.trim()} stroke={i % 2 ? GOLD : GREEN} strokeWidth={5} fill="none" strokeLinecap="round" />)}
              {ends.map((e, j) => e.front && <circle key={j} cx={e.sx} cy={e.sy} r={9 * prog} fill={GOLD} stroke="#fff" strokeWidth={3} />)}
              {shipP && shipP.front && <circle cx={shipP.sx} cy={shipP.sy} r={9} fill={NAVY} stroke="#fff" strokeWidth={3} />}
            </g>
          );
        })}
      </svg>
      <div style={{ position: "absolute", top: 50, width: "100%", textAlign: "center" }}>
        <Kinetic text={labels.title || "The Platform"} start={fps * 0.3} size={104} font={SERIF} weight={600} step={6} />
      </div>
      <div style={{ position: "absolute", bottom: 40, width: "100%", textAlign: "center", padding: "0 160px", boxSizing: "border-box" }}>
        <Kinetic text={labels.caption || ""} start={fps * 1.2} size={46} weight={700} color={BLUE} step={3} />
      </div>
    </Stage>
  );
};

// ---------------------------------------------------------------- port
// Sea with moving waves, a container ship sailing in, a crane lifting a
// container onto a truck, ore trucks driving past; a producer and an end
// buyer above, unsure of each other, and a deal that cracks.
const Truck: React.FC<{ ore?: boolean; box?: boolean }> = ({ ore, box }) => (
  <svg width="260" height="110" viewBox="0 0 260 110">
    {ore && <path d="M70 40 Q110 4 150 22 Q190 6 230 40 Z" fill="#8A6F4D" />}
    {box && <rect x="70" y="6" width="160" height="48" rx="3" fill={GREEN} />}
    <rect x="66" y="38" width="170" height="30" rx="4" fill={BLUE} />
    <path d="M4 68 V36 Q4 26 14 26 H50 L62 44 V68 Z" fill={GOLD} /><rect x="14" y="32" width="26" height="14" rx="2" fill="#D6E9F8" />
    {[40, 140, 205].map((x) => <g key={x}><circle cx={x} cy="84" r="16" fill={NAVY} /><circle cx={x} cy="84" r="6" fill="#B7C6D3" /></g>)}
  </svg>
);
const CShip: React.FC = () => (
  <svg width="620" height="200" viewBox="0 0 620 200">
    <path d="M10 110 H600 L560 190 H60 Z" fill={NAVY} /><rect x="10" y="104" width="590" height="10" fill={RED} />
    <rect x="470" y="36" width="80" height="70" rx="4" fill="#FFFFFF" /><rect x="482" y="48" width="56" height="12" fill="#9EC1DD" />
    {[0, 1, 2, 3, 4, 5].map((c) => [0, 1].map((r) => (
      <rect key={`${c}-${r}`} x={70 + c * 64} y={60 + r * 24} width="60" height="22" fill={[GREEN, GOLD, "#6FA3C8", RED][(c + r) % 4]} stroke="#fff" strokeWidth="1.5" />
    )))}
  </svg>
);

const PortScene: React.FC<{ labels: Labels; seconds: number }> = ({ labels, seconds }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const end = seconds * fps;
  const shipX = interpolate(frame, [0, fps * 2.6], [-700, 120], { ...clamp, easing: Easing.out(Easing.cubic) });
  const bob = 6 * Math.sin(frame / 9);
  // crane cycle: trolley moves over the ship, the hook lowers, lifts a box,
  // carries it over the truck, lowers it.
  const cyc = fps * 3.2, f = Math.max(0, frame - fps * 2.4) % cyc, u = f / cyc;
  const trolley = u < 0.25 ? 520 : u < 0.5 ? interpolate(u, [0.25, 0.5], [520, 1080]) : u < 0.75 ? 1080 : interpolate(u, [0.75, 1], [1080, 520]);
  const hook = u < 0.12 ? interpolate(u, [0, 0.12], [80, 250]) : u < 0.25 ? interpolate(u, [0.12, 0.25], [250, 80]) : u < 0.5 ? 80 : u < 0.62 ? interpolate(u, [0.5, 0.62], [80, 250]) : u < 0.75 ? interpolate(u, [0.62, 0.75], [250, 80]) : 80;
  const carrying = (u >= 0.12 && u < 0.62) && frame > fps * 2.4;
  // trucks stay on the quay road (x 980-1920), entering and leaving at its ends
  const truck1 = 980 + ((frame * 6) % 1200) - 260;
  const truck2 = 980 + ((frame * 4.5 + 600) % 1200) - 260;
  const crackAt = end * 0.62;
  const crack = interpolate(frame, [crackAt, crackAt + fps * 0.5], [0, 40], { ...clamp, easing: Easing.out(Easing.back(2)) });
  const shake = frame > crackAt && frame < crackAt + fps * 0.5 ? 9 * Math.sin(frame * 2.3) : 0;
  const waves = (k: number) => {
    let d = `M0 ${760 + k * 30}`;
    for (let x = 0; x <= 1920; x += 40) d += ` L${x} ${760 + k * 30 + 9 * Math.sin((x + frame * (4 + k * 2)) / 70)}`;
    return d + " L1920 1080 L0 1080 Z";
  };
  return (
    <Stage seconds={seconds} seed={2}>
      {/* sea */}
      {[0, 1, 2].map((k) => <svg key={k} width="1920" height="1080" style={{ position: "absolute" }}><path d={waves(k)} fill={["#9CC6E6", "#7DB2DB", "#5E9CCB"][k]} opacity={0.9} /></svg>)}
      {/* quay and road on the right */}
      <div style={{ position: "absolute", left: 980, top: 700, width: 940, height: 380, background: "#C9D6E2" }} />
      <div style={{ position: "absolute", left: 980, top: 880, width: 940, height: 90, background: "#7F93A6" }} />
      {/* ship */}
      <div style={{ position: "absolute", left: shipX, top: 600 + bob }}><CShip /></div>
      {/* crane */}
      <svg width="1920" height="1080" style={{ position: "absolute" }}>
        <rect x="1000" y="400" width="22" height="320" fill={GOLD} /><rect x="1140" y="400" width="22" height="320" fill={GOLD} />
        <rect x="440" y="390" width="760" height="22" fill={GOLD} />
        <rect x={trolley - 30} y="412" width="60" height="18" fill={NAVY} />
        <line x1={trolley} y1="430" x2={trolley} y2={430 + hook * 0.75} stroke={NAVY} strokeWidth="4" />
        {carrying && <rect x={trolley - 32} y={430 + hook * 0.75} width="64" height="24" fill={GREEN} stroke="#fff" strokeWidth="2" />}
      </svg>
      {/* trucks */}
      <div style={{ position: "absolute", left: truck1, top: 830 }}><Truck ore /></div>
      <div style={{ position: "absolute", left: truck2, top: 830 }}><Truck box /></div>
      {/* producer and end buyer */}
      <Person x={360} y={260} label={labels.producer} bob={6 * Math.sin(frame / 10)} />
      <Person x={1560} y={260} label={labels.buyer} bob={6 * Math.sin(frame / 10 + 2)} />
      {[0, 1, 2].map((i) => {
        const o = interpolate(frame, [fps * (0.4 + i * 0.3), fps * (0.8 + i * 0.3), crackAt - 6, crackAt], [0, 1, 1, 0], clamp);
        return <div key={i} style={{ position: "absolute", left: 820 + i * 110, top: 120 - 26 * Math.abs(Math.sin((frame + i * 9) / 7)), fontFamily: FONT, fontWeight: 800, fontSize: 96, color: i === 1 ? GOLD : BLUE, opacity: o }}>?</div>;
      })}
      <div style={{ position: "absolute", left: 810, top: 200, opacity: interpolate(frame, [crackAt - fps * 0.8, crackAt - fps * 0.4], [0, 1], clamp) }}>
        <Handshake split={crack} shake={shake} color={crack > 5 ? RED : BLUE} />
      </div>
      <div style={{ position: "absolute", width: "100%", top: 30, textAlign: "center" }}>
        <Kinetic text={labels.caption || ""} start={fps * 0.6} size={48} weight={800} step={3} />
      </div>
    </Stage>
  );
};

export const MyPlatformScene: React.FC<{ kind: string; labels: Labels; seconds: number; at?: number[] }> = ({ kind, labels, seconds, at = [0, 5, 10] }) => {
  if (kind === "globe") return <GlobeScene labels={labels} seconds={seconds} />;
  if (kind === "port") return <PortScene labels={labels} seconds={seconds} />;
  if (kind === "trust") return <TrustScene labels={labels} seconds={seconds} />;
  if (kind === "broker") return <BrokerScene labels={labels} seconds={seconds} />;
  if (kind === "benefits") return <BenefitsScene labels={labels} at={at} seconds={seconds} />;
  if (kind === "tagline") return <TaglineScene labels={labels} seconds={seconds} />;
  return <WorldScene labels={labels} seconds={seconds} />;
};
