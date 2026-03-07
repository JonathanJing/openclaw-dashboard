
/* Config Tab — Config Viewer, File Browser, Tasks Kanban */

async function loadConfig() {
  const el = document.getElementById('configContent');
  if (!el) return;
  try {
    const data = await apiFetch('/ops/config');
    const caps = data.capabilities || {};
    DASHBOARD_CAPS.mutatingOpsEnabled = !!caps.mutatingOpsEnabled;
    DASHBOARD_CAPS.mutatingOpsLoopbackOnly = caps.mutatingOpsLoopbackOnly !== false;
    DASHBOARD_CAPS.attachmentFilePathCopyEnabled = !!caps.attachmentFilePathCopyEnabled;
    applyCapabilitiesUI();
    const files = data.files || [];
    const cats = { core: '⚙️ Core Config', keys: '🔑 API Keys', personality: '🎭 Personality & Agents' };
    const grouped = {};
    files.forEach(f => {
      const cat = f.category || 'other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(f);
    });

    let html = '';
    for (const [cat, label] of Object.entries(cats)) {
      if (!grouped[cat]) continue;
      html += `<div class="card-title" style="margin:12px 0 8px">${label}</div>`;
      for (const f of grouped[cat]) {
        const id = 'cfg-' + f.label.replace(/[^a-z0-9]/gi, '-');
        const sizeKb = (f.size / 1024).toFixed(1);
        const modified = new Date(f.modified).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        html += `<div class="config-file">
          <div class="config-file-header" onclick="document.getElementById('${id}').classList.toggle('open')">
            <span>${escHtml(f.label)}<span class="config-cat ${cat}">${cat}</span></span>
            <span class="config-file-meta">${sizeKb}KB · ${modified}</span>
          </div>
          <div class="config-file-body" id="${id}"><pre>${escHtml(f.content)}</pre></div>
        </div>`;
      }
    }
    el.innerHTML = html;
  } catch (e) { el.innerHTML = `<p>${e.message}</p>`; }
}

// ─── Enhanced Cron ───

async function loadFileList() {
  const sidebar = document.getElementById('fileSidebar');
  // Load memory dir files
  try {
    const data = await apiFetch('/files?path=memory/&list=true');
    memoryFiles = Array.isArray(data) ? data : (data.files || []);
  } catch(e) { memoryFiles = []; }

  sidebar.innerHTML = WORKSPACE_FILES.map(f => `
    <div class="file-item ${currentFile === f ? 'active' : ''}" onclick="selectFile('${f}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span class="file-name">${f}</span>
    </div>
  `).join('') + (memoryFiles.length ? `
    <div class="file-divider"></div>
    <div class="file-sidebar-header">memory/</div>
    ${memoryFiles.map(f => {
      const path = typeof f === 'string' ? f : f.name || f.path || '';
      const name = path.split('/').pop();
      return `<div class="file-item indent ${currentFile === 'memory/' + name ? 'active' : ''}" onclick="selectFile('memory/${name}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span class="file-name">${escHtml(name)}</span>
      </div>`;
    }).join('')}
  ` : '');
}

async function selectFile(path) {
  currentFile = path;
  isEditMode = false;
  loadFileList();
  const ta = document.getElementById('editorTextarea');
  const preview = document.getElementById('mdPreview');
  const fname = document.getElementById('editorFilename');
  const saveBtn = document.getElementById('saveBtn');
  const editBtn = document.getElementById('editToggleBtn');
  const editLabel = document.getElementById('editToggleLabel');

  fname.innerHTML = `${escHtml(path)}`;
  preview.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text2)"><div class="spinner"></div><p style="margin-top:12px;font-size:.84rem">Loading…</p></div>';
  
  // Show preview mode by default
  preview.style.display = '';
  ta.style.display = 'none';
  saveBtn.style.display = 'none';
  editBtn.style.display = '';
  editBtn.classList.remove('editing');
  editLabel.textContent = 'Edit';

  try {
    const data = await apiFetch(`/files?path=${encodeURIComponent(path)}`);
    const content = typeof data === 'string' ? data : (data.content || JSON.stringify(data, null, 2));
    currentFileContent = content;
    ta.value = content;
    ta.disabled = false;
    saveBtn.disabled = false;
    renderMarkdownPreview(content);
  } catch(e) {
    currentFileContent = '';
    preview.innerHTML = `<div class="md-empty-hint"><p style="color:var(--red)">Error loading file: ${escHtml(e.message)}</p></div>`;
    saveBtn.disabled = true;
    editBtn.style.display = 'none';
  }
}

function renderMarkdownPreview(content) {
  const preview = document.getElementById('mdPreview');
  if (!content || !content.trim()) {
    preview.innerHTML = '<div class="md-empty-hint"><p>This file is empty</p></div>';
    return;
  }
  try {
    if (typeof marked !== 'undefined' && marked.parse) {
      preview.innerHTML = sanitizeHtml(marked.parse(content, { breaks: true, gfm: true }));
    } else {
      preview.innerHTML = renderMarkdown(content);
    }
  } catch(e) {
    preview.innerHTML = `<pre style="white-space:pre-wrap;color:var(--text2)">${escHtml(content)}</pre>`;
  }
}

function toggleEditMode() {
  isEditMode = !isEditMode;
  const ta = document.getElementById('editorTextarea');
  const preview = document.getElementById('mdPreview');
  const saveBtn = document.getElementById('saveBtn');
  const editBtn = document.getElementById('editToggleBtn');
  const editLabel = document.getElementById('editToggleLabel');

  if (isEditMode) {
    // Switch to edit mode
    ta.value = currentFileContent;
    ta.style.display = '';
    preview.style.display = 'none';
    saveBtn.style.display = '';
    editBtn.classList.add('editing');
    editLabel.textContent = 'Preview';
    ta.focus();
  } else {
    // Switch back to preview mode — pick up any edits
    currentFileContent = ta.value;
    ta.style.display = 'none';
    preview.style.display = '';
    saveBtn.style.display = 'none';
    editBtn.classList.remove('editing');
    editLabel.textContent = 'Edit';
    renderMarkdownPreview(currentFileContent);
  }
}

async function saveFile() {
  if (!currentFile) return;
  const btn = document.getElementById('saveBtn');
  const content = document.getElementById('editorTextarea').value;
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    await apiFetch(`/files?path=${encodeURIComponent(currentFile)}`, {
      method: 'PUT',
      body: JSON.stringify({ content })
    });
    currentFileContent = content;
    toast('File saved successfully', 'success');
  } catch(e) {
    toast(`Save failed: ${e.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}


// ═══ AGENT MONITOR ═══
let agentData = null;


let allTasks = [];
let currentFilter = 'all';
let expandedTaskId = null;
let _tasksHash = '';
let _livePollingId = null;
const LIVE_POLL_MS = 15000; // was 3000, reduced to avoid excessive polling // poll every 3 seconds

function _hashTasks(tasks) {
  // Fast hash: JSON of id+status+updatedAt+notes.length for each task
  return tasks.map(t => `${t.id}|${t.status}|${t.updatedAt}|${(t.notes||[]).length}`).join(';');
}

async function loadTasks(force) {
  const list = document.getElementById('taskList');
  if (!list) return;
  try {
    const data = await apiFetch('/tasks');
    const tasks = Array.isArray(data) ? data : (data.tasks || []);
    const newHash = _hashTasks(tasks);
    // Skip re-render if nothing changed (unless forced)
    if (!force && newHash === _tasksHash) return;
    _tasksHash = newHash;
    allTasks = tasks;
    const taskCountEl = document.getElementById('taskCount');
    if (taskCountEl) taskCountEl.textContent = allTasks.length;
    renderTasks();
    // If detail modal is open and user isn't editing content, refresh it
    if (detailTaskId && !isContentEditing) {
      const updated = allTasks.find(t => t.id === detailTaskId);
      if (updated) openDetailModal(detailTaskId);
    }
    // Flash the live indicator on data change
    _flashLiveIndicator();
  } catch(e) {
    list.innerHTML = `<div class="empty-state"><svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="36" fill="none" stroke="currentColor" stroke-width="2"/><path d="M28 28l24 24M52 28L28 52" stroke="currentColor" stroke-width="2"/></svg><h3>Unable to Load Tasks</h3><p>${e.message}</p><button class="action-btn primary" onclick="loadTasks(true)" style="margin:0 auto">Retry</button></div>`;
  }
}

function _flashLiveIndicator() {
  const el = document.getElementById('liveIndicator');
  if (!el) return;
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 600);
}

function startLivePolling() {
  if (_livePollingId) return;
  _livePollingId = setInterval(() => loadTasks(false), LIVE_POLL_MS);
  const el = document.getElementById('liveIndicator');
  if (el) el.classList.add('active');
}

function stopLivePolling() {
  if (_livePollingId) { clearInterval(_livePollingId); _livePollingId = null; }
  const el = document.getElementById('liveIndicator');
  if (el) el.classList.remove('active');
}

function toggleLivePolling() {
  if (_livePollingId) { stopLivePolling(); toast('Live updates paused', 'info'); }
  else { startLivePolling(); toast('Live updates enabled', 'info'); }
}

function renderTasks() {
  const list = document.getElementById('taskList');
  if (!list) return;
  const search = (document.getElementById('taskSearch').value || '').toLowerCase();
  let filtered = allTasks;
  if (currentFilter !== 'all') filtered = filtered.filter(t => (t.status || 'new') === currentFilter);
  if (search) filtered = filtered.filter(t => (t.title || '').toLowerCase().includes(search) || (t.description || '').toLowerCase().includes(search));

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 80 80"><rect x="16" y="12" width="48" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="28" y1="28" x2="52" y2="28" stroke="currentColor" stroke-width="1.5"/><line x1="28" y1="38" x2="48" y2="38" stroke="currentColor" stroke-width="1.5"/><line x1="28" y1="48" x2="44" y2="48" stroke="currentColor" stroke-width="1.5"/><circle cx="24" cy="28" r="2" fill="currentColor"/><circle cx="24" cy="38" r="2" fill="currentColor"/><circle cx="24" cy="48" r="2" fill="currentColor"/></svg>
      <h3>${currentFilter !== 'all' ? 'No matching tasks' : 'No tasks yet'}</h3>
      <p>${currentFilter !== 'all' ? 'Try a different filter or create a new task.' : 'Create your first task to get started with agent task management.'}</p>
      <button class="create-btn" onclick="openCreateModal()" style="margin:0 auto">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        New Task
      </button>
    </div>`;
    return;
  }

  list.innerHTML = filtered.map((task, i) => {
    const status = task.status || 'new';
    const priority = task.priority || 'medium';
    const isExpanded = expandedTaskId === task.id;
    const notes = task.notes || [];
    const date = task.createdAt ? new Date(task.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    const dueDate = task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    return `<div class="glass-card task-card status-${status} ${isExpanded ? 'expanded' : ''}" onclick="toggleTask('${task.id}')" style="animation:cardIn .4s ease backwards;animation-delay:${i * 0.05}s">
      <div class="task-header">
        <span class="task-title">${escHtml(task.title || 'Untitled')}</span>
        <span class="badge badge-${status}">${statusLabel(status)}</span>
        <span class="badge badge-priority ${priority}">${priority}</span>
      </div>
      <div class="task-meta">
        ${task.assignee ? `<span>👤 ${escHtml(task.assignee)}</span>` : ''}
        ${date ? `<span>📅 ${date}</span>` : ''}
        ${dueDate ? `<span>⏰ Due ${dueDate}</span>` : ''}
        ${notes.length ? `<span>📝 ${notes.length} note${notes.length > 1 ? 's' : ''}</span>` : ''}
        ${task.content ? '<span>📄 Content</span>' : ''}
      </div>
      <div class="task-body" onclick="event.stopPropagation()">
        ${task.description ? `<div class="task-description">${renderMarkdown(task.description)}</div>` : ''}
        ${task.content ? `<div class="task-content-preview" onclick="event.stopPropagation();this.classList.toggle('expanded')">
          <div class="task-content-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> Content</div>
          <div class="task-content-md">${renderFullMarkdown(task.content)}</div>
        </div>` : ''}
        <div class="task-actions">
          <button class="spawn-btn" onclick="spawnSingleTask('${task.id}')">⚡ Spawn</button>
          ${status !== 'in-progress' ? `<button class="action-btn primary" onclick="updateTaskStatus('${task.id}','in-progress')">▶ In Progress</button>` : ''}
          ${status !== 'done' ? `<button class="action-btn" onclick="updateTaskStatus('${task.id}','done')" style="border-color:rgba(45,212,160,0.3);color:var(--green)">✓ Done</button>` : ''}
          ${status !== 'failed' ? `<button class="action-btn danger" onclick="updateTaskStatus('${task.id}','failed')">✕ Failed</button>` : ''}
          ${status !== 'new' ? `<button class="action-btn" onclick="updateTaskStatus('${task.id}','new')">↩ Reset</button>` : ''}
        </div>
        <div class="notes-section">
          <div class="notes-title">Notes</div>
          <div class="notes-list">
            ${notes.length === 0 ? '<div style="font-size:.8rem;color:var(--text2);padding:4px 0 4px 16px;border-left:2px solid var(--border)">No notes yet</div>' : notes.map(n => `
              <div class="note-item">
                <span class="note-time">${n.createdAt ? new Date(n.createdAt).toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : ''}</span>
                <span class="note-text">${escHtml(n.text || n.content || '')}</span>
              </div>
            `).join('')}
          </div>
          <div class="add-note-row">
            <input type="text" class="note-input" id="note-${task.id}" placeholder="Add a note…" onkeydown="if(event.key==='Enter')addNote('${task.id}')">
            <button class="action-btn" onclick="addNote('${task.id}')">Add</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function statusLabel(s) {
  return { 'new': 'New', 'in-progress': 'In Progress', 'done': 'Done', 'failed': 'Failed' }[s] || s;
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function toggleTask(id) {
  openDetailModal(id);
}

async function updateTaskStatus(id, status) {
  try {
    await apiFetch(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    toast(`Task updated to ${statusLabel(status)}`, 'success');
    loadTasks(true);
  } catch(e) { toast(`Failed: ${e.message}`, 'error'); }
}

async function addNote(taskId) {
  const input = document.getElementById(`note-${taskId}`);
  const text = input?.value?.trim();
  if (!text) return;
  try {
    await apiFetch(`/tasks/${taskId}/notes`, { method: 'POST', body: JSON.stringify({ text }) });
    input.value = '';
    toast('Note added', 'success');
    loadTasks(true);
  } catch(e) { toast(`Failed: ${e.message}`, 'error'); }
}

// Filters (guarded for Ops view)
const _statusFilters = document.getElementById('statusFilters');
if (_statusFilters) {
  _statusFilters.addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('#statusFilters .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderTasks();
  });
}

const _taskSearch = document.getElementById('taskSearch');
if (_taskSearch) {
  _taskSearch.addEventListener('input', () => {
    renderTasks();
  });
}

function openCreateModal() {
  document.getElementById('createModal').classList.add('show');
  document.getElementById('newTitle').focus();
}

function closeCreateModal() {
  document.getElementById('createModal').classList.remove('show');
  ['newTitle', 'newDesc', 'newContent', 'newDueDate'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('newPriority').value = 'medium';
  document.getElementById('newAssignee').value = 'main';
}

async function createTask() {
  const title = document.getElementById('newTitle').value.trim();
  if (!title) { toast('Title is required', 'error'); return; }

  const btn = document.getElementById('createTaskBtn');
  btn.disabled = true;
  btn.textContent = 'Creating…';

  const payload = {
    title,
    description: document.getElementById('newDesc').value.trim(),
    content: document.getElementById('newContent').value.trim(),
    priority: document.getElementById('newPriority').value,
    assignee: document.getElementById('newAssignee').value,
    status: 'new'
  };
  const due = document.getElementById('newDueDate').value;
  if (due) payload.dueDate = due;

  try {
    await apiFetch('/tasks', { method: 'POST', body: JSON.stringify(payload) });
    toast('Task created!', 'success');
    closeCreateModal();
    loadTasks(true);
  } catch(e) {
    toast(`Failed: ${e.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Task';
  }
}

// Close modal on overlay click
document.getElementById('createModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeCreateModal();
});

// ═══ KANBAN VIEW ═══
let taskView = localStorage.getItem('taskView') || 'list';

function setTaskView(view) {
  taskView = view;
  localStorage.setItem('taskView', view);
  document.querySelectorAll('#taskViewToggle button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const listEl = document.getElementById('taskList');
  const kanbanEl = document.getElementById('kanbanBoard');
  const filtersEl = document.getElementById('statusFilters');
  if (!listEl || !kanbanEl || !filtersEl) return;
  if (view === 'kanban') {
    listEl.style.display = 'none';
    kanbanEl.style.display = '';
    filtersEl.style.display = 'none';
    renderKanban();
  } else {
    listEl.style.display = '';
    kanbanEl.style.display = 'none';
    filtersEl.style.display = '';
    renderTasks();
  }
}

const KANBAN_COLUMNS = [
  { status: 'new', label: 'New' },
  { status: 'in-progress', label: 'In Progress' },
  { status: 'done', label: 'Done' },
  { status: 'failed', label: 'Failed' }
];

function renderKanban() {
  const board = document.getElementById('kanbanBoard');
  const search = (document.getElementById('taskSearch').value || '').toLowerCase();
  let filtered = allTasks;
  if (search) filtered = filtered.filter(t => (t.title || '').toLowerCase().includes(search) || (t.description || '').toLowerCase().includes(search));

  board.innerHTML = KANBAN_COLUMNS.map(col => {
    const colTasks = filtered.filter(t => (t.status || 'new') === col.status);
    return `<div class="kanban-column" data-status="${col.status}"
                 ondragover="kanbanDragOver(event)" ondragleave="kanbanDragLeave(event)" ondrop="kanbanDrop(event)">
      <div class="kanban-col-header">
        <div class="kanban-col-title">
          <span class="col-dot ${col.status}"></span>
          ${col.label}
        </div>
        <span class="kanban-col-count">${colTasks.length}</span>
      </div>
      <div class="kanban-col-body${colTasks.length === 0 ? ' empty-drop' : ''}">
        ${colTasks.length === 0
          ? '<div class="drop-hint">Drop tasks here</div>'
          : colTasks.map(task => renderKanbanCard(task)).join('')}
      </div>
    </div>`;
  }).join('');

  // Add mobile horizontal scroll class
  if (window.innerWidth <= 768) board.classList.add('horizontal-scroll');
  else board.classList.remove('horizontal-scroll');
}

function renderKanbanCard(task) {
  const status = task.status || 'new';
  const priority = task.priority || 'medium';
  return `<div class="kanban-card status-${status}" draggable="true"
               data-task-id="${task.id}"
               ondragstart="kanbanDragStart(event)" ondragend="kanbanDragEnd(event)"
               onclick="kanbanCardClick('${task.id}')">
    <div class="kanban-card-title">${escHtml(task.title || 'Untitled')}</div>
    <div class="kanban-card-footer">
      <span class="badge badge-priority ${priority}">${priority}</span>
      ${task.notes && task.notes.length ? `<span style="font-size:.68rem;color:var(--text2)">📝${task.notes.length}</span>` : ''}
      ${task.assignee ? `<span class="kanban-card-assignee">👤 ${escHtml(task.assignee)}</span>` : ''}
    </div>
  </div>`;
}

// ─── Drag & Drop ───
let draggedTaskId = null;

function kanbanDragStart(e) {
  draggedTaskId = e.target.dataset.taskId;
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedTaskId);
}

function kanbanDragEnd(e) {
  e.target.classList.remove('dragging');
  draggedTaskId = null;
  document.querySelectorAll('.kanban-column').forEach(c => c.classList.remove('drag-over'));
}

function kanbanDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const col = e.target.closest('.kanban-column');
  if (col) col.classList.add('drag-over');
}

function kanbanDragLeave(e) {
  const col = e.target.closest('.kanban-column');
  if (col && !col.contains(e.relatedTarget)) col.classList.remove('drag-over');
}

async function kanbanDrop(e) {
  e.preventDefault();
  const col = e.target.closest('.kanban-column');
  if (!col) return;
  col.classList.remove('drag-over');
  const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
  const newStatus = col.dataset.status;
  if (!taskId || !newStatus) return;
  const task = allTasks.find(t => t.id === taskId);
  if (!task || (task.status || 'new') === newStatus) return;
  try {
    await apiFetch(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
    task.status = newStatus;
    toast(`Task moved to ${statusLabel(newStatus)}`, 'success');
    renderKanban();
  } catch(err) {
    toast(`Failed: ${err.message}`, 'error');
  }
}

function kanbanCardClick(taskId) {
  openDetailModal(taskId);
}

// ═══ TASK DETAIL MODAL ═══
let detailTaskId = null;

function openDetailModal(taskId) {
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;
  detailTaskId = taskId;

  const status = task.status || 'new';
  const priority = task.priority || 'medium';
  const created = task.createdAt ? new Date(task.createdAt) : null;
  const updated = task.updatedAt ? new Date(task.updatedAt) : null;
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const notes = task.notes || [];

  // Separate agent output notes from status/regular notes
  const statusNotes = [];
  const outputNotes = [];
  const regularNotes = [];
  notes.forEach(n => {
    const txt = n.text || n.content || '';
    if (txt.startsWith('Status changed')) statusNotes.push(n);
    else if (txt.length > 150) outputNotes.push(n);
    else regularNotes.push(n);
  });

  // Header
  document.getElementById('detailStatusRow').innerHTML = `
    <span class="badge badge-${status}">${statusLabel(status)}</span>
    <span class="badge badge-priority ${priority}">${priority}</span>
    ${task.source ? `<span class="badge" style="background:rgba(139,148,158,0.1);color:var(--text2);border:1px solid var(--border)">${escHtml(task.source)}</span>` : ''}
  `;
  document.getElementById('detailTitle').textContent = task.title || 'Untitled';
  document.getElementById('detailMeta').innerHTML = `
    ${task.assignee ? `<span>👤 ${escHtml(task.assignee)}</span>` : ''}
    ${created ? `<span>📅 Created ${created.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>` : ''}
    ${updated ? `<span>🔄 Updated ${timeAgo(updated)}</span>` : ''}
    ${due ? `<span>⏰ Due ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>` : ''}
  `;

  // Body
  let bodyHtml = '';

  // Description section
  if (task.description) {
    bodyHtml += `
    <div class="detail-section">
      <div class="detail-section-title" onclick="this.classList.toggle('collapsed')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
        Description
      </div>
      <div class="detail-section-content">
        <div class="detail-description">${renderMarkdown(task.description)}</div>
      </div>
    </div>`;
  }

  // Content section (rich markdown field)
  bodyHtml += `
  <div class="detail-content-section">
    <div class="detail-content-area" id="detailContentArea">
      <div class="detail-content-header">
        <span class="content-label">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          Content <span style="font-weight:400;font-size:.68rem;color:var(--text2);letter-spacing:0;text-transform:none;margin-left:4px">Markdown</span>
        </span>
        <div class="detail-content-actions">
          <button class="content-edit-btn" id="contentEditBtn" onclick="toggleContentEdit()">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:3px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit
          </button>
          <button class="content-save-btn" id="contentSaveBtn" onclick="saveTaskContent()" style="display:none">Save</button>
        </div>
      </div>
      <div class="detail-content-md" id="detailContentMd">
        ${task.content ? renderFullMarkdown(task.content) : `<div class="detail-content-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          No content yet — click Edit to add markdown content
        </div>`}
      </div>
      <textarea class="detail-content-textarea" id="detailContentTextarea" placeholder="# Write your content here…&#10;&#10;Supports **bold**, *italic*, \`code\`, lists, tables, and more." style="display:none">${escHtml(task.content || '')}</textarea>
    </div>
  </div>`;

  // Agent Output section (long notes = agent results)
  if (outputNotes.length > 0) {
    bodyHtml += `
    <div class="detail-section">
      <div class="detail-section-title" onclick="this.classList.toggle('collapsed')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
        Agent Output <span style="font-weight:400;font-size:.7rem;color:var(--accent2)">${outputNotes.length} result${outputNotes.length > 1 ? 's' : ''}</span>
      </div>
      <div class="detail-section-content">
        ${outputNotes.map((n, i) => {
          const txt = n.text || n.content || '';
          const time = n.timestamp || n.createdAt;
          const escaped = txt.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '');
          return `<div class="detail-output" style="${i > 0 ? 'margin-top:10px' : ''}">
            <div class="detail-output-header">
              <span>🤖 Output${time ? ' · ' + new Date(time).toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : ''}</span>
              <button class="detail-output-copy" onclick="copyOutput(this, '${escaped}')">Copy</button>
            </div>
            <div class="detail-output-body">${renderMarkdown(txt)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  // Activity / Comments section (regular + status notes combined)
  const activityNotes = [...regularNotes, ...statusNotes].sort((a, b) => {
    const ta = new Date(a.timestamp || a.createdAt || 0).getTime();
    const tb = new Date(b.timestamp || b.createdAt || 0).getTime();
    return tb - ta;
  });

  bodyHtml += `
  <div class="detail-section">
    <div class="detail-section-title" onclick="this.classList.toggle('collapsed')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
      Activity & Comments <span style="font-weight:400;font-size:.7rem;color:var(--text2)">${activityNotes.length}</span>
    </div>
    <div class="detail-section-content">
      <div class="detail-notes" id="detailNotes">
        ${activityNotes.length === 0 ? '<div style="font-size:.82rem;color:var(--text2);padding:12px 0">No activity yet</div>' : activityNotes.map(n => {
          const txt = n.text || n.content || '';
          const time = n.timestamp || n.createdAt;
          const isStatus = txt.startsWith('Status changed');
          const isLong = txt.length > 200;
          const noteId = 'dn-' + Math.random().toString(36).slice(2, 8);
          return `<div class="detail-note ${isStatus ? 'is-status' : ''}">
            <div class="detail-note-time">${time ? new Date(time).toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : ''}</div>
            <div class="detail-note-text ${isLong ? 'truncated' : ''}" id="${noteId}">${escHtml(txt)}</div>
            ${isLong ? `<span class="detail-note-expand" onclick="toggleNoteExpand('${noteId}', this)">Show more</span>` : ''}
          </div>`;
        }).join('')}
      </div>
      <div class="detail-add-note">
        <input type="text" class="detail-note-input" id="detailNoteInput" placeholder="Add a comment…" onkeydown="if(event.key==='Enter')addDetailNote()">
        <button class="action-btn primary" onclick="addDetailNote()">Add</button>
      </div>
    </div>
  </div>`;

  document.getElementById('detailBody').innerHTML = bodyHtml;

  // Actions footer
  document.getElementById('detailActions').innerHTML = `
    <button class="spawn-btn" onclick="spawnSingleTask('${taskId}')">⚡ Run as Sub-Agent</button>
    ${status !== 'in-progress' ? '<button class="action-btn primary" onclick="detailUpdateStatus(\'in-progress\')">▶ In Progress</button>' : ''}
    ${status !== 'done' ? '<button class="action-btn" style="border-color:rgba(45,212,160,0.3);color:var(--green)" onclick="detailUpdateStatus(\'done\')">✓ Done</button>' : ''}
    ${status !== 'failed' ? '<button class="action-btn danger" onclick="detailUpdateStatus(\'failed\')">✕ Failed</button>' : ''}
    ${status !== 'new' ? '<button class="action-btn" onclick="detailUpdateStatus(\'new\')">↩ Reset</button>' : ''}
    <span style="flex:1"></span>
    <button class="action-btn danger" onclick="deleteTaskConfirm('${taskId}')">🗑 Delete</button>
  `;

  document.getElementById('detailModal').classList.add('show');
}

function closeDetailModal() {
  document.getElementById('detailModal').classList.remove('show');
  detailTaskId = null;
  isContentEditing = false;
}

async function detailUpdateStatus(newStatus) {
  if (!detailTaskId) return;
  try {
    await apiFetch('/tasks/' + detailTaskId, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
    toast('Task updated to ' + statusLabel(newStatus), 'success');
    await loadTasks(true);
    // Detail modal will be auto-refreshed by loadTasks when detailTaskId is set
  } catch(e) { toast('Failed: ' + e.message, 'error'); }
}

async function addDetailNote() {
  if (!detailTaskId) return;
  const input = document.getElementById('detailNoteInput');
  const text = input?.value?.trim();
  if (!text) return;
  try {
    await apiFetch('/tasks/' + detailTaskId + '/notes', { method: 'POST', body: JSON.stringify({ text }) });
    input.value = '';
    toast('Comment added', 'success');
    await loadTasks(true);
    setTimeout(() => {
      const body = document.getElementById('detailBody');
      if (body) body.scrollTop = body.scrollHeight;
    }, 100);
  } catch(e) { toast('Failed: ' + e.message, 'error'); }
}

async function deleteTask(taskId) {
  try {
    await apiFetch('/tasks/' + taskId, { method: 'DELETE' });
    toast('Task deleted', 'success');
    closeDetailModal();
    loadTasks(true);
  } catch(e) { toast('Failed: ' + e.message, 'error'); }
}

function toggleNoteExpand(noteId, btn) {
  const el = document.getElementById(noteId);
  if (!el) return;
  el.classList.toggle('truncated');
  btn.textContent = el.classList.contains('truncated') ? 'Show more' : 'Show less';
}

function copyOutput(btn, text) {
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  }).catch(() => toast('Copy failed', 'error'));
}

// ─── Content Edit/Save ───
let isContentEditing = false;

function toggleContentEdit() {
  isContentEditing = !isContentEditing;
  const mdView = document.getElementById('detailContentMd');
  const textarea = document.getElementById('detailContentTextarea');
  const editBtn = document.getElementById('contentEditBtn');
  const saveBtn = document.getElementById('contentSaveBtn');

  if (isContentEditing) {
    mdView.style.display = 'none';
    textarea.style.display = '';
    textarea.focus();
    editBtn.classList.add('active');
    editBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:3px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Preview';
    saveBtn.style.display = '';
  } else {
    // Update preview with current textarea content
    const content = textarea.value;
    mdView.innerHTML = content.trim()
      ? renderFullMarkdown(content)
      : '<div class="detail-content-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>No content yet — click Edit to add markdown content</div>';
    mdView.style.display = '';
    textarea.style.display = 'none';
    editBtn.classList.remove('active');
    editBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:3px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit';
    saveBtn.style.display = 'none';
  }
}

async function saveTaskContent() {
  if (!detailTaskId) return;
  const textarea = document.getElementById('detailContentTextarea');
  const content = textarea.value;
  const saveBtn = document.getElementById('contentSaveBtn');
  saveBtn.textContent = 'Saving…';
  saveBtn.disabled = true;
  try {
    await apiFetch('/tasks/' + detailTaskId, { method: 'PATCH', body: JSON.stringify({ content }) });
    toast('Content saved!', 'success');
    // Update local task data
    const task = allTasks.find(t => t.id === detailTaskId);
    if (task) task.content = content;
    // Switch back to preview
    if (isContentEditing) toggleContentEdit();
    // Refresh the list/kanban behind the modal
    if (taskView === 'kanban') renderKanban(); else renderTasks();
  } catch(e) {
    toast('Save failed: ' + e.message, 'error');
  } finally {
    saveBtn.textContent = 'Save';
    saveBtn.disabled = false;
  }
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

document.getElementById('detailModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeDetailModal();
});

// Restore view on load
if (taskView === 'kanban') {
  document.querySelectorAll('#taskViewToggle button').forEach(b => b.classList.toggle('active', b.dataset.view === 'kanban'));
}

// ═══ DOCUMENTS ═══
const WORKSPACE_FILES = ['MEMORY.md', 'SOUL.md', 'USER.md', 'AGENTS.md', 'TOOLS.md', 'IDENTITY.md', 'HEARTBEAT.md'];
let currentFile = null;
let memoryFiles = [];
let isEditMode = false;
let currentFileContent = '';

