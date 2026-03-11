/**
 * spark-tasks.js — Dashboard backend provider
 * Proxies requests to Local API Hub /spark/* endpoints.
 * Routes:
 *   GET /api/spark-tasks/summary    → today's task summary
 *   GET /api/spark-tasks/list       → recent task list (query: ?type=&status=&limit=)
 *   GET /api/spark-tasks/gpu        → GPU timeline (query: ?hours=24)
 */

const http = require('http');

const HUB_HOST = '127.0.0.1';
const HUB_PORT = 3456;

function hubGet(path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: HUB_HOST, port: HUB_PORT, path, timeout: 8000 }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('Invalid JSON from hub')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Hub timeout')); });
  });
}

async function getSummary() {
  try {
    return await hubGet('/spark/tasks/summary');
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function getTaskList(type, status, limit = 20) {
  const qs = new URLSearchParams();
  if (type)   qs.set('type', type);
  if (status) qs.set('status', status);
  qs.set('limit', limit);
  try {
    return await hubGet(`/spark/tasks?${qs}`);
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function getGpuTimeline(hours = 24) {
  try {
    return await hubGet(`/spark/gpu/timeline?hours=${hours}`);
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function register(router) {
  const { jsonReply } = require('../lib/http-helpers');

  router.add('GET', '/api/spark-tasks/summary', async (req, res) => {
    const data = await getSummary();
    jsonReply(res, 200, data);
  });

  router.add('GET', '/api/spark-tasks/list', async (req, res, q) => {
    const type   = q?.type   || '';
    const status = q?.status || '';
    const limit  = parseInt(q?.limit || '20', 10);
    const data   = await getTaskList(type || undefined, status || undefined, limit);
    jsonReply(res, 200, data);
  });

  router.add('GET', '/api/spark-tasks/gpu', async (req, res, q) => {
    const hours = parseInt(q?.hours || '24', 10);
    const data  = await getGpuTimeline(hours);
    jsonReply(res, 200, data);
  });
}

module.exports = { register };
