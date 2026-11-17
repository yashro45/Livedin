/* LivedIn - HTTP hardening tests for server.js. Run: node tests/server.test.js */
const http = require('http');
const { assert, suite, test, summary } = require('./lib');
const server = require('../server.js');

function req(port, method, p) { return new Promise((res, rej) => { const r = http.request({ host: '127.0.0.1', port, method, path: p }, (m) => { let b = ''; m.on('data', (d) => (b += d)); m.on('end', () => res({ status: m.statusCode, headers: m.headers, body: b })); }); r.on('error', rej); r.end(); }); }

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port, results = [];
  const t = (name, fn) => results.push([name, fn]);
  suite('Server hardening');
  t('serves the landing page with security headers', async () => { const r = await req(port, 'GET', '/'); assert.strictEqual(r.status, 200); for (const h of ['content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy']) assert(r.headers[h], h); assert(/frame-ancestors 'none'/.test(r.headers['content-security-policy'])); assert.strictEqual(r.headers['x-content-type-options'], 'nosniff'); });
  t('blocks path traversal and encoded traversal', async () => { for (const p of ['/../server.js', '/%2e%2e/server.js', '/js/../../server.js', '/..%2fserver.js', '/js/%2e%2e/%2e%2e/etc/passwd']) { const r = await req(port, 'GET', p); assert.strictEqual(r.status, 404, p); } });
  t('does not expose source, tests, dotfiles or package files', async () => { for (const p of ['/server.js', '/package.json', '/tests/unit.js', '/README.md', '/.env', '/js/', '/css']) assert.strictEqual((await req(port, 'GET', p)).status, 404, p); });
  t('rejects non-GET methods', async () => { for (const m of ['POST', 'PUT', 'DELETE', 'PATCH']) assert.strictEqual((await req(port, m, '/')).status, 405, m); });
  t('serves the app assets with the right content types', async () => { assert(/javascript/.test((await req(port, 'GET', '/js/security.js')).headers['content-type'])); assert(/css/.test((await req(port, 'GET', '/css/base.css')).headers['content-type'])); assert.strictEqual((await req(port, 'GET', '/app.html')).status, 200); });
  t('handles malformed URLs without crashing', async () => { assert.strictEqual((await req(port, 'GET', '/%E0%A4%A')).status, 400); assert.strictEqual((await req(port, 'GET', '/')).status, 200); });
  for (const [name, fn] of results) { try { await fn(); test(name, () => {}); } catch (e) { test(name, () => { throw e; }); } }
  server.close(); summary('Server tests');
})();
