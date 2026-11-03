// Local check of the scene functions (no Remotion): renders a few times to PNG with Playwright. Run: node --experimental-strip-types test-frames.mjs OUTDIR
import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs'; import path from 'path';
import * as S from './scenes.test.mts';
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const ship = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'ship.svg')).toString('base64');
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const frames = [['a1-0', 'g', 0.5], ['a1-6', 'g', 6], ['a2-1', 's', 1, 0], ['a2-4', 's', 4, .5], ['a2-6', 's', 6, 1]];
for (const [name, kind, t, r] of frames) {
  const body = kind === 'g' ? S.globe(1300, 540, 400, 28 + 3.2 * t, t) + S.motes(t, '#5fa3d6') : S.seaDay(t, r, ship);
  await p.setContent(`<body style="margin:0;background:#f0f6fb;width:1920px;height:1080px;position:relative;overflow:hidden">${S.DEFS}${body}</body>`);
  await p.waitForTimeout(300); await p.screenshot({ path: path.join(out, name + '.png') }); console.log(name);
}
await b.close();
