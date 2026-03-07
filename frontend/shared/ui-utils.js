
/* Shared UI Utilities — Tab management, toast, markdown */

function loadOperationsStatus() {
  if (_watchdogCache) renderWatchdogStatus(_watchdogCache);
  pollWatchdogStatus();
}

function refreshCurrentTab() {
  window._forceNoCache = true;
  setTimeout(() => window._forceNoCache = false, 1000);
  const active = document.querySelector('.tab-btn.active');
  if (active) active.click();
  checkConnection();
  loadAgentMonitor();
}

// ─── Toast ───
function toast(message, type = 'info') {
  const c = document.getElementById('toastContainer');
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${message}</span>`;
  c.appendChild(t);
  setTimeout(() => { if (t.parentNode) t.remove(); }, 3500);
}

// ─── Simple Markdown ───
function renderMarkdown(text) {
  if (!text) return '';
  let html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  return `<p>${html}</p>`;
}

// ─── Full Markdown (using marked.js library + DOMPurify) ───
function sanitizeHtml(html) {
  if (typeof DOMPurify !== 'undefined') return DOMPurify.sanitize(html);
  // Fallback: strip all tags
  const d = document.createElement('div'); d.textContent = html; return d.innerHTML;
}
function renderFullMarkdown(text) {
  if (!text) return '';
  try {
    if (typeof marked !== 'undefined' && marked.parse) {
      return sanitizeHtml(marked.parse(text, { breaks: true, gfm: true }));
    }
  } catch(e) { /* fallback */ }
  return renderMarkdown(text);
}

// ═══ TASKS ═══
