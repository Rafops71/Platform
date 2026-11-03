// Local check of the scene functions (no Remotion): renders a few times to PNG with Playwright. Run: node --experimental-strip-types test-frames.mjs OUTDIR
import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs'; import path from 'path';
import * as S from './scenes.test.mts';
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const ship = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'ship.svg')).toString('base64');
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const frames = [['d2', 's', 2, 0], ['d6', 's', 6, 0], ['d10', 's', 10.2, 0.8], ['d12', 's', 12.0, 1], ['d14', 's', 13.8, 1], ['d17', 's', 16.6, 1]];
for (const [name, kind, t, r] of frames) {
  const body = kind === 'g' ? S.globe(1300, 540, 400, 28 + 3.2 * t, t) + S.motes(t, '#5fa3d6') : S.seaDock(t, r, ship);
  await p.setContent(`<body style="margin:0;background:#f0f6fb;width:1920px;height:1080px;position:relative;overflow:hidden">${S.DEFS}${body}</body>`);
  await p.waitForTimeout(300); await p.screenshot({ path: path.join(out, name + '.png') }); console.log(name);
}
await b.close();
