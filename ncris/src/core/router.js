/**
 * NCRIS · HTTP Router
 * ────────────────────────────────────────────────────────────────────
 * Minimal Express-shaped router for zero-dependency operation.
 *
 * The route registration API is deliberately Express-compatible:
 *
 *   router.get('/foo/:id', handler)
 *   router.post('/foo', handler)
 *
 * In production (Phase 2) this file is replaced by Express or Fastify;
 * the routes registered in src/index.js do not change.
 *
 * Path patterns support:
 *   /static/path
 *   /resource/:id
 *   /resource/:id/sub/:subId
 *
 * Handlers receive (req, res) where:
 *   req.params  — route parameters
 *   req.query   — parsed query string
 *   req.body    — parsed JSON body (set by middleware)
 *   req.headers — raw headers
 *   req.user    — set by auth middleware if authenticated
 *   res.json(obj, status?)  — send JSON response
 *   res.status(code).json(obj) — chained
 *   res.error(status, code, message, details?) — RFC 7807-style error
 */

import { URL } from 'url';

class Response {
  constructor(rawRes) {
    this._raw = rawRes;
    this._status = 200;
    this._headers = { 'Content-Type': 'application/json; charset=utf-8' };
    this._sent = false;
  }
  status(code) { this._status = code; return this; }
  header(name, value) { this._headers[name] = value; return this; }
  json(obj) {
    if (this._sent) return;
    this._sent = true;
    const body = JSON.stringify(obj);
    this._headers['Content-Length'] = Buffer.byteLength(body);
    this._raw.writeHead(this._status, this._headers);
    this._raw.end(body);
  }
  error(status, code, message, details) {
    this._status = status;
    this.json({
      error: { code, message, ...(details ? { details } : {}) },
      timestamp: new Date().toISOString(),
    });
  }
  text(str, status = 200) {
    if (this._sent) return;
    this._sent = true;
    this._headers['Content-Type'] = 'text/plain; charset=utf-8';
    this._raw.writeHead(status, this._headers);
    this._raw.end(str);
  }
  raw(body, contentType, status = 200) {
    if (this._sent) return;
    this._sent = true;
    this._headers['Content-Type'] = contentType;
    this._raw.writeHead(status, this._headers);
    this._raw.end(body);
  }
}

function pathToPattern(path) {
  const params = [];
  const regex = path.replace(/:(\w+)/g, (_, name) => {
    params.push(name);
    return '([^/]+)';
  });
  return { regex: new RegExp(`^${regex}$`), params };
}

export class Router {
  constructor() {
    this.routes = [];
    this.middlewares = [];
  }

  use(mw) {
    this.middlewares.push(mw);
  }

  add(method, path, ...handlers) {
    const { regex, params } = pathToPattern(path);
    this.routes.push({ method: method.toUpperCase(), path, regex, params, handlers });
  }

  get(p, ...h)    { this.add('GET',    p, ...h); }
  post(p, ...h)   { this.add('POST',   p, ...h); }
  put(p, ...h)    { this.add('PUT',    p, ...h); }
  patch(p, ...h)  { this.add('PATCH',  p, ...h); }
  delete(p, ...h) { this.add('DELETE', p, ...h); }

  match(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const m = route.regex.exec(pathname);
      if (m) {
        const params = {};
        route.params.forEach((name, i) => { params[name] = decodeURIComponent(m[i + 1]); });
        return { route, params };
      }
    }
    return null;
  }

  async handle(req, res) {
    try {
      // Run middlewares first
      for (const mw of this.middlewares) {
        await new Promise((resolve, reject) => {
          let nextCalled = false;
          const next = (err) => {
            if (nextCalled) return;
            nextCalled = true;
            err ? reject(err) : resolve();
          };
          try { mw(req, res, next); } catch (e) { reject(e); }
          if (res._sent) resolve();
        });
        if (res._sent) return;
      }

      const url = new URL(req.url, 'http://localhost');
      const matched = this.match(req.method, url.pathname);

      if (!matched) {
        return res.error(404, 'NOT_FOUND', `Route not found: ${req.method} ${url.pathname}`);
      }

      req.params = matched.params;
      req.query = Object.fromEntries(url.searchParams.entries());

      // Chain handlers
      for (const handler of matched.route.handlers) {
        if (res._sent) break;
        await new Promise((resolve, reject) => {
          let nextCalled = false;
          const next = (err) => {
            if (nextCalled) return;
            nextCalled = true;
            err ? reject(err) : resolve();
          };
          try {
            const r = handler(req, res, next);
            if (r && typeof r.then === 'function') {
              r.then(() => resolve(), reject);
            } else if (res._sent || handler.length < 3) {
              resolve();
            }
          } catch (e) { reject(e); }
        });
      }
    } catch (err) {
      if (!res._sent) {
        res.error(err.status || 500, err.code || 'INTERNAL_ERROR', err.message || 'Internal server error',
          process.env.NCRIS_DEBUG ? { stack: err.stack } : undefined);
      }
    }
  }
}

export { Response };

/**
 * Body-parsing middleware for JSON requests.
 * Limits body to 1MB by default (configurable per deployment).
 */
export function bodyParser({ limit = 1024 * 1024 } = {}) {
  return (req, res, next) => {
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();
    const ct = req.headers['content-type'] || '';
    if (!ct.includes('application/json')) {
      req.body = {};
      return next();
    }
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        res.error(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds size limit');
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (res._sent) return;
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) { req.body = {}; return next(); }
      try {
        req.body = JSON.parse(raw);
        next();
      } catch (err) {
        res.error(400, 'BAD_JSON', `Invalid JSON: ${err.message}`);
      }
    });
    req.on('error', (err) => {
      if (!res._sent) res.error(400, 'STREAM_ERROR', err.message);
    });
  };
}

/**
 * Wrap a raw Node res into our Response helper.
 */
export function wrapResponse(rawRes) {
  return new Response(rawRes);
}
