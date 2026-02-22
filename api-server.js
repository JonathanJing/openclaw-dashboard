#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

// --- Config ---
const PORT = parseInt(process.env.DASHBOARD_PORT || '18791', 10);
const AUTH_TOKEN = process.env.OPENCLAW_AUTH_TOKEN || '';
const WORKSPACE = process.env.OPENCLAW_WORKSPACE || '/Users/jonyopenclaw/.openclaw/workspace';
const TASKS_FILE = path.join(__dirname, 'tasks.json');
const SKILLS_DIR = path.join(WORKSPACE, 'skills');
const MEMORY_DIR = path.join(WORKSPACE, 'memory');
const SESSIONS_FILE = process.env.OPENCLAW_SESSIONS_FILE || path.join(process.env.HOME || '', '.openclaw', 'agents', 'main', 'sessions', 'sessions.json');
const SUBAGENT_RUNS_FILE = process.env.OPENCLAW_SUBAGENT_RUNS || path.join(process.env.HOME || '', '.openclaw', 'subagents', 'runs.json');
const MAX_BODY = 1 * 1024 * 1024; // 1 MB
const MAX_UPLOAD = 20 * 1024 * 1024; // 20 MB for file uploads
const ATTACHMENTS_DIR = path.join(__dirname, 'attachments');

// Vision ingestion (Notion)
const NOTION_API_KEY = process.env.NOTION_API_KEY || '';
const VISION_DB = {
  NETWORKING: process.env.VISION_DB_NETWORKING || '',
  WINE: process.env.VISION_DB_WINE || '',
  CIGAR: process.env.VISION_DB_CIGAR || '',
  TEA: process.env.VISION_DB_TEA || '',
};

// --- Cron Config ---
const CRON_STORE_PATH = path.join(process.env.HOME || '', '.openclaw', 'cron', 'jobs.json');
const CRON_RUNS_DIR = path.join(process.env.HOME || '', '.openclaw', 'cron', 'runs');
const GATEWAY_HOOKS_URL = 'http://127.0.0.1:18789/hooks';
const SESSIONS_JSON = path.join(process.env.HOME || '', '.openclaw', 'agents', 'main', 'sessions', 'sessions.json');
// Load keys from keys.env if not in env
function loadKeysEnv() {
  try {
    const keysFile = path.join(process.env.HOME || '', '.openclaw', 'keys.env');
    const content = fs.readFileSync(keysFile, 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.+)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadKeysEnv();
const OPENAI_ADMIN_KEY = process.env.OPENAI_ADMIN_KEY || '';
const ANTHROPIC_ADMIN_KEY = process.env.ANTHROPIC_ADMIN_KEY || '';

// --- Webhook: trigger instant task execution via OpenClaw hooks ---
const HOOK_URL = 'http://127.0.0.1:18789/hooks/agent';
const HOOK_TOKEN = process.env.OPENCLAW_HOOK_TOKEN || '';

function triggerTaskExecution(task) {
  // Check for user-uploaded attachments
  const taskAttDir = path.join(ATTACHMENTS_DIR, task.id);
  let attachmentInfo = '';
  try {
    if (fs.existsSync(taskAttDir)) {
      const files = fs.readdirSync(taskAttDir).filter(f => !f.startsWith('.'));
      if (files.length > 0) {
        const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'];
        const fileDetails = files.map(f => {
          const ext = path.extname(f).toLowerCase();
          const isImage = imageExts.includes(ext);
          const fullPath = path.join(taskAttDir, f);
          const stat = fs.statSync(fullPath);
          return { name: f, path: fullPath, isImage, size: stat.size };
        });
        const images = fileDetails.filter(f => f.isImage);
        const others = fileDetails.filter(f => !f.isImage);

        attachmentInfo = `\n📎 **User-Uploaded Attachments (${files.length} file${files.length > 1 ? 's' : ''}):**\n`;
        for (const f of fileDetails) {
          attachmentInfo += `   - ${f.isImage ? '🖼️' : '📄'} ${f.name} → \`${f.path}\` (${formatFileSize(f.size)})\n`;
        }
        if (images.length > 0) {
          attachmentInfo += `\n⚠️ **IMPORTANT:** The user attached ${images.length} image(s) to this task. You MUST:\n`;
          attachmentInfo += `   1. Use the \`image\` tool to analyze each attached image to understand what the user wants\n`;
          attachmentInfo += `   2. If the task involves remaking/editing images, use the attached image as the \`--input\` source for Nano Banana Pro:\n`;
          attachmentInfo += `      python3 skills/google-imagen/scripts/generate_image.py "edit instruction" --input "${images[0].path}" --output /tmp/output.png\n`;
          attachmentInfo += `   3. Reference the attached files by their full paths listed above\n`;
        }
      }
    }
  } catch (e) {
    console.error(`[webhook] Error scanning attachments for task ${task.id}:`, e.message);
  }

  const message = `Execute this dashboard task immediately.

Task ID: ${task.id}
Title: ${task.title}
Description: ${task.description || '(no description)'}
Priority: ${task.priority || 'medium'}${attachmentInfo}

Steps:
1. Update status to in-progress: curl -s -X PATCH 'http://localhost:18790/tasks/${task.id}?token=${AUTH_TOKEN}' -H 'Content-Type: application/json' -d '{"status":"in-progress"}'
2. Execute the task (do what the title/description says)
3. **IMPORTANT — File Attachments:** If you generate ANY files (images, documents, PDFs, etc.) as part of this task, attach them to the task using this command for EACH file:
   curl -s -X POST 'http://localhost:18790/tasks/${task.id}/attachments?token=${AUTH_TOKEN}' -H 'Content-Type: application/json' -d '{"filePath":"/absolute/path/to/file.ext","source":"agent"}'
   The filePath must be an absolute path to the generated file on the server. This lets the dashboard display the file.
4. Add result as a note: curl -s -X POST 'http://localhost:18790/tasks/${task.id}/notes?token=${AUTH_TOKEN}' -H 'Content-Type: application/json' -d '{"text":"<YOUR_RESULT>"}'
5. Mark done: curl -s -X PATCH 'http://localhost:18790/tasks/${task.id}?token=${AUTH_TOKEN}' -H 'Content-Type: application/json' -d '{"status":"done"}'
6. If it fails, mark failed with error in note.`;

  // Use /hooks/agent with unique session key per task
  const payload = JSON.stringify({
    message: message,
    sessionKey: `hook:dashboard:${task.id}`,
  });

  const options = {
    hostname: '127.0.0.1',
    port: 18789,
    path: '/hooks/agent',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${HOOK_TOKEN}`,
      'Content-Length': Buffer.byteLength(payload),
    },
    timeout: 10000,
  };

  const req = http.request(options, (res) => {
    let body = '';
    res.on('data', (c) => body += c);
    res.on('end', () => {
      console.log(`[webhook] Task ${task.id} triggered: ${res.statusCode} ${body.substring(0, 200)}`);
    });
  });
  req.on('error', (e) => console.error(`[webhook] Failed to trigger task ${task.id}:`, e.message));
  req.on('timeout', () => { req.destroy(); console.error(`[webhook] Timeout triggering task ${task.id}`); });
  req.write(payload);
  req.end();
}

// --- Helpers ---

function jsonReply(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(body);
}

function errorReply(res, status, message) {
  jsonReply(res, status, { error: message });
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function parseCookies(req) {
  const raw = req.headers['cookie'] || '';
  return Object.fromEntries(raw.split(';').map(c => c.trim().split('=').map(s => decodeURIComponent(s.trim()))));
}

function authenticate(req) {
  const parsed = url.parse(req.url, true);
  if (parsed.query.token === AUTH_TOKEN) return true;
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ') && authHeader.slice(7).trim() === AUTH_TOKEN) return true;
  const cookies = parseCookies(req);
  if (cookies['ds'] === AUTH_TOKEN) return true;
  return false;
}

function readBody(req, maxSize) {
  const limit = maxSize || MAX_BODY;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
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
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Invalid JSON body');
    }
  });
}

function readTasks() {
  try {
    const raw = fs.readFileSync(TASKS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeTasks(tasks) {
  const tmp = TASKS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(tasks, null, 2), 'utf8');
  fs.renameSync(tmp, TASKS_FILE);
}

function uuid() {
  return crypto.randomUUID();
}

// --- File access whitelist ---
function isAllowedPath(p) {
  if (!p || typeof p !== 'string') return false;
  // Normalize and prevent traversal
  const normalized = path.normalize(p);
  if (normalized.includes('..')) return false;
  if (path.isAbsolute(normalized)) return false;

  // Allowed patterns
  const parts = normalized.split(path.sep);

  // Root *.md files
  if (parts.length === 1 && normalized.endsWith('.md')) return true;

  // memory/*.md
  if (parts.length === 2 && parts[0] === 'memory' && parts[1].endsWith('.md')) return true;

  return false;
}

// --- Route: Tasks ---
function handleTasks(req, res, parsed, segments, method) {
  // GET /tasks
  if (method === 'GET' && segments.length === 1) {
    const tasks = readTasks();
    const q = parsed.query;
    let filtered = tasks;
    if (q.status) filtered = filtered.filter((t) => t.status === q.status);
    if (q.priority) filtered = filtered.filter((t) => t.priority === q.priority);
    if (q.assignee) filtered = filtered.filter((t) => t.assignee === q.assignee);
    return jsonReply(res, 200, filtered);
  }

  // POST /tasks
  if (method === 'POST' && segments.length === 1) {
    return readJsonBody(req).then((body) => {
      if (!body.title || typeof body.title !== 'string') {
        return errorReply(res, 400, 'title is required');
      }
      const validStatuses = ['new', 'in-progress', 'done', 'failed'];
      const validPriorities = ['high', 'medium', 'low'];
      const status = body.status && validStatuses.includes(body.status) ? body.status : 'new';
      const priority = body.priority && validPriorities.includes(body.priority) ? body.priority : 'medium';
      const now = new Date().toISOString();
      const task = {
        id: uuid(),
        title: body.title,
        description: body.description || '',
        content: body.content || '',
        status,
        priority,
        assignee: body.assignee || 'main',
        createdAt: now,
        updatedAt: now,
        dueDate: body.dueDate || null,
        notes: [],
        source: body.source || 'dashboard',
      };
      const tasks = readTasks();
      tasks.push(task);
      writeTasks(tasks);

      // Trigger instant execution via webhook
      if (task.status === 'new') {
        triggerTaskExecution(task);
      }

      return jsonReply(res, 201, task);
    }).catch((e) => errorReply(res, 400, e.message));
  }

  // POST /tasks/spawn-batch  (MUST be before /tasks/:id/notes check)
  if (method === 'POST' && segments.length === 2 && segments[1] === 'spawn-batch') {
    return readJsonBody(req).then((body) => {
      if (!Array.isArray(body.taskIds) || body.taskIds.length === 0) {
        return errorReply(res, 400, 'taskIds array is required');
      }
      const tasks = readTasks();
      const spawned = [];
      const skipped = [];
      for (const id of body.taskIds) {
        const task = tasks.find(t => t.id === id);
        if (!task) { skipped.push({ id, reason: 'not found' }); continue; }
        if (task.status === 'in-progress') { skipped.push({ id, reason: 'already running' }); continue; }
        task.notes.push({
          text: `⚡ Spawned as part of parallel batch (${body.taskIds.length} tasks)`,
          timestamp: new Date().toISOString(),
        });
        if (task.status === 'done' || task.status === 'failed') {
          task.status = 'new';
          task.notes.push({ text: `Status changed from "${task.status}" to "new"`, timestamp: new Date().toISOString() });
        }
        task.updatedAt = new Date().toISOString();
        triggerTaskExecution(task);
        spawned.push(task);
      }
      writeTasks(tasks);
      return jsonReply(res, 200, { spawned: spawned.length, skipped, tasks: spawned });
    }).catch((e) => errorReply(res, 400, e.message));
  }

  // POST /tasks/:id/spawn
  if (method === 'POST' && segments.length === 3 && segments[2] === 'spawn') {
    const id = segments[1];
    const tasks = readTasks();
    const task = tasks.find((t) => t.id === id);
    if (!task) return errorReply(res, 404, 'Task not found');
    if (task.status === 'in-progress') return errorReply(res, 409, 'Task is already running');
    task.notes.push({
      text: '⚡ Spawned as parallel sub-agent',
      timestamp: new Date().toISOString(),
    });
    if (task.status === 'done' || task.status === 'failed') {
      task.notes.push({ text: `Status changed from "${task.status}" to "new"`, timestamp: new Date().toISOString() });
      task.status = 'new';
    }
    task.updatedAt = new Date().toISOString();
    writeTasks(tasks);
    triggerTaskExecution(task);
    return jsonReply(res, 200, task);
  }

  // POST /tasks/:id/notes
  if (method === 'POST' && segments.length === 3 && segments[2] === 'notes') {
    const id = segments[1];
    return readJsonBody(req).then((body) => {
      if (!body.text || typeof body.text !== 'string') {
        return errorReply(res, 400, 'text is required');
      }
      const tasks = readTasks();
      const task = tasks.find((t) => t.id === id);
      if (!task) return errorReply(res, 404, 'Task not found');
      const note = { text: body.text, timestamp: new Date().toISOString() };
      task.notes.push(note);
      task.updatedAt = new Date().toISOString();
      writeTasks(tasks);
      return jsonReply(res, 201, note);
    }).catch((e) => errorReply(res, 400, e.message));
  }

  // PATCH /tasks/:id
  if (method === 'PATCH' && segments.length === 2) {
    const id = segments[1];
    return readJsonBody(req).then((body) => {
      const tasks = readTasks();
      const task = tasks.find((t) => t.id === id);
      if (!task) return errorReply(res, 404, 'Task not found');

      const validStatuses = ['new', 'in-progress', 'done', 'failed'];
      const validPriorities = ['high', 'medium', 'low'];
      const allowedFields = ['title', 'description', 'content', 'status', 'priority', 'assignee', 'dueDate', 'source'];

      // Track status changes in notes
      if (body.status && body.status !== task.status) {
        if (!validStatuses.includes(body.status)) {
          return errorReply(res, 400, 'Invalid status. Must be: ' + validStatuses.join(', '));
        }
        task.notes.push({
          text: `Status changed from "${task.status}" to "${body.status}"`,
          timestamp: new Date().toISOString(),
        });
      }

      if (body.priority && !validPriorities.includes(body.priority)) {
        return errorReply(res, 400, 'Invalid priority. Must be: ' + validPriorities.join(', '));
      }

      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          task[field] = body[field];
        }
      }
      task.updatedAt = new Date().toISOString();
      writeTasks(tasks);
      return jsonReply(res, 200, task);
    }).catch((e) => errorReply(res, 400, e.message));
  }

  // DELETE /tasks/:id
  if (method === 'DELETE' && segments.length === 2) {
    const id = segments[1];
    const tasks = readTasks();
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx === -1) return errorReply(res, 404, 'Task not found');
    const removed = tasks.splice(idx, 1)[0];
    writeTasks(tasks);
    return jsonReply(res, 200, removed);
  }

  return errorReply(res, 405, 'Method not allowed');
}

// --- Route: Files ---
function handleFiles(req, res, parsed, method) {
  const filePath = parsed.query.path;
  if (!filePath) return errorReply(res, 400, 'path query param is required');
  if (!isAllowedPath(filePath)) return errorReply(res, 403, 'Access denied: path not allowed');

  const fullPath = path.join(WORKSPACE, filePath);

  if (method === 'GET') {
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      jsonReply(res, 200, { path: filePath, content });
    } catch (e) {
      if (e.code === 'ENOENT') return errorReply(res, 404, 'File not found');
      return errorReply(res, 500, 'Failed to read file: ' + e.message);
    }
    return;
  }

  if (method === 'PUT') {
    return readBody(req).then((buf) => {
      const content = buf.toString('utf8');
      // Ensure directory exists
      const dir = path.dirname(fullPath);
      fs.mkdirSync(dir, { recursive: true });
      const tmp = fullPath + '.tmp';
      fs.writeFileSync(tmp, content, 'utf8');
      fs.renameSync(tmp, fullPath);
      jsonReply(res, 200, { path: filePath, size: content.length });
    }).catch((e) => errorReply(res, 500, e.message));
  }

  return errorReply(res, 405, 'Method not allowed');
}

// --- Route: Skills ---
function handleSkills(req, res, method) {
  if (method !== 'GET') return errorReply(res, 405, 'Method not allowed');

  const skills = [];

  function scanDir(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(full);
      } else if (entry.name === 'SKILL.md') {
        try {
          const raw = fs.readFileSync(full, 'utf8');
          const skill = parseSkillFrontmatter(raw, full);
          if (skill) skills.push(skill);
        } catch { /* skip */ }
      }
    }
  }

  // Scan workspace custom skills
  scanDir(SKILLS_DIR);
  // Scan system-installed skills
  const SYSTEM_SKILLS_DIR = process.env.OPENCLAW_SYSTEM_SKILLS || '/opt/homebrew/lib/node_modules/openclaw/skills';
  scanDir(SYSTEM_SKILLS_DIR);
  // Deduplicate by name
  const seen = new Set();
  const unique = skills.filter(s => {
    if (seen.has(s.name)) return false;
    seen.add(s.name);
    return true;
  });
  jsonReply(res, 200, unique);
}

function parseSkillFrontmatter(content, filePath) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    // Try to get name from first heading
    const heading = content.match(/^#\s+(.+)/m);
    return {
      name: heading ? heading[1].trim() : path.basename(path.dirname(filePath)),
      description: '',
      path: path.relative(WORKSPACE, filePath),
    };
  }
  const yaml = match[1];
  const name = (yaml.match(/^name:\s*(.+)$/m) || [])[1] || path.basename(path.dirname(filePath));
  const desc = (yaml.match(/^description:\s*(.+)$/m) || [])[1] || '';
  return {
    name: name.replace(/^["']|["']$/g, '').trim(),
    description: desc.replace(/^["']|["']$/g, '').trim(),
    path: path.relative(WORKSPACE, filePath),
  };
}

// --- Route: Logs ---
function handleLogs(req, res, parsed, segments, method) {
  if (method !== 'GET') return errorReply(res, 405, 'Method not allowed');

  // GET /logs/tasks
  if (segments.length === 2 && segments[1] === 'tasks') {
    const tasks = readTasks();
    const history = tasks
      .filter((t) => t.notes && t.notes.length > 0)
      .map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        notes: t.notes.filter((n) => n.text.includes('Status changed') || true),
      }));
    return jsonReply(res, 200, history);
  }

  // GET /logs
  if (segments.length === 1) {
    let files;
    try {
      files = fs.readdirSync(MEMORY_DIR).filter((f) => f.endsWith('.md'));
    } catch {
      return jsonReply(res, 200, []);
    }

    // Sort by filename descending (YYYY-MM-DD.md)
    files.sort((a, b) => b.localeCompare(a));

    const logs = files.map((f) => {
      const content = fs.readFileSync(path.join(MEMORY_DIR, f), 'utf8');
      const dateMatch = f.match(/^(\d{4}-\d{2}-\d{2})/);
      return {
        date: dateMatch ? dateMatch[1] : f.replace('.md', ''),
        filename: f,
        content,
      };
    });

    return jsonReply(res, 200, logs);
  }

  return errorReply(res, 404, 'Not found');
}

// --- Route: Agents (live session monitoring) ---
function handleAgents(req, res, parsed, segments, method) {
  if (method !== 'GET') return errorReply(res, 405, 'Method not allowed');

  const now = Date.now();
  const ACTIVE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

  // Read sessions
  let sessions = {};
  try {
    const raw = fs.readFileSync(SESSIONS_FILE, 'utf8');
    sessions = JSON.parse(raw);
  } catch (e) {
    return errorReply(res, 500, 'Failed to read sessions: ' + e.message);
  }

  // Read subagent runs
  let subagentRuns = {};
  try {
    const raw = fs.readFileSync(SUBAGENT_RUNS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    subagentRuns = (parsed && parsed.runs) || {};
  } catch { /* ok - file may not exist */ }

  // Categorize sessions
  const categories = { main: [], subagent: [], hook: [], cron: [], group: [] };
  const allSessions = [];

  for (const [key, session] of Object.entries(sessions)) {
    const updatedAt = session.updatedAt || 0;
    const ageMs = now - updatedAt;
    const isActive = ageMs < ACTIVE_THRESHOLD_MS;

    let category = 'group';
    if (key.endsWith(':main')) category = 'main';
    else if (key.includes(':subagent:')) category = 'subagent';
    else if (key.includes(':hook:')) category = 'hook';
    else if (key.includes(':cron:')) category = 'cron';
    else if (key.includes(':group:')) category = 'group';

    const entry = {
      key,
      category,
      updatedAt,
      ageMs,
      ageMinutes: Math.round(ageMs / 60000),
      isActive,
      model: session.model || '',
      totalTokens: session.totalTokens || 0,
      contextTokens: session.contextTokens || 0,
      channel: session.channel || session.origin?.surface || '',
      displayName: session.displayName || '',
      label: session.label || '',
      sessionId: session.sessionId || '',
    };

    // Add subagent task info
    if (category === 'subagent') {
      for (const run of Object.values(subagentRuns)) {
        if (run.childSessionKey === key) {
          entry.task = (run.task || '').substring(0, 200);
          entry.requesterSessionKey = run.requesterSessionKey || '';
          entry.subagentStatus = run.status || 'unknown';
          break;
        }
      }
    }

    // Add hook source info
    if (category === 'hook') {
      if (key.includes(':dashboard:')) entry.hookSource = 'dashboard';
      else entry.hookSource = 'external';
    }

    categories[category].push(entry);
    allSessions.push(entry);
  }

  // Sort each category by updatedAt descending
  for (const cat of Object.values(categories)) {
    cat.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  // Compute summary
  const activeSessions = allSessions.filter(s => s.isActive);
  const activeSubagents = categories.subagent.filter(s => s.isActive);
  const activeHooks = categories.hook.filter(s => s.isActive);
  const activeCrons = categories.cron.filter(s => s.isActive);
  const mainAgent = categories.main[0] || null;

  const summary = {
    totalSessions: allSessions.length,
    activeSessions: activeSessions.length,
    mainAgent: mainAgent ? {
      status: mainAgent.isActive ? 'active' : 'idle',
      ageMinutes: mainAgent.ageMinutes,
      model: mainAgent.model,
      totalTokens: mainAgent.totalTokens,
      channel: mainAgent.channel,
    } : null,
    subagents: {
      total: categories.subagent.length,
      active: activeSubagents.length,
      sessions: categories.subagent.slice(0, 10),
    },
    hooks: {
      total: categories.hook.length,
      active: activeHooks.length,
      sessions: categories.hook.slice(0, 10),
    },
    crons: {
      total: categories.cron.length,
      active: activeCrons.length,
      sessions: categories.cron.slice(0, 10),
    },
    groups: {
      total: categories.group.length,
      active: categories.group.filter(s => s.isActive).length,
    },
    timestamp: now,
  };

  return jsonReply(res, 200, summary);
}

// --- Route: Attachments ---
function handleAttachments(req, res, parsed, segments, method) {
  // Segments: ['tasks', taskId, 'attachments', ...rest]
  const taskId = segments[1];
  if (!taskId) return errorReply(res, 400, 'Task ID required');

  const taskDir = path.join(ATTACHMENTS_DIR, taskId);

  // GET /tasks/:id/attachments — list files
  if (method === 'GET' && segments.length === 3) {
    try {
      fs.mkdirSync(taskDir, { recursive: true });
      const files = fs.readdirSync(taskDir).map(name => {
        const stat = fs.statSync(path.join(taskDir, name));
        const ext = path.extname(name).toLowerCase();
        const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'].includes(ext);
        return { name, size: stat.size, isImage, createdAt: stat.birthtime.toISOString(), ext };
      });
      files.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return jsonReply(res, 200, files);
    } catch (e) {
      return jsonReply(res, 200, []);
    }
  }

  // GET /tasks/:id/attachments/:filename — serve file
  if (method === 'GET' && segments.length === 4) {
    const filename = decodeURIComponent(segments[3]);
    if (filename.includes('..') || filename.includes('/')) return errorReply(res, 400, 'Invalid filename');
    const filePath = path.join(taskDir, filename);
    try {
      if (!fs.existsSync(filePath)) return errorReply(res, 404, 'File not found');
      const stat = fs.statSync(filePath);
      const ext = path.extname(filename).toLowerCase();
      const mimeTypes = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
        '.bmp': 'image/bmp', '.pdf': 'application/pdf',
        '.txt': 'text/plain', '.md': 'text/markdown',
        '.json': 'application/json', '.csv': 'text/csv',
        '.zip': 'application/zip', '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.html': 'text/html', '.htm': 'text/html',
      };
      const mime = mimeTypes[ext] || 'application/octet-stream';
      const data = fs.readFileSync(filePath);
      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': data.length,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
        ...(parsed.query.download === '1' ? { 'Content-Disposition': `attachment; filename="${filename}"` } : {}),
      });
      res.end(data);
    } catch (e) {
      return errorReply(res, 500, 'Failed to serve file: ' + e.message);
    }
    return;
  }

  // POST /tasks/:id/attachments — upload file (base64 JSON body OR filePath for server-side copy)
  if (method === 'POST' && segments.length === 3) {
    return readBody(req, MAX_UPLOAD * 1.4).then(buf => { // base64 is ~1.33x larger
      const text = buf.toString('utf8');
      let body;
      try { body = JSON.parse(text); } catch { throw new Error('Invalid JSON'); }

      let fileData;
      let filename;

      // Option 1: Server-side file copy (for agent-generated files)
      if (body.filePath && typeof body.filePath === 'string') {
        const srcPath = path.resolve(body.filePath);
        // Security: only allow files from /tmp, workspace, or user home
        const homeDir = process.env.HOME || '';
        const allowedPrefixes = ['/tmp/', WORKSPACE + '/', homeDir + '/openclaw/'];
        const isAllowed = allowedPrefixes.some(p => srcPath.startsWith(p));
        if (!isAllowed) throw new Error('filePath not in allowed directory');
        if (!fs.existsSync(srcPath)) throw new Error('Source file not found: ' + srcPath);
        const stat = fs.statSync(srcPath);
        if (stat.size > MAX_UPLOAD) throw new Error('File too large (max 20MB)');
        fileData = fs.readFileSync(srcPath);
        filename = (body.filename || path.basename(srcPath)).replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 200);
      }
      // Option 2: Base64 upload (for browser/external clients)
      else {
        if (!body.filename || typeof body.filename !== 'string') throw new Error('filename required');
        if (!body.data) throw new Error('data (base64) or filePath required');

        filename = body.filename.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 200);
        if (!filename) throw new Error('Invalid filename');

        // Decode base64 data (strip data URL prefix if present)
        let base64 = body.data;
        if (base64.includes(',')) base64 = base64.split(',')[1];
        fileData = Buffer.from(base64, 'base64');

        if (fileData.length > MAX_UPLOAD) throw new Error('File too large (max 20MB)');
      }

      fs.mkdirSync(taskDir, { recursive: true });
      const destPath = path.join(taskDir, filename);
      // Avoid overwriting — append timestamp if exists
      let finalName = filename;
      if (fs.existsSync(destPath)) {
        const ext = path.extname(filename);
        const base = path.basename(filename, ext);
        finalName = `${base}_${Date.now()}${ext}`;
      }
      fs.writeFileSync(path.join(taskDir, finalName), fileData);

      const stat = fs.statSync(path.join(taskDir, finalName));
      const ext = path.extname(finalName).toLowerCase();
      const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'].includes(ext);

      // Add a note about the attachment
      const tasks = readTasks();
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        const uploadedBy = body.source || 'user';
        task.notes.push({
          text: `📎 ${uploadedBy === 'agent' ? 'Agent' : 'User'} attached: ${finalName} (${formatFileSize(stat.size)})`,
          timestamp: new Date().toISOString(),
        });
        task.updatedAt = new Date().toISOString();
        writeTasks(tasks);
      }

      return jsonReply(res, 201, { name: finalName, size: stat.size, isImage, createdAt: stat.birthtime.toISOString(), ext });
    }).catch(e => errorReply(res, 400, e.message));
  }

  // DELETE /tasks/:id/attachments/:filename
  if (method === 'DELETE' && segments.length === 4) {
    const filename = decodeURIComponent(segments[3]);
    if (filename.includes('..') || filename.includes('/')) return errorReply(res, 400, 'Invalid filename');
    const filePath = path.join(taskDir, filename);
    try {
      if (!fs.existsSync(filePath)) return errorReply(res, 404, 'File not found');
      fs.unlinkSync(filePath);

      // Add a note about deletion
      const tasks = readTasks();
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        task.notes.push({
          text: `🗑️ Attachment removed: ${filename}`,
          timestamp: new Date().toISOString(),
        });
        task.updatedAt = new Date().toISOString();
        writeTasks(tasks);
      }

      return jsonReply(res, 200, { deleted: filename });
    } catch (e) {
      return errorReply(res, 500, 'Delete failed: ' + e.message);
    }
  }

  return errorReply(res, 405, 'Method not allowed');
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

// --- Cron Helpers ---
function loadCronStore() {
  try {
    const raw = fs.readFileSync(CRON_STORE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch { return { version: 1, jobs: [] }; }
}

function saveCronStore(store) {
  const dir = path.dirname(CRON_STORE_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${CRON_STORE_PATH}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf-8');
  fs.renameSync(tmp, CRON_STORE_PATH);
  // Signal gateway to reload cron store
  signalGatewayReload();
}

function signalGatewayReload() {
  try {
    const { execSync } = require('child_process');
    execSync("kill -USR1 $(pgrep -f 'node.*openclaw.*gateway' | head -1) 2>/dev/null || true", { timeout: 3000 });
  } catch {}
  // Also try restarting gateway service for full reload
  try {
    const { execSync } = require('child_process');
    execSync('sudo systemctl restart openclaw-gateway 2>/dev/null || true', { timeout: 10000 });
  } catch {}
}

function loadCronRuns(jobId, limit) {
  const filePath = path.join(CRON_RUNS_DIR, `${jobId}.jsonl`);
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const runs = lines.map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
    // Sort by timestamp descending
    runs.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    if (limit && limit > 0) return runs.slice(0, limit);
    return runs;
  } catch { return []; }
}

function loadLastCronRun(jobId) {
  const filePath = path.join(CRON_RUNS_DIR, `${jobId}.jsonl`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8').trim();
  if (!raw) return null;
  const lastLine = raw.split('\n').filter(Boolean).slice(-1)[0];
  try { return JSON.parse(lastLine); } catch { return null; }
}

function startOfTodayMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfTodayMs() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function computeNextRun(schedule, lastRunMs) {
  if (!schedule) return null;
  if (schedule.kind === 'every' && schedule.everyMs) {
    const base = lastRunMs || Date.now();
    return base + schedule.everyMs;
  }
  if (schedule.kind === 'at' && schedule.at) {
    const t = Date.parse(schedule.at);
    return Number.isFinite(t) ? t : null;
  }
  // cron: rely on scheduler state (nextRunAtMs) if available
  return null;
}

function triggerCronRunNow(job) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      message: job.payload?.message || '',
      sessionKey: `hook:dashboard-cron:${job.id}`,
    });
    const options = {
      hostname: '127.0.0.1',
      port: 18789,
      path: '/hooks/agent',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${HOOK_TOKEN}`,
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 15000,
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve({ ok: true, raw: data }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(payload);
    req.end();
  });
}

// --- Route: Cron ---
function handleCron(req, res, parsed, segments, method) {
  // GET /cron — list all jobs
  if (method === 'GET' && segments.length === 1) {
    const store = loadCronStore();
    const jobs = store.jobs || [];
    return jsonReply(res, 200, { jobs, version: store.version || 1 });
  }

  // GET /cron/status — summary
  if (method === 'GET' && segments.length === 2 && segments[1] === 'status') {
    const store = loadCronStore();
    const jobs = store.jobs || [];
    const enabled = jobs.filter(j => j.enabled).length;
    const disabled = jobs.filter(j => !j.enabled).length;
    const now = Date.now();
    const nextRun = jobs
      .filter(j => j.enabled && j.state?.nextRunAtMs)
      .map(j => j.state.nextRunAtMs)
      .sort((a, b) => a - b)[0] || null;
    return jsonReply(res, 200, {
      total: jobs.length,
      enabled,
      disabled,
      nextRunAtMs: nextRun,
      nextRunIn: nextRun ? Math.max(0, nextRun - now) : null,
    });
  }

  // GET /cron/:id/runs — run history
  if (method === 'GET' && segments.length === 3 && segments[2] === 'runs') {
    const jobId = segments[1];
    const limit = parseInt(parsed.query.limit) || 50;
    const runs = loadCronRuns(jobId, limit);
    return jsonReply(res, 200, { jobId, runs, count: runs.length });
  }

  // POST /cron — create job
  if (method === 'POST' && segments.length === 1) {
    return readJsonBody(req).then((body) => {
      if (!body.name || typeof body.name !== 'string') {
        return errorReply(res, 400, 'name is required');
      }
      if (!body.schedule) {
        return errorReply(res, 400, 'schedule is required');
      }

      const store = loadCronStore();
      const now = Date.now();
      const newJob = {
        id: uuid(),
        agentId: body.agentId || 'main',
        name: body.name.trim(),
        enabled: body.enabled !== false,
        createdAtMs: now,
        updatedAtMs: now,
        schedule: body.schedule,
        sessionTarget: body.sessionTarget || 'isolated',
        wakeMode: body.wakeMode || 'now',
        payload: body.payload || { kind: 'agentTurn', message: '' },
        state: {
          nextRunAtMs: null,
          lastRunAtMs: null,
          lastStatus: null,
          lastDurationMs: null,
        },
      };

      store.jobs.push(newJob);
      saveCronStore(store);
      return jsonReply(res, 201, newJob);
    }).catch((e) => errorReply(res, 400, e.message));
  }

  // PATCH /cron/:id — update job
  if (method === 'PATCH' && segments.length === 2) {
    const jobId = segments[1];
    return readJsonBody(req).then((body) => {
      const store = loadCronStore();
      const job = store.jobs.find(j => j.id === jobId);
      if (!job) return errorReply(res, 404, 'Job not found');

      // Update allowed fields
      if (body.name !== undefined) job.name = body.name;
      if (body.enabled !== undefined) job.enabled = body.enabled;
      if (body.schedule !== undefined) job.schedule = body.schedule;
      if (body.sessionTarget !== undefined) job.sessionTarget = body.sessionTarget;
      if (body.wakeMode !== undefined) job.wakeMode = body.wakeMode;
      if (body.payload !== undefined) job.payload = body.payload;
      job.updatedAtMs = Date.now();

      // If schedule changed, reset next run
      if (body.schedule !== undefined) {
        job.state = job.state || {};
        job.state.nextRunAtMs = null;
      }

      saveCronStore(store);
      return jsonReply(res, 200, job);
    }).catch((e) => errorReply(res, 400, e.message));
  }

  // DELETE /cron/:id — remove job
  if (method === 'DELETE' && segments.length === 2) {
    const jobId = segments[1];
    const store = loadCronStore();
    const idx = store.jobs.findIndex(j => j.id === jobId);
    if (idx === -1) return errorReply(res, 404, 'Job not found');
    const removed = store.jobs.splice(idx, 1)[0];
    saveCronStore(store);
    return jsonReply(res, 200, removed);
  }

  // POST /cron/:id/run — run now
  if (method === 'POST' && segments.length === 3 && segments[2] === 'run') {
    const jobId = segments[1];
    const store = loadCronStore();
    const job = store.jobs.find(j => j.id === jobId);
    if (!job) return errorReply(res, 404, 'Job not found');

    triggerCronRunNow(job).then(result => {
      jsonReply(res, 200, { ok: true, jobId, result });
    }).catch(err => {
      errorReply(res, 502, 'Failed to trigger run: ' + err.message);
    });
    return;
  }

  return errorReply(res, 405, 'Method not allowed');
}

// --- Cron Today (timeline) ---
function handleCronToday(req, res, method) {
  if (method !== 'GET') return errorReply(res, 405, 'Method not allowed');
  const store = loadCronStore();
  const jobs = (store.jobs || []).filter(j => j.enabled !== false);
  const start = startOfTodayMs();
  const end = endOfTodayMs();

  const todayJobs = [];
  jobs.forEach(job => {
    const lastRun = loadLastCronRun(job.id);
    const lastStarted = lastRun?.runAtMs || job.state?.lastRunAtMs || null;
    const lastDuration = lastRun?.durationMs || job.state?.lastDurationMs || null;
    const lastStatus = (lastRun?.status || job.state?.lastStatus || null);
    const lastEnded = lastStarted && lastDuration ? lastStarted + lastDuration : null;

    const nextRun = job.state?.nextRunAtMs || lastRun?.nextRunAtMs || computeNextRun(job.schedule, lastStarted);

    const hasTodayRun = lastStarted && lastStarted >= start && lastStarted <= end;
    const hasTodayNext = nextRun && nextRun >= start && nextRun <= end;
    if (!hasTodayRun && !hasTodayNext) return;

    todayJobs.push({
      id: job.id,
      name: job.name,
      schedule: job.schedule,
      nextRun,
      last: {
        status: lastStatus || (lastRun?.action === 'started' ? 'running' : null),
        startedAt: lastStarted,
        endedAt: lastEnded,
        durationMs: lastDuration,
      }
    });
  });

  todayJobs.sort((a, b) => (a.nextRun || Infinity) - (b.nextRun || Infinity));

  const stats = { total: todayJobs.length, success: 0, failed: 0, running: 0 };
  todayJobs.forEach(j => {
    const s = (j.last?.status || '').toLowerCase();
    if (!j.last?.startedAt) return;
    if (s === 'ok' || s === 'success') stats.success++;
    else if (s === 'running' || s === 'in_progress') stats.running++;
    else if (s) stats.failed++;
  });

  return jsonReply(res, 200, { todayJobs, stats });
}

// --- Vision Ingestion Stats (Notion) ---
async function handleVisionStats(req, res, method) {
  if (method !== 'GET') return errorReply(res, 405, 'Method not allowed');
  const start = new Date(startOfTodayMs()).toISOString();
  const end = new Date(endOfTodayMs()).toISOString();

  const categories = {
    NETWORKING: { db: VISION_DB.NETWORKING },
    WINE: { db: VISION_DB.WINE },
    CIGAR: { db: VISION_DB.CIGAR },
    TEA: { db: VISION_DB.TEA },
  };

  if (!NOTION_API_KEY || !Object.values(categories).some(c => c.db)) {
    Object.keys(categories).forEach(k => categories[k].count = 0);
    return jsonReply(res, 200, { status: 'not_configured', categories });
  }

  try {
    for (const [k, v] of Object.entries(categories)) {
      if (!v.db) { v.count = 0; continue; }
      v.count = await notionCount(v.db, start, end);
    }
    return jsonReply(res, 200, { status: 'ok', categories });
  } catch (e) {
    Object.keys(categories).forEach(k => categories[k].count = 0);
    return jsonReply(res, 200, { status: 'error', message: e.message, categories });
  }
}

async function notionCount(dbId, startIso, endIso) {
  let total = 0;
  let cursor = undefined;
  do {
    const body = {
      page_size: 100,
      filter: {
        and: [
          { timestamp: 'created_time', created_time: { on_or_after: startIso } },
          { timestamp: 'created_time', created_time: { before: endIso } }
        ]
      }
    };
    if (cursor) body.start_cursor = cursor;

    const resp = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.message || 'Notion API error');
    total += (data.results || []).length;
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return total;
}

// --- Ops: Channel Usage (today, PST) ---
const MODEL_COSTS = {
  // per 1M tokens (input/output avg blended)
  'claude-opus-4-6': 0.075, 'claude-sonnet-4-6': 0.015,
  'gpt-5.2-codex': 0.0375, 'gpt-5.2': 0.01,
  'gemini-3-pro-preview': 0.00625, 'gemini-3-flash-preview': 0.0015,
};

function estimateCost(model, tokens) {
  const key = Object.keys(MODEL_COSTS).find(k => (model || '').includes(k));
  if (!key) return 0;
  return (tokens / 1_000_000) * MODEL_COSTS[key];
}

let _opsCache = null;
let _opsCacheAt = 0;
const OPS_CACHE_TTL = 60_000; // 60s

function todayPstStartUtcMs() {
  // PST = UTC-8; get midnight PST as UTC ms
  const now = new Date();
  const pst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  pst.setHours(0, 0, 0, 0);
  // Convert back to UTC
  const diff = now.getTime() - pst.getTime();
  return now.getTime() - diff - (now.getTime() - pst.getTime()) + pst.getTime();
}

function scanSessionUsageToday(sessionFile, todayStartIso) {
  const result = { input: 0, output: 0, totalTokens: 0, cost: 0, models: {}, messages: 0 };
  try {
    const stat = fs.statSync(sessionFile);
    // Read last 500KB max (should cover today's messages)
    const readSize = Math.min(500_000, stat.size);
    const buf = Buffer.alloc(readSize);
    const fd = fs.openSync(sessionFile, 'r');
    fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
    fs.closeSync(fd);
    const lines = buf.toString('utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const j = JSON.parse(line);
        if (j.type !== 'message' || !j.message?.usage) continue;
        if (j.timestamp < todayStartIso) continue;
        const u = j.message.usage;
        result.input += u.input || 0;
        result.output += u.output || 0;
        result.totalTokens += u.totalTokens || 0;
        result.cost += u.cost?.total || 0;
        const m = j.message.model || 'unknown';
        result.models[m] = (result.models[m] || 0) + (u.totalTokens || 0);
        result.messages++;
      } catch {}
    }
  } catch {}
  // If provider cost is 0, estimate
  if (result.cost === 0 && result.totalTokens > 0) {
    for (const [m, t] of Object.entries(result.models)) {
      result.cost += estimateCost(m, t);
    }
  }
  return result;
}

function handleOpsChannels(req, res, method) {
  if (method !== 'GET') return errorReply(res, 405, 'Method not allowed');

  const now = Date.now();
  if (_opsCache && (now - _opsCacheAt) < OPS_CACHE_TTL) {
    return jsonReply(res, 200, _opsCache);
  }

  let sessions;
  try {
    sessions = JSON.parse(fs.readFileSync(SESSIONS_JSON, 'utf8'));
  } catch (e) {
    return errorReply(res, 500, 'Cannot read sessions: ' + e.message);
  }

  // Today start in PST as ISO string
  const todayPst = new Date();
  const pstStr = todayPst.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
  const pstDate = new Date(pstStr);
  pstDate.setHours(0, 0, 0, 0);
  // Convert PST midnight back to UTC ISO
  const offsetMs = todayPst.getTime() - pstDate.getTime();
  const todayStartUtc = new Date(todayPst.getTime() - offsetMs);
  const todayStartIso = todayStartUtc.toISOString();

  const channels = {}; // keyed by channel display name
  let grandTotal = { input: 0, output: 0, totalTokens: 0, cost: 0, messages: 0, models: {} };

  for (const [key, sess] of Object.entries(sessions)) {
    const ch = sess.channel || sess.origin?.surface || 'other';
    if (ch !== 'discord' && ch !== 'whatsapp') continue;

    const displayName = sess.displayName || sess.groupChannel || key;
    const sessionFile = sess.sessionFile;
    if (!sessionFile) continue;

    const usage = scanSessionUsageToday(sessionFile, todayStartIso);
    if (usage.messages === 0) continue; // skip sessions with no today activity

    const chKey = displayName;
    if (!channels[chKey]) {
      channels[chKey] = {
        displayName,
        channel: ch,
        sessionKey: key,
        model: sess.model || 'unknown',
        status: sess.abortedLastRun ? 'error' : 'active',
        updatedAt: sess.updatedAt,
        today: { input: 0, output: 0, totalTokens: 0, cost: 0, messages: 0, models: {} }
      };
    }
    const c = channels[chKey];
    c.today.input += usage.input;
    c.today.output += usage.output;
    c.today.totalTokens += usage.totalTokens;
    c.today.cost += usage.cost;
    c.today.messages += usage.messages;
    for (const [m, t] of Object.entries(usage.models)) {
      c.today.models[m] = (c.today.models[m] || 0) + t;
      grandTotal.models[m] = (grandTotal.models[m] || 0) + t;
    }
    grandTotal.input += usage.input;
    grandTotal.output += usage.output;
    grandTotal.totalTokens += usage.totalTokens;
    grandTotal.cost += usage.cost;
    grandTotal.messages += usage.messages;
  }

  // Also scan cron runs for today
  try {
    const cronFiles = fs.readdirSync(CRON_RUNS_DIR).filter(f => f.endsWith('.jsonl'));
    for (const cf of cronFiles) {
      const fp = path.join(CRON_RUNS_DIR, cf);
      try {
        const raw = fs.readFileSync(fp, 'utf8').trim();
        const lines = raw.split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const j = JSON.parse(line);
            if (!j.ts || new Date(j.ts).toISOString() < todayStartIso) continue;
            if (j.action !== 'finished' || !j.usage) continue;
            const m = j.model || 'cron';
            const tokens = j.usage.total_tokens || j.usage.totalTokens || 0;
            if (tokens === 0) continue;
            grandTotal.totalTokens += tokens;
            grandTotal.models[m] = (grandTotal.models[m] || 0) + tokens;
            grandTotal.cost += estimateCost(m, tokens);
          } catch {}
        }
      } catch {}
    }
  } catch {}

  const result = {
    channels: Object.values(channels).sort((a, b) => b.today.totalTokens - a.today.totalTokens),
    totals: grandTotal,
    cachedAt: now
  };

  _opsCache = result;
  _opsCacheAt = now;
  return jsonReply(res, 200, result);
}

// --- Ops: All-Time Usage ---
let _allTimeCache = null;
let _allTimeCacheAt = 0;
const ALLTIME_CACHE_TTL = 300_000; // 5 min

function handleOpsAlltime(req, res, method) {
  if (method !== 'GET') return errorReply(res, 405, 'Method not allowed');

  const now = Date.now();
  if (_allTimeCache && (now - _allTimeCacheAt) < ALLTIME_CACHE_TTL) {
    return jsonReply(res, 200, _allTimeCache);
  }

  const sessDir = path.dirname(SESSIONS_JSON);
  let files;
  try {
    files = fs.readdirSync(sessDir).filter(f => f.includes('.jsonl'));
  } catch (e) {
    return errorReply(res, 500, 'Cannot read sessions dir: ' + e.message);
  }

  const models = {};
  const daily = {}; // YYYY-MM-DD → { tokens, cost, models }
  let totalTokens = 0, totalInput = 0, totalOutput = 0, totalCost = 0, totalMessages = 0;

  for (const f of files) {
    try {
      const data = fs.readFileSync(path.join(sessDir, f), 'utf8');
      for (const line of data.split('\n')) {
        if (!line.includes('"usage"')) continue;
        try {
          const j = JSON.parse(line);
          if (j.type !== 'message' || !j.message?.usage) continue;
          const u = j.message.usage;
          const m = j.message.model || 'unknown';
          const tokens = u.totalTokens || 0;
          const input = u.input || 0;
          const output = u.output || 0;
          let cost = u.cost?.total || 0;
          if (cost === 0 && tokens > 0) cost = estimateCost(m, tokens);

          totalTokens += tokens;
          totalInput += input;
          totalOutput += output;
          totalCost += cost;
          totalMessages++;

          if (!models[m]) models[m] = { tokens: 0, input: 0, output: 0, cost: 0, messages: 0 };
          models[m].tokens += tokens;
          models[m].input += input;
          models[m].output += output;
          models[m].cost += cost;
          models[m].messages++;

          // Daily bucket (PST)
          if (j.timestamp) {
            const d = new Date(j.timestamp);
            const pst = new Date(d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
            const day = pst.toISOString().slice(0, 10);
            if (!daily[day]) daily[day] = { tokens: 0, cost: 0, models: {} };
            daily[day].tokens += tokens;
            daily[day].cost += cost;
            daily[day].models[m] = (daily[day].models[m] || 0) + tokens;
          }
        } catch {}
      }
    } catch {}
  }

  // Also scan cron runs
  try {
    const cronFiles = fs.readdirSync(CRON_RUNS_DIR).filter(f => f.endsWith('.jsonl'));
    for (const cf of cronFiles) {
      try {
        const raw = fs.readFileSync(path.join(CRON_RUNS_DIR, cf), 'utf8').trim();
        for (const line of raw.split('\n')) {
          try {
            const j = JSON.parse(line);
            if (j.action !== 'finished' || !j.usage) continue;
            const m = j.model || 'cron';
            const tokens = j.usage.total_tokens || j.usage.totalTokens || 0;
            if (tokens === 0) continue;
            let cost = estimateCost(m, tokens);
            totalTokens += tokens;
            totalCost += cost;
            totalMessages++;
            if (!models[m]) models[m] = { tokens: 0, input: 0, output: 0, cost: 0, messages: 0 };
            models[m].tokens += tokens;
            models[m].cost += cost;
            models[m].messages++;
            if (j.ts) {
              const d = new Date(j.ts);
              const pst = new Date(d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
              const day = pst.toISOString().slice(0, 10);
              if (!daily[day]) daily[day] = { tokens: 0, cost: 0, models: {} };
              daily[day].tokens += tokens;
              daily[day].cost += cost;
              daily[day].models[m] = (daily[day].models[m] || 0) + tokens;
            }
          } catch {}
        }
      } catch {}
    }
  } catch {}

  // Sort models by tokens desc
  const sortedModels = Object.entries(models)
    .filter(([k]) => k !== 'delivery-mirror' && k !== 'unknown')
    .sort((a, b) => b[1].tokens - a[1].tokens)
    .map(([name, data]) => ({ name, ...data }));

  // Last 14 days for chart
  const days = Object.keys(daily).sort().slice(-14);
  const recentDaily = days.map(d => ({ date: d, ...daily[d] }));

  const result = {
    totals: { tokens: totalTokens, input: totalInput, output: totalOutput, cost: totalCost, messages: totalMessages },
    models: sortedModels,
    recentDaily,
    sessionFiles: files.length,
    audit: {
      openai: { status: 'needs_scope', note: 'API key needs api.usage.read scope' },
      anthropic: { status: 'needs_admin_key', note: 'Requires Anthropic admin API key' },
      google: { status: 'no_api', note: 'No public usage API available' }
    },
    cachedAt: now
  };

  _allTimeCache = result;
  _allTimeCacheAt = now;
  return jsonReply(res, 200, result);
}

// --- Ops: Official Provider Audit ---
async function fetchJson(url, headers) {
  const https = require('node:https');
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({ raw: body }); } });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

let _auditCache = null;
let _auditCacheAt = 0;
const AUDIT_CACHE_TTL = 300_000;

async function handleOpsAudit(req, res, method) {
  if (method !== 'GET') return errorReply(res, 405, 'Method not allowed');

  const now = Date.now();
  if (_auditCache && (now - _auditCacheAt) < AUDIT_CACHE_TTL) {
    return jsonReply(res, 200, _auditCache);
  }

  const result = { openai: null, anthropic: null, google: null, fetchedAt: now };

  // OpenAI usage (last 7 days)
  if (OPENAI_ADMIN_KEY) {
    try {
      const start = Math.floor((now - 7 * 86400000) / 1000);
      // Two calls: one without group_by for totals, one with group_by for model breakdown
      const [dataAll, dataByModel] = await Promise.all([
        fetchJson(`https://api.openai.com/v1/organization/usage/completions?start_time=${start}&limit=7`, { 'Authorization': `Bearer ${OPENAI_ADMIN_KEY}` }),
        fetchJson(`https://api.openai.com/v1/organization/usage/completions?start_time=${start}&group_by=model&limit=7`, { 'Authorization': `Bearer ${OPENAI_ADMIN_KEY}` })
      ]);
      const days = {};
      const models = {};
      let totalIn = 0, totalOut = 0, totalCached = 0, totalReqs = 0;
      // Process ungrouped for totals + daily
      for (const bucket of (dataAll.data || [])) {
        const day = (bucket.end_time_iso || '').slice(0, 10);
        for (const r of (bucket.results || [])) {
          const inp = r.input_tokens || 0;
          const out = r.output_tokens || 0;
          const cached = r.input_cached_tokens || 0;
          const reqs = r.num_model_requests || 0;
          totalIn += inp; totalOut += out; totalCached += cached; totalReqs += reqs;
          if (!days[day]) days[day] = { input: 0, output: 0, requests: 0 };
          days[day].input += inp; days[day].output += out; days[day].requests += reqs;
        }
      }
      // Process model-grouped
      for (const bucket of (dataByModel.data || [])) {
        for (const r of (bucket.results || [])) {
          const m = r.model || 'unknown';
          if (!models[m]) models[m] = { input: 0, output: 0, cached: 0, requests: 0 };
          models[m].input += r.input_tokens || 0;
          models[m].output += r.output_tokens || 0;
          models[m].cached += r.input_cached_tokens || 0;
          models[m].requests += r.num_model_requests || 0;
        }
      }
      result.openai = { status: 'ok', totals: { input: totalIn, output: totalOut, cached: totalCached, requests: totalReqs }, models, days };
    } catch (e) {
      result.openai = { status: 'error', error: e.message };
    }
  } else {
    result.openai = { status: 'no_key' };
  }

  // Anthropic org info (usage API not yet public)
  if (ANTHROPIC_ADMIN_KEY) {
    try {
      const org = await fetchJson(
        'https://api.anthropic.com/v1/organizations/me',
        { 'x-api-key': ANTHROPIC_ADMIN_KEY, 'anthropic-version': '2023-06-01' }
      );
      const keys = await fetchJson(
        'https://api.anthropic.com/v1/organizations/api_keys?limit=20&status=active',
        { 'x-api-key': ANTHROPIC_ADMIN_KEY, 'anthropic-version': '2023-06-01' }
      );
      const activeKeys = (keys.data || []).map(k => ({ name: k.name, hint: k.partial_key_hint, workspace: k.workspace_id }));
      result.anthropic = { status: 'org_only', org: { id: org.id, name: org.name }, activeKeys, note: 'Usage API not yet public; using local estimates' };
    } catch (e) {
      result.anthropic = { status: 'error', error: e.message };
    }
  } else {
    result.anthropic = { status: 'no_key' };
  }

  result.google = { status: 'no_api', note: 'Google has no public usage API' };

  _auditCache = result;
  _auditCacheAt = now;
  return jsonReply(res, 200, result);
}

// --- Main Server ---
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  const method = req.method.toUpperCase();

  // CORS preflight
  if (method === 'OPTIONS') {
    setCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check (no auth)
  if (pathname === '/health' && method === 'GET') {
    return jsonReply(res, 200, { status: 'ok', uptime: process.uptime() });
  }

  // Login page (no auth required)
  if (pathname === '/login') {
    if (method === 'GET') {
      setCors(res);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dashboard Login</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a0f;color:#e0e0e0;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
.card{background:#13131a;border:1px solid #2a2a3a;border-radius:16px;padding:40px 32px;width:100%;max-width:380px;text-align:center}
h1{font-size:1.4rem;font-weight:600;margin-bottom:8px}
p{color:#888;font-size:.9rem;margin-bottom:28px}
input{width:100%;padding:14px 16px;border:1px solid #2a2a3a;border-radius:10px;background:#0d0d14;color:#e0e0e0;font-size:1rem;margin-bottom:16px;outline:none}
input:focus{border-color:#5b6af0}
button{width:100%;padding:14px;background:#5b6af0;color:#fff;border:none;border-radius:10px;font-size:1rem;font-weight:600;cursor:pointer}
button:active{opacity:.8}
.err{color:#f05b5b;font-size:.85rem;margin-top:12px;display:none}
</style></head><body>
<div class="card">
  <h1>🐾 OpenClaw Dashboard</h1>
  <p>Enter your access token</p>
  <form method="POST" action="/login">
    <input type="password" name="token" placeholder="Token" autofocus autocomplete="current-password">
    <button type="submit">Sign in</button>
  </form>
  ${parsed.query.err ? '<p class="err" style="display:block">Invalid token</p>' : ''}
</div></body></html>`);
      return;
    }
    if (method === 'POST') {
      return readBody(req).then(buf => {
        const body = Object.fromEntries(new URLSearchParams(buf.toString()).entries());
        if (body.token === AUTH_TOKEN) {
          const cookieAge = 60 * 60 * 24 * 30; // 30 days
          res.writeHead(302, {
            'Set-Cookie': `ds=${encodeURIComponent(AUTH_TOKEN)}; Path=/; Max-Age=${cookieAge}; HttpOnly; SameSite=Strict`,
            'Location': `/?token=${encodeURIComponent(AUTH_TOKEN)}`
          });
          res.end();
        } else {
          res.writeHead(302, { 'Location': '/login?err=1' });
          res.end();
        }
      }).catch(() => { res.writeHead(400); res.end('Bad request'); });
    }
  }

  // Logout
  if (pathname === '/logout' && method === 'GET') {
    res.writeHead(302, {
      'Set-Cookie': 'ds=; Path=/; Max-Age=0',
      'Location': '/login'
    });
    res.end();
    return;
  }

  // Auth check — redirect browsers to login, return 401 for API clients
  if (!authenticate(req)) {
    const acceptsHtml = (req.headers['accept'] || '').includes('text/html');
    if (acceptsHtml) {
      res.writeHead(302, { 'Location': '/login' });
      res.end();
      return;
    }
    return errorReply(res, 401, 'Unauthorized');
  }

  // Serve dashboard HTML at root
  if (pathname === '/' && method === 'GET') {
    const htmlPath = path.join(__dirname, 'agent-dashboard.html');
    try {
      const html = fs.readFileSync(htmlPath);
      setCors(res);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (e) {
      return errorReply(res, 404, 'Dashboard HTML not found');
    }
    return;
  }

  const segments = pathname.split('/').filter(Boolean);
  const root = segments[0];

  try {
    // Route /tasks/:id/attachments to attachments handler
    if (root === 'tasks' && segments.length >= 3 && segments[2] === 'attachments') {
      return handleAttachments(req, res, parsed, segments, method);
    }
    if (root === 'tasks') return handleTasks(req, res, parsed, segments, method);
    if (root === 'files') return handleFiles(req, res, parsed, method);
    if (root === 'skills') return handleSkills(req, res, method);
    if (root === 'logs') return handleLogs(req, res, parsed, segments, method);
    if (root === 'agents') return handleAgents(req, res, parsed, segments, method);
    if (root === 'cron' && segments[1] === 'today') return handleCronToday(req, res, method);
    if (root === 'cron') return handleCron(req, res, parsed, segments, method);
    if (root === 'vision' && segments[1] === 'stats') return handleVisionStats(req, res, method);
    if (root === 'ops' && segments[1] === 'channels') return handleOpsChannels(req, res, method);
    if (root === 'ops' && segments[1] === 'alltime') return handleOpsAlltime(req, res, method);
    if (root === 'ops' && segments[1] === 'audit') return handleOpsAudit(req, res, method);
    return errorReply(res, 404, 'Not found');
  } catch (e) {
    console.error('Unhandled error:', e);
    return errorReply(res, 500, 'Internal server error');
  }
});

server.on('error', (e) => {
  console.error('Server error:', e);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Agent Dashboard API server listening on port ${PORT}`);
});
