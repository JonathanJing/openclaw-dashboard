#!/usr/bin/env node
'use strict';
/**
 * OpenClaw Dashboard — Modular Backend Server
 *
 * Thin HTTP shell: auth → CORS → route dispatch → provider.
 * All business logic lives in providers/.
 *
 * Start: node backend/server.js
 * Env:   DASHBOARD_PORT (default 18791), OPENCLAW_AUTH_TOKEN, etc.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const cfg    = require('./lib/config');
const helpers = require('./lib/http-helpers');

// ── Simple Router ───────────────────────────────────────────────────
class Router {
  constructor() {
    this._routes = new Map(); // "METHOD /path" → handler(req, res, query)
  }

  add(method, pattern, handler) {
    this._routes.set(`${method} ${pattern}`, handler);
  }

  resolve(method, pathname) {
    return this._routes.get(`${method} ${pathname}`) || null;
  }

  /** List all registered routes (for debug) */
  list() {
    return [...this._routes.keys()];
  }
}

const router = new Router();

// ── Register Providers ──────────────────────────────────────────────
// Each provider exports register(router) which adds its routes.
const providers = [
  require('./providers/ground-truth'),
  require('./providers/sessions'),
  require('./providers/ledger'),
  require('./providers/cron'),
  require('./providers/spark'),
  require('./providers/watchdog'),
  require('./providers/system'),
  require('./providers/config'),
  require('./providers/tasks'),
  require('./providers/ops-legacy'),  // proxy remaining routes to old api-server.js
];

const opsLegacy = require('./providers/ops-legacy');

for (const p of providers) {
  p.register(router);
}

console.log(`[server] registered ${router.list().length} routes from ${providers.length} providers`);

// ── Static files ────────────────────────────────────────────────────
const STATIC_ROOT = path.join(__dirname, '..');
const STATIC_FILES = {
  '/icon.svg':     { file: 'icon.svg',     type: 'image/svg+xml' },
  '/favicon.svg':  { file: 'favicon.svg',  type: 'image/svg+xml' },
  '/icon-180.png': { file: 'icon-180.png', type: 'image/png' },
  '/marked.min.js':  { file: 'marked.min.js',  type: 'application/javascript' },
  '/purify.min.js':  { file: 'purify.min.js',  type: 'application/javascript' },
};

const MIME_TYPES = {
  '.js':  'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.html': 'text/html',
};

function serveStatic(req, res, pathname) {
  // Known static files
  const entry = STATIC_FILES[pathname];
  if (entry) {
    const filePath = path.join(STATIC_ROOT, entry.file);
    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': entry.type, 'Cache-Control': 'public, max-age=86400' });
      res.end(content);
      return true;
    } catch { return false; }
  }

  // Serve frontend/ directory (CSS, JS modules)
  if (pathname.startsWith('/frontend/')) {
    const relPath = pathname.slice(1); // strip leading /
    const filePath = path.join(STATIC_ROOT, relPath);
    // Security: no traversal
    if (relPath.includes('..')) return false;
    const ext = path.extname(filePath);
    const mime = MIME_TYPES[ext];
    if (!mime) return false;
    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'public, max-age=300' });
      res.end(content);
      return true;
    } catch { return false; }
  }

  return false;
}

// ── Main HTML ───────────────────────────────────────────────────────
function serveDashboard(req, res) {
  // Try new modular frontend first, fall back to old monolith
  const newPath = path.join(STATIC_ROOT, 'frontend', 'index.html');
  const oldPath = path.join(STATIC_ROOT, 'agent-dashboard.html');
  const filePath = fs.existsSync(newPath) ? newPath : oldPath;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(content);
  } catch (e) {
    helpers.errorReply(res, 500, 'Dashboard HTML not found');
  }
}

// ── Health (no auth) ────────────────────────────────────────────────
router.add('GET', '/health', (_req, res) => {
  helpers.jsonReply(res, 200, {
    status: 'ok',
    uptime: process.uptime(),
    version: '2.0.0',
    providers: providers.length,
    routes: router.list().length,
  });
});

// ── Login (cookie-based auth) ───────────────────────────────────────
router.add('POST', '/login', async (req, res) => {
  try {
    const body = await helpers.readJsonBody(req);
    if (body.token === cfg.AUTH_TOKEN) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': `ds=${cfg.AUTH_TOKEN}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`,
      });
      res.end(JSON.stringify({ ok: true }));
    } else {
      helpers.errorReply(res, 401, 'Invalid token');
    }
  } catch {
    helpers.errorReply(res, 400, 'Bad request');
  }
});

router.add('GET', '/logout', (_req, res) => {
  res.writeHead(302, {
    'Set-Cookie': 'ds=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0',
    'Location': '/',
  });
  res.end();
});

// ── HTTP Server ─────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  const method = req.method.toUpperCase();

  // CORS preflight
  helpers.setCors(res, req);
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health: no auth
  if (pathname === '/health' && method === 'GET') {
    const handler = router.resolve('GET', '/health');
    return handler(req, res, parsed.query);
  }

  // Static files: no auth
  if (serveStatic(req, res, pathname)) return;

  // Login: no auth
  if (pathname === '/login') {
    const handler = router.resolve('POST', '/login');
    if (handler) return handler(req, res, parsed.query);
  }
  if (pathname === '/logout') {
    const handler = router.resolve('GET', '/logout');
    if (handler) return handler(req, res, parsed.query);
  }

  // Auth check
  if (!helpers.authenticate(req)) {
    // Serve login page or 401
    if (pathname === '/' && method === 'GET') {
      return serveDashboard(req, res);
    }
    return helpers.errorReply(res, 401, 'Unauthorized');
  }

  // Dashboard HTML
  if (pathname === '/' && method === 'GET') {
    return serveDashboard(req, res);
  }

  // Route to provider
  try {
    const handler = router.resolve(method, pathname);
    if (handler) {
      return handler(req, res, parsed.query || {});
    }

    // Legacy fallback: proxy to old api-server.js for unmigrated routes
    // (tasks CRUD with dynamic IDs, cron/:id/runs, etc.)
    return opsLegacy.proxyToOld(req, res);
  } catch (e) {
    console.error('Unhandled error:', e);
    helpers.errorReply(res, 500, 'Internal server error');
  }
});

server.on('error', (e) => {
  console.error('Server error:', e);
  process.exit(1);
});

server.listen(cfg.PORT, cfg.HOST, () => {
  console.log(`[server] Dashboard v2 listening on ${cfg.HOST}:${cfg.PORT}`);
  console.log(`[server] Routes: ${router.list().length} | Providers: ${providers.length}`);
});
