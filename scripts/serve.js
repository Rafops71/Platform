// Static file server for the E2E suite and for local browsing.
//
// This exists so that nothing has to be started by hand before the tests run.
// Playwright's `webServer` block in playwright.config.js launches this, waits
// for it to answer, and shuts it down afterwards — so `npm run e2e` works on a
// machine with no terminal window already open, and the same command works
// unchanged in CI.
//
// Deliberately built on Node's own modules only. The project is developed on
// Windows, where `python -m http.server` is not reliably present, and an npm
// dependency for a forty-line file would be one more thing to install before
// the tests can run — which is the exact problem this file removes.
//
//   node scripts/serve.js            # serves the repo root on port 8000
//   PORT=9000 node scripts/serve.js  # or another port
//
// It serves the working tree as-is. It is not hardened for public exposure and
// is not meant to be: binding is to localhost only.

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = path.resolve(__dirname, '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

const server = http.createServer((req, res) => {
  // Only reads. A GET-only server cannot be talked into changing the tree.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end('Method Not Allowed');
  }

  const requested = decodeURIComponent(url.parse(req.url).pathname);
  const rel = requested === '/' ? '/index.html' : requested;
  const target = path.resolve(ROOT, '.' + rel);

  // Refuse anything that resolves outside the repo. `..` in a URL is the
  // classic way to read a file the server never meant to hand out — and in
  // this repo the file next door is .env.
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found: ' + rel);
    }

    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      // The suite reloads pages constantly and must never read a stale build.
      'Cache-Control': 'no-store',
    });

    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(target).pipe(res).on('error', () => res.destroy());
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Serving ${ROOT}\n  http://${HOST}:${PORT}/`);
});

// Playwright stops the server with a signal. Exit cleanly so it does not have
// to escalate to a kill, which on Windows can leave the port held.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
