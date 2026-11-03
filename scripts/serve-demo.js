#!/usr/bin/env node
'use strict';
// Static server for dist-demo/, for the demo browser test (playwright.demo.config.js).
// Same job as scripts/serve.js, which serves the repository root for the real
// site's tests. Localhost only, Node's own modules only.
//
//   node scripts/serve-demo.js          # http://127.0.0.1:8100
//   PORT=9000 node scripts/serve-demo.js

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8100);
const HOST = '127.0.0.1';
const ROOT = path.resolve(__dirname, '..', 'dist-demo');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error('dist-demo/ is missing. Run `npm run build:demo` first.');
  process.exit(1);
}

http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, HOST, () => {
  console.log(`Demo served at http://${HOST}:${PORT}/ from dist-demo/`);
});
