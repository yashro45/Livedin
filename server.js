#!/usr/bin/env node
/*
 * LivedIn - tiny static server with security headers (no dependencies).
 *   node server.js            -> http://localhost:8080
 * The app also works by simply opening index.html, but this server adds the response headers
 * (frame-ancestors, nosniff, permissions policy) that a <meta> CSP cannot provide.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = __dirname, PORT = Number(process.env.PORT) || 8080;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const PUBLIC = /^\/(?:index\.html|login\.html|app\.html|css\/[\w.-]+\.css|js\/[\w.-]+\.js|assets\/[\w.-]+\.(?:svg|png|ico))$/;
const CSP = "default-src 'self'; script-src 'self' https://unpkg.com; style-src 'self' https://fonts.googleapis.com https://unpkg.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://tile.openstreetmap.org https://unpkg.com; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const HEADERS = {
  'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'geolocation=(self), microphone=(self), camera=(), payment=()', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cache-Control': 'no-cache',
};

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD', ...HEADERS }); return res.end(); }
  let p; try { p = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400, HEADERS); return res.end('Bad request'); }
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!PUBLIC.test(p) || !file.startsWith(ROOT + path.sep) || !fs.existsSync(file)) { res.writeHead(404, { 'Content-Type': 'text/plain', ...HEADERS }); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', ...HEADERS });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
});
if (require.main === module) server.listen(PORT, '127.0.0.1', () => process.stdout.write('LivedIn running at http://localhost:' + PORT + '\n'));
module.exports = server;
