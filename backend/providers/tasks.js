'use strict';
/**
 * Tasks Provider — CRUD + attachments + webhook trigger.
 * Migrated from api-server.js handleTasks + handleAttachments.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const cfg = require('../lib/config');
const { jsonReply, errorReply, readJsonBody, readBody, sanitizeUntrustedText, sanitizeFilename, requireMutatingOps } = require('../lib/http-helpers');

function readTasks() {
  try { return JSON.parse(fs.readFileSync(cfg.TASKS_FILE, 'utf8')); }
  catch { return []; }
}

function writeTasks(tasks) {
  const tmp = cfg.TASKS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(tasks, null, 2), 'utf8');
  fs.renameSync(tmp, cfg.TASKS_FILE);
}

function uuid() { return crypto.randomUUID(); }

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function sanitizeTaskForWebhook(task, taskAttDir) {
  const safe = {
    id: sanitizeUntrustedText(task.id, 80),
    title: sanitizeUntrustedText(task.title, 240),
    description: sanitizeUntrustedText(task.description || '', 1200),
    priority: sanitizeUntrustedText(task.priority || 'medium', 24) || 'medium',
    attachments: [],
  };
  try {
    if (!fs.existsSync(taskAttDir)) return safe;
    const files = fs.readdirSync(taskAttDir).filter(f => !f.startsWith('.'));
    for (const rawName of files.slice(0, 20)) {
      const name = sanitizeFilename(rawName);
      const fullPath = path.join(taskAttDir, rawName);
      let size = 0;
      try { size = fs.statSync(fullPath).size; } catch {}
      const ext = path.extname(name).toLowerCase();
      const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'].includes(ext);
      safe.attachments.push({ name, size, isImage });
    }
  } catch {}
  return safe;
}

function triggerTaskExecution(task) {
  const taskAttDir = path.join(cfg.ATTACHMENTS_DIR, task.id);
  const safeTask = sanitizeTaskForWebhook(task, taskAttDir);
  const attachmentLines = safeTask.attachments
    .map(f => `- ${f.isImage ? 'image' : 'file'}: ${f.name} (${formatFileSize(f.size)})`)
    .join('\n');
  const attachmentHint = safeTask.attachments.length
    ? `\nAttachments (metadata only):\n${attachmentLines}\nFetch real content via /tasks/${safeTask.id}/attachments/:filename endpoint.`
    : '\nNo attachments.';

  const message = `Execute this dashboard task immediately.\n\nTask (sanitized JSON):\n${JSON.stringify({
    id: safeTask.id, title: safeTask.title, description: safeTask.description, priority: safeTask.priority,
    attachments: safeTask.attachments.map(a => ({ name: a.name, isImage: a.isImage, size: a.size })),
  }, null, 2)}\n${attachmentHint}\n\nSteps:\n1. Update status to in-progress\n2. Execute the task\n3. Add result as note\n4. Mark done (or failed)`;

  const payload = JSON.stringify({
    message,
    sessionKey: `hook:dashboard:${task.id}`,
  });

  const req = http.request({
    hostname: '127.0.0.1', port: 18789, path: '/hooks/agent', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.HOOK_TOKEN}`, 'Content-Length': Buffer.byteLength(payload) },
    timeout: 10000,
  }, (res) => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => console.log(`[webhook] Task ${task.id}: ${res.statusCode}`));
  });
  req.on('error', e => console.error(`[webhook] Task ${task.id} failed:`, e.message));
  req.on('timeout', () => { req.destroy(); });
  req.write(payload);
  req.end();
}

// ── Task CRUD routes ────────────────────────────────────────────────
function register(router) {
  // List tasks
  router.add('GET', '/tasks', (req, res, q) => {
    let tasks = readTasks();
    if (q.status) tasks = tasks.filter(t => t.status === q.status);
    if (q.priority) tasks = tasks.filter(t => t.priority === q.priority);
    jsonReply(res, 200, tasks);
  });

  // Create task
  router.add('POST', '/tasks', async (req, res) => {
    try {
      const body = await readJsonBody(req);
      if (!body.title) return errorReply(res, 400, 'title required');
      const now = new Date().toISOString();
      const task = {
        id: uuid(), title: body.title, description: body.description || '', content: body.content || '',
        status: body.status || 'new', priority: body.priority || 'medium',
        assignee: body.assignee || 'main', createdAt: now, updatedAt: now,
        dueDate: body.dueDate || null, notes: [], source: body.source || 'dashboard',
      };
      const tasks = readTasks();
      tasks.push(task);
      writeTasks(tasks);
      if (task.status === 'new') triggerTaskExecution(task);
      jsonReply(res, 201, task);
    } catch (e) { errorReply(res, 400, e.message); }
  });

  // Get task by id
  router.add('GET', '/tasks/:id', (req, res) => {
    const id = req.params?.id;
    const tasks = readTasks();
    const task = tasks.find(t => t.id === id);
    if (!task) return errorReply(res, 404, 'Task not found');
    return jsonReply(res, 200, task);
  });

  // Update task by id
  router.add('PATCH', '/tasks/:id', async (req, res) => {
    try {
      const id = req.params?.id;
      const body = await readJsonBody(req);
      const tasks = readTasks();
      const idx = tasks.findIndex(t => t.id === id);
      if (idx < 0) return errorReply(res, 404, 'Task not found');

      const task = tasks[idx];
      const allowed = ['title', 'description', 'content', 'status', 'priority', 'assignee', 'dueDate', 'source'];
      for (const k of allowed) {
        if (Object.prototype.hasOwnProperty.call(body, k)) task[k] = body[k];
      }
      task.updatedAt = new Date().toISOString();
      tasks[idx] = task;
      writeTasks(tasks);
      return jsonReply(res, 200, task);
    } catch (e) {
      return errorReply(res, 400, e.message);
    }
  });

  // Delete task by id
  router.add('DELETE', '/tasks/:id', (req, res) => {
    const id = req.params?.id;
    const tasks = readTasks();
    const idx = tasks.findIndex(t => t.id === id);
    if (idx < 0) return errorReply(res, 404, 'Task not found');
    const [deleted] = tasks.splice(idx, 1);
    writeTasks(tasks);
    return jsonReply(res, 200, { ok: true, deleted: { id: deleted.id, title: deleted.title } });
  });

  // Add note
  router.add('POST', '/tasks/:id/notes', async (req, res) => {
    try {
      const id = req.params?.id;
      const body = await readJsonBody(req);
      const text = (body?.text || body?.content || '').trim();
      if (!text) return errorReply(res, 400, 'text required');

      const tasks = readTasks();
      const idx = tasks.findIndex(t => t.id === id);
      if (idx < 0) return errorReply(res, 404, 'Task not found');

      const note = {
        id: uuid(),
        text: sanitizeUntrustedText(text, 10000),
        createdAt: new Date().toISOString(),
      };
      tasks[idx].notes = Array.isArray(tasks[idx].notes) ? tasks[idx].notes : [];
      tasks[idx].notes.push(note);
      tasks[idx].updatedAt = new Date().toISOString();
      writeTasks(tasks);
      return jsonReply(res, 201, note);
    } catch (e) {
      return errorReply(res, 400, e.message);
    }
  });

  // Trigger sub-agent execution for one task
  router.add('POST', '/tasks/:id/spawn', (req, res) => {
    const id = req.params?.id;
    const tasks = readTasks();
    const task = tasks.find(t => t.id === id);
    if (!task) return errorReply(res, 404, 'Task not found');
    triggerTaskExecution(task);
    return jsonReply(res, 200, { ok: true, id: task.id, queued: true });
  });

  // Logs (task history + memory logs)
  router.add('GET', '/logs', (_req, res) => {
    try {
      const files = fs.readdirSync(cfg.MEMORY_DIR).filter(f => f.endsWith('.md')).sort().reverse();
      const logs = files.map(f => {
        const content = fs.readFileSync(path.join(cfg.MEMORY_DIR, f), 'utf8');
        const dateMatch = f.match(/^(\d{4}-\d{2}-\d{2})/);
        return { date: dateMatch ? dateMatch[1] : f.replace('.md', ''), filename: f, content };
      });
      jsonReply(res, 200, logs);
    } catch { jsonReply(res, 200, []); }
  });

  router.add('GET', '/logs/tasks', (_req, res) => {
    const tasks = readTasks();
    const history = tasks.filter(t => t.notes?.length).map(t => ({
      id: t.id, title: t.title, status: t.status, notes: t.notes,
    }));
    jsonReply(res, 200, history);
  });
}

module.exports = { register };
