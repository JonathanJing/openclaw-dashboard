'use strict';
/**
 * Ops Legacy Provider — bridges remaining handlers from old api-server.js
 * that haven't been fully refactored yet.
 *
 * Each handler here is a thin wrapper that delegates to the old functions.
 * They will be migrated into dedicated providers incrementally.
 *
 * Handlers covered:
 * - /ops/sessions (detailed session view)
 * - /ops/channels (today channel breakdown via JSONL scan)
 * - /ops/alltime (historical via JSONL scan)
 * - /ops/cron-costs (cron cost analysis)
 * - /ops/cron (enhanced cron list)
 * - /ops/audit, /ops/secaudit
 * - /ops/dgx-status (DGX probe via HTTP)
 * - /ops/models (dynamic model registry)
 * - /ops/session-model, /ops/cron-model (model overrides)
 * - /ops/update-openclaw, /ops/restart
 * - /agents (agent monitor)
 * - /cron (CRUD)
 * - /backup, /memory, /metrics
 * - /vision/stats
 * - /tasks/:id/*, /tasks/spawn-batch
 */

const url = require('url');

// We load the old api-server.js module-style by extracting its handler functions.
// Since the old file is a monolith that starts its own server, we can't require() it directly.
// Instead, we'll register the routes in server.js using a "catch-all" that forwards
// unmatched routes to the old server on its original port.
//
// This is the cleanest approach: the old server keeps running, the new server proxies
// anything it doesn't handle yet.

const http = require('http');
const cfg = require('../lib/config');
const { jsonReply, errorReply } = require('../lib/http-helpers');

const OLD_SERVER_PORT = 18791; // the current running old api-server.js

function proxyToOld(req, res) {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // Forward the request to the old server
  const proxyReq = http.request({
    hostname: '127.0.0.1',
    port: OLD_SERVER_PORT,
    path: req.url, // includes query string
    method: req.method,
    headers: {
      ...req.headers,
      // Ensure auth passes through
      'authorization': req.headers['authorization'] || `Bearer ${cfg.AUTH_TOKEN}`,
    },
    timeout: 30000,
  }, (proxyRes) => {
    // Forward response headers
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (e) => {
    errorReply(res, 502, `Legacy backend unavailable: ${e.message}`);
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    errorReply(res, 504, 'Legacy backend timeout');
  });

  // Forward request body
  req.pipe(proxyReq);
}

// Routes that still need the old server
const LEGACY_ROUTES = [
  // Ops views
  '/ops/sessions',
  '/ops/channels',
  '/ops/alltime',
  '/ops/cron-costs',
  '/ops/audit',
  '/ops/secaudit',
  '/ops/dgx-status',
  '/ops/models',
  '/ops/session-model',
  '/ops/cron-model',
  '/ops/update-openclaw',
  '/ops/restart',
  '/ops/config',
  // Agent monitor
  '/agents',
  // Cron CRUD (old)
  '/cron',
  '/cron/status',
  // Others
  '/backup',
  '/backup/load',
  '/memory',
  '/metrics',
  '/vision/stats',
];

function register(router) {
  // Register exact legacy routes
  for (const route of LEGACY_ROUTES) {
    // Register for all methods since the old server handles method dispatch
    for (const method of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']) {
      router.add(method, route, (req, res) => proxyToOld(req, res));
    }
  }

  // Task routes need path-based matching (dynamic segments)
  // These are handled by the catch-all in server.js
}

// Export the proxy function for the catch-all
module.exports = { register, proxyToOld, LEGACY_ROUTES };
