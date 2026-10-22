// Stub of the calculator service's HTTP surface, used only to verify the edge
// (OPS-EDGE-01) before the real service exists on the same branch. Node stdlib.
// It mimics what the edge relies on: the service's own security headers, the
// X-Request-ID echo, problem responses with `instance`, the 4096-byte body
// limit, the probes (readiness reports draining when READY=0) and a few
// failure modes (/api/v1/status/<code>, /api/v1/slow).
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

const valid = /^[A-Za-z0-9._-]{1,128}$/;
const port = Number(process.env.PORT ?? '8081');

function send(req, res, status, type, body, extra = {}) {
  const raw = req.headers['x-request-id'];
  const id = typeof raw === 'string' && valid.test(raw) ? raw : randomBytes(16).toString('hex');
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Request-ID': id,
    ...extra,
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(typeof body === 'function' ? body(id) : body));
}

function problem(req, res, status, code, title, detail, extra) {
  send(req, res, status, 'application/problem+json', (id) => ({
    type: `urn:calculator:problem:${code.toLowerCase().replaceAll('_', '-')}`,
    title, status, detail, instance: new URL(req.url, 'http://stub').pathname, code, requestId: id,
  }), extra);
}

createServer((req, res) => {
  let bytes = 0;
  req.on('data', (chunk) => { bytes += chunk.length; });
  req.on('end', () => {
    const url = new URL(req.url, 'http://stub');
    const seen = {
      path: req.url, method: req.method, bodyBytes: bytes,
      requestIdHeaders: req.rawHeaders.filter((_, i) => i % 2 === 0 && req.rawHeaders[i].toLowerCase() === 'x-request-id').length,
      requestId: req.headers['x-request-id'] ?? null,
    };
    if (url.pathname === '/healthz') return send(req, res, 200, 'application/json', { status: 'ok', version: 'stub', commit: 'stub' });
    if (url.pathname === '/readyz') {
      return process.env.READY === '0'
        ? send(req, res, 503, 'application/json', { status: 'draining', version: 'stub', commit: 'stub' })
        : send(req, res, 200, 'application/json', { status: 'ready', version: 'stub', commit: 'stub' });
    }
    if (url.pathname === '/metrics' || url.pathname.startsWith('/debug/')) return send(req, res, 200, 'text/plain', 'stub admin surface\n');
    if (url.pathname === '/api/v1/slow') return setTimeout(() => send(req, res, 200, 'application/json', seen), 11000);
    const status = /^\/api\/v1\/status\/([0-9]{3})$/.exec(url.pathname);
    if (status) {
      const code = Number(status[1]);
      if (code === 405) return problem(req, res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed', 'GET is not allowed; use POST', { Allow: 'POST' });
      if (code === 502 || code === 504) return send(req, res, code, 'text/html', '<html>upstream gateway error</html>');
      if (code === 503) return problem(req, res, 503, 'INTERNAL_ERROR', 'Service unavailable', 'stub 503');
      return problem(req, res, code, 'INTERNAL_ERROR', 'Stub status', `stub ${code}`);
    }
    if (req.method === 'POST' && bytes > 4096) {
      return problem(req, res, 413, 'PAYLOAD_TOO_LARGE', 'Payload too large', 'request body must not exceed 4096 bytes');
    }
    if (url.pathname.startsWith('/api/')) return send(req, res, 200, 'application/json', seen);
    return problem(req, res, 404, 'NOT_FOUND', 'Not found', 'no route matches the request method and path');
  });
}).listen(port, () => console.log(`stub upstream on :${port}`));
