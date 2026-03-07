'use strict';
/**
 * Config Provider — read-only view of openclaw.json + workspace files.
 * No mutation: config is viewable, not editable from dashboard.
 */
const fs = require('fs');
const path = require('path');
const cfg = require('../lib/config');
const { jsonReply, errorReply } = require('../lib/http-helpers');

function readOpenClawConfig() {
  try {
    const raw = fs.readFileSync(cfg.OPENCLAW_CONFIG_FILE, 'utf8');
    const config = JSON.parse(raw);
    // Redact sensitive fields
    const redacted = JSON.parse(JSON.stringify(config));
    redactSecrets(redacted);
    return redacted;
  } catch {
    return null;
  }
}

function redactSecrets(obj) {
  if (!obj || typeof obj !== 'object') return;
  const sensitiveKeys = ['apiKey', 'token', 'secret', 'password', 'webhook', 'auth'];
  for (const key of Object.keys(obj)) {
    if (sensitiveKeys.some(s => key.toLowerCase().includes(s)) && typeof obj[key] === 'string') {
      obj[key] = obj[key].slice(0, 4) + '***';
    }
    if (typeof obj[key] === 'object') redactSecrets(obj[key]);
  }
}

// ── Workspace file browser (read-only) ──────────────────────────────
function isAllowedPath(p) {
  if (!p || typeof p !== 'string') return false;
  const normalized = path.normalize(p);
  if (normalized.includes('..')) return false;
  if (path.isAbsolute(normalized)) return false;
  const parts = normalized.split(path.sep);
  // Root *.md files
  if (parts.length === 1 && normalized.endsWith('.md')) return true;
  // memory/*.md
  if (parts.length === 2 && parts[0] === 'memory' && parts[1].endsWith('.md')) return true;
  // channels/*.md
  if (parts.length === 2 && parts[0] === 'channels' && parts[1].endsWith('.md')) return true;
  // refs/*.md
  if (parts.length === 2 && parts[0] === 'refs' && parts[1].endsWith('.md')) return true;
  return false;
}

function handleConfig(_req, res) {
  if (!cfg.ENABLE_CONFIG_ENDPOINT) {
    return errorReply(res, 403, 'Config endpoint disabled');
  }
  const config = readOpenClawConfig();
  jsonReply(res, 200, { config });
}

function handleFiles(req, res, query) {
  const filePath = query.path || '';
  const isList = query.list === 'true';

  // Directory listing mode
  if (isList && filePath) {
    const cleanDir = filePath.replace(/^\/|\/$/g, '').split('/')[0];
    const allowedDirs = ['memory', 'channels', 'refs'];
    if (!allowedDirs.includes(cleanDir)) return errorReply(res, 403, 'Directory not allowed');
    const dirPath = path.join(cfg.WORKSPACE, cleanDir);
    try {
      const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md')).map(f => `${cleanDir}/${f}`);
      return jsonReply(res, 200, { files });
    } catch { return jsonReply(res, 200, { files: [] }); }
  }

  if (!filePath) {
    // List workspace .md files
    const files = [];
    const ws = cfg.WORKSPACE;
    try {
      for (const f of fs.readdirSync(ws)) {
        if (f.endsWith('.md')) files.push(f);
      }
      for (const dir of ['memory', 'channels', 'refs']) {
        const d = path.join(ws, dir);
        try {
          for (const f of fs.readdirSync(d)) {
            if (f.endsWith('.md')) files.push(`${dir}/${f}`);
          }
        } catch {}
      }
    } catch {}
    return jsonReply(res, 200, { files });
  }

  if (!isAllowedPath(filePath)) {
    return errorReply(res, 403, 'Path not allowed');
  }
  const fullPath = path.join(cfg.WORKSPACE, filePath);
  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    jsonReply(res, 200, { path: filePath, content });
  } catch {
    errorReply(res, 404, 'File not found');
  }
}

function handleSkills(_req, res) {
  try {
    const skills = fs.readdirSync(cfg.SKILLS_DIR)
      .filter(d => {
        try { return fs.statSync(path.join(cfg.SKILLS_DIR, d)).isDirectory(); }
        catch { return false; }
      })
      .map(name => {
        const metaPath = path.join(cfg.SKILLS_DIR, name, '_meta.json');
        let meta = {};
        try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch {}
        return { name, ...meta };
      });
    jsonReply(res, 200, { count: skills.length, skills });
  } catch {
    jsonReply(res, 200, { count: 0, skills: [] });
  }
}

function register(router) {
  router.add('GET', '/api/config',  (req, res) => handleConfig(req, res));
  router.add('GET', '/api/files',   (req, res, q) => handleFiles(req, res, q));
  router.add('GET', '/api/skills',  (req, res) => handleSkills(req, res));

  // Legacy compat (frontend still calls these)
  router.add('GET', '/ops/config',  (req, res) => handleConfig(req, res));
  router.add('GET', '/files',       (req, res, q) => handleFiles(req, res, q));
  router.add('GET', '/skills',      (req, res) => handleSkills(req, res));
  router.add('GET', '/notes',       (_req, res) => jsonReply(res, 200, []));
}

module.exports = { register };
