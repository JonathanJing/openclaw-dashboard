'use strict';
/**
 * Shared HTTP helpers: JSON replies, CORS, auth, body parsing.
 */
const url = require('url');
const cfg = require('./config');

// ── JSON reply ──────────────────────────────────────────────────────
function jsonReply(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

function errorReply(res, status, message) {
  jsonReply(res, status, { error: message });
}

// ── CORS ────────────────────────────────────────────────────────────
const CORS_ALLOWED_ORIGINS = (process.env.DASHBOARD_CORS_ORIGINS || '')
  .split(',').filter(Boolean);

function getCorsOrigin(req) {
  const origin = req.headers['origin'] || '';
  if (CORS_ALLOWED_ORIGINS.length === 0) {
    if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/.test(origin)) return origin;
    return '';
  }
  if (CORS_ALLOWED_ORIGINS.includes('*')) return '*';
  if (CORS_ALLOWED_ORIGINS.includes(origin)) return origin;
  return '';
}

function setCors(res, req) {
  const allowed = req ? getCorsOrigin(req) : '';
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', allowed);
    if (allowed !== '*') res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ── Auth ─────────────────────────────────────────────────────────────
function parseCookies(req) {
  const raw = req.headers['cookie'] || '';
  return Object.fromEntries(
    raw.split(';').map(c => c.trim().split('=').map(s => decodeURIComponent(s.trim())))
  );
}

function authenticate(req) {
  if (!cfg.AUTH_TOKEN) return true; // no token = open
  const parsed = url.parse(req.url, true);
  if (parsed.query.token === cfg.AUTH_TOKEN) return true;
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ') && authHeader.slice(7).trim() === cfg.AUTH_TOKEN) return true;
  const cookies = parseCookies(req);
  if (cookies['ds'] === cfg.AUTH_TOKEN) return true;
  return false;
}

function isLoopbackRequest(req) {
  const ip = req?.socket?.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function requireMutatingOps(req, res, opName) {
  if (!cfg.ENABLE_MUTATING_OPS) {
    errorReply(res, 403, `${opName} disabled. Set OPENCLAW_ENABLE_MUTATING_OPS=1 to enable.`);
    return false;
  }
  if (!isLoopbackRequest(req)) {
    errorReply(res, 403, `${opName} allowed only from localhost.`);
    return false;
  }
  return true;
}

// ── Body parsing ─────────────────────────────────────────────────────
function readBody(req, maxSize) {
  const limit = maxSize || cfg.MAX_BODY;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { reject(new Error('Request body too large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function readJsonBody(req) {
  return readBody(req).then((buf) => {
    const text = buf.toString('utf8');
    if (!text.trim()) return {};
    try { return JSON.parse(text); }
    catch { throw new Error('Invalid JSON body'); }
  });
}

// ── Formatters ───────────────────────────────────────────────────────
function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function bytesHuman(bytes) {
  const b = Number(bytes || 0);
  if (b < 1024) return `${b.toFixed(0)} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// ── Sanitization ─────────────────────────────────────────────────────
function sanitizeUntrustedText(value, maxLen = cfg.MAX_UNTRUSTED_PROMPT_FIELD) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[`$\\]/g, '_')
    .slice(0, maxLen)
    .trim();
}

function sanitizeFilename(name) {
  return String(name || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
}

module.exports = {
  jsonReply, errorReply,
  getCorsOrigin, setCors,
  authenticate, isLoopbackRequest, requireMutatingOps, parseCookies,
  readBody, readJsonBody,
  formatDuration, bytesHuman,
  sanitizeUntrustedText, sanitizeFilename,
};
