
/* Boot & Init — runs after all tab modules loaded */

async function opsAction(action) {
  if (!DASHBOARD_CAPS.mutatingOpsEnabled && ['backup', 'restore', 'updateOpenClaw'].includes(action)) {
    toast('This operation is disabled by server policy.', 'error');
    return;
  }
  const btnMap = { backup: 'btnBackup', restore: 'btnRestore', updateOpenClaw: 'btnUpdateOpenClaw', restart: 'btnRestart' };
  const badgeMap = { backup: 'badgeBackup', restore: 'badgeRestore', updateOpenClaw: 'badgeUpdateOpenClaw', restart: 'badgeRestart' };
  const btn = document.getElementById(btnMap[action]);
  const badge = document.getElementById(badgeMap[action]);
  const resultBox = document.getElementById('opsMgmtResult');
  const resultInner = document.getElementById('opsMgmtResultInner');

  if (badge) badge.textContent = '⏳';
  if (btn) btn.classList.add('loading');
  if (resultBox) resultBox.style.display = 'none';

  try {
    let html = '';

    if (action === 'restart') {
      const r = await apiFetch('/ops/restart', { method: 'POST' });
      if (r?.error) throw new Error(r.error);
      if (badge) badge.textContent = '✅';
      html = '<span style="color:var(--green)">✅ Restart signal sent to OpenClaw gateway.</span>';

    } else if (action === 'backup') {
      const data = await apiFetch('/backup', { method: 'POST' });
      if (!data.ok) throw new Error(data.error || data.push?.error || 'backup failed');
      if (badge) badge.textContent = '✅';
      html = `<span style="color:var(--green)">✅ Backup + push completed.</span>
        <div class="ops-cost-row"><span class="ops-cost-label">Remote</span><span class="ops-cost-value">${escHtml(data.push?.remote || 'n/a')}</span></div>
        <div class="ops-cost-row"><span class="ops-cost-label">Branch</span><span class="ops-cost-value">${escHtml(data.push?.branch || 'n/a')}</span></div>
        <pre style="margin-top:8px;font-size:.75rem;color:var(--text2);white-space:pre-wrap;word-break:break-all">${escHtml(data.output || '')}</pre>`;

    } else if (action === 'restore') {
      const ok = await confirmDialog('Load latest auto-backup now? This will overwrite current workspace changes.');
      if (!ok) {
        if (badge) badge.textContent = '';
        html = '<span style="color:var(--text2)">Canceled.</span>';
      } else {
        const data = await apiFetch('/backup/load', { method: 'POST' });
        if (badge) badge.textContent = '✅';
        html = `<span style="color:var(--green)">✅ Backup loaded.</span>
          <div class="ops-cost-row"><span class="ops-cost-label">Commit</span><span class="ops-cost-value">${escHtml((data.restoredCommit || '').slice(0, 12) || 'n/a')}</span></div>
          <pre style="margin-top:8px;font-size:.75rem;color:var(--text2);white-space:pre-wrap;word-break:break-all">${escHtml(data.output || '')}</pre>`;
      }
    } else if (action === 'updateOpenClaw') {
      const ok = await confirmDialog('Run OpenClaw update now? This will write memory, backup, push, then update.');
      if (!ok) {
        if (badge) badge.textContent = '';
        html = '<span style="color:var(--text2)">Canceled.</span>';
      } else {
        const data = await apiFetch('/ops/update-openclaw', { method: 'POST' });
        if (!data.ok) throw new Error('Update flow failed. See details below.');
        if (badge) badge.textContent = '✅';
        const stepRows = (data.steps || []).map(s =>
          `<div class="ops-cost-row"><span class="ops-cost-label">${escHtml(s.step || 'step')}</span><span class="ops-cost-value">${s.ok ? '✅ ok' : '❌ failed'}</span></div>`
        ).join('');
        const updateStep = (data.steps || []).find(s => s.step === 'update_openclaw') || {};
        html = `<span style="color:var(--green)">✅ OpenClaw updated successfully.</span>
          ${stepRows}
          <div class="ops-cost-row"><span class="ops-cost-label">Before</span><span class="ops-cost-value">${escHtml(updateStep.beforeVersion || 'n/a')}</span></div>
          <div class="ops-cost-row"><span class="ops-cost-label">After</span><span class="ops-cost-value">${escHtml(updateStep.afterVersion || 'n/a')}</span></div>
          <pre style="margin-top:8px;font-size:.75rem;color:var(--text2);white-space:pre-wrap;word-break:break-all">${escHtml(updateStep.output || '')}</pre>`;
      }
    }

    if (resultInner) resultInner.innerHTML = html;
    if (resultBox) resultBox.style.display = 'block';
  } catch (e) {
    if (badge) badge.textContent = '❌';
    if (resultInner) resultInner.innerHTML = `<span style="color:var(--red)">❌ ${escHtml(e.message)}</span>`;
    if (resultBox) resultBox.style.display = 'block';
  } finally {
    if (btn) btn.classList.remove('loading');
    pollWatchdogStatus();
  }
}

// ─── Week Navigation ───
let _weekAllDaily = [];
let _weekOffset = 0; // 0 = current week, -1 = last week, etc.

function initWeekNav(allDaily) {
  _weekAllDaily = allDaily;
  _weekOffset = 0;
  const prevBtn = document.getElementById('weekPrev');
  const nextBtn = document.getElementById('weekNext');
  if (prevBtn) prevBtn.onclick = () => { _weekOffset--; renderWeekView(); };
  if (nextBtn) nextBtn.onclick = () => { _weekOffset++; renderWeekView(); };
  renderWeekView();
}

function getWeekSlice(allDaily, offset) {
  // Get the Monday-Sunday week based on offset from current week
  const today = new Date();
  // Find this week's Monday (in local PST context)
  const pstNow = new Date(today.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const dayOfWeek = pstNow.getDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const thisMonday = new Date(pstNow);
  thisMonday.setDate(pstNow.getDate() + mondayOffset + (offset * 7));
  thisMonday.setHours(0, 0, 0, 0);

  const thisSunday = new Date(thisMonday);
  thisSunday.setDate(thisMonday.getDate() + 6);

  const fmtDate = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const startStr = fmtDate(thisMonday);
  const endStr = fmtDate(thisSunday);

  // Build full 7-day array (fill missing days with zeros)
  const result = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(thisMonday);
    d.setDate(thisMonday.getDate() + i);
    const dateStr = fmtDate(d);
    const existing = allDaily.find(x => x.date === dateStr);
    result.push(existing || { date: dateStr, tokens: 0, cost: 0, models: {}, modelCosts: {} });
  }

  return { days: result, startStr, endStr, monday: thisMonday };
}

function renderWeekView() {
  const { days, startStr, endStr, monday } = getWeekSlice(_weekAllDaily, _weekOffset);
  const label = document.getElementById('weekLabel');
  const prevBtn = document.getElementById('weekPrev');
  const nextBtn = document.getElementById('weekNext');

  // Check bounds
  const oldestDate = _weekAllDaily.length > 0 ? _weekAllDaily[0].date : startStr;
  const hasPrev = startStr > oldestDate;
  const hasNext = _weekOffset < 0;

  if (prevBtn) prevBtn.disabled = !hasPrev;
  if (nextBtn) nextBtn.disabled = !hasNext;

  // Label
  if (label) {
    if (_weekOffset === 0) {
      label.textContent = `This Week · ${startStr.slice(5)} – ${endStr.slice(5)}`;
    } else {
      // Show week range
      const weekNum = Math.abs(_weekOffset);
      label.textContent = `${startStr.slice(5)} – ${endStr.slice(5)}`;
    }
  }

  // Render charts
  const canvas = document.getElementById('dailyChart');
  if (canvas && days.length > 0) drawDailyChart(canvas, days);
  const costCanvas = document.getElementById('dailyCostChart');
  if (costCanvas && days.length > 0) {
    drawDailyCostChart(costCanvas, days);
    renderCostHeatmap(days);
  }

  // Week totals
  const weekTokens = days.reduce((s, d) => s + (d.tokens || 0), 0);
  const weekCost = days.reduce((s, d) => s + (d.cost || 0), 0);
  const titleEl = document.getElementById('dailyChartTitle');
  if (titleEl) titleEl.textContent = `Daily Tokens · ${fmtTokens(weekTokens)} total`;
  const costTitleEl = document.getElementById('dailyCostTitle');
  if (costTitleEl) costTitleEl.textContent = `Daily Cost · $${weekCost.toFixed(2)} total`;
}

function drawDailyChart(canvas, daily) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width, H = rect.height;
  const pad = { top: 10, right: 10, bottom: 24, left: 50 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;

  const maxTokens = Math.max(...daily.map(d => d.tokens), 1);
  const barW = Math.max(4, (cW / daily.length) - 2);

  // Collect all models across days
  const allModels = new Set();
  daily.forEach(d => Object.keys(d.models || {}).forEach(m => { if ((d.models[m] || 0) > 0) allModels.add(m); }));
  const modelList = [...allModels].sort((a, b) => {
    const ta = daily.reduce((s, d) => s + (d.models?.[a] || 0), 0);
    const tb = daily.reduce((s, d) => s + (d.models?.[b] || 0), 0);
    return tb - ta;
  });

  ctx.clearRect(0, 0, W, H);

  // Grid lines
  ctx.strokeStyle = '#1a1f2e';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (cH * i / 4);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
  }

  // Stacked bars by model
  daily.forEach((d, i) => {
    const x = pad.left + (i * cW / daily.length) + 1;
    let yOffset = pad.top + cH; // bottom

    modelList.forEach(m => {
      const t = d.models?.[m] || 0;
      if (t <= 0) return;
      const h = (t / maxTokens) * cH;
      yOffset -= h;
      ctx.fillStyle = getModelColor(m);
      ctx.beginPath();
      ctx.roundRect(x, yOffset, barW, h, 1);
      ctx.fill();
    });

    // Token count above bar
    if (d.tokens > 0) {
      ctx.fillStyle = '#c9d1d9';
      ctx.font = 'bold 9px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(fmtTokens(d.tokens), x + barW / 2, yOffset - 3);
    }

    // Date label
    ctx.fillStyle = '#8b949e';
    ctx.font = '9px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(d.date.slice(5), x + barW / 2, pad.top + cH + 14);
  });

  // Y-axis labels
  ctx.fillStyle = '#8b949e';
  ctx.font = '9px -apple-system, sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const val = maxTokens * (4 - i) / 4;
    const y = pad.top + (cH * i / 4) + 3;
    ctx.fillText(fmtTokens(val), pad.left - 6, y);
  }

  // Legend below chart
  const legendEl = canvas.parentElement?.querySelector('.chart-legend');
  if (legendEl) {
    legendEl.innerHTML = modelList.map(m =>
      `<span class="ops-model-legend-item"><span class="ops-model-dot" style="background:${getModelColor(m)}"></span>${shortModel(m)}</span>`
    ).join('');
  }
}

function renderCostHeatmap(daily) {
  const el = document.getElementById('costHeatmap');
  if (!el || !daily.length) return;

  // Collect all models with cost > 0
  const allModels = new Set();
  daily.forEach(d => Object.entries(d.modelCosts || {}).forEach(([m, c]) => { if (c > 0.01) allModels.add(m); }));
  const models = [...allModels].sort((a, b) => {
    const ta = daily.reduce((s, d) => s + (d.modelCosts?.[a] || 0), 0);
    const tb = daily.reduce((s, d) => s + (d.modelCosts?.[b] || 0), 0);
    return tb - ta;
  });

  // Find max cell value for heat coloring
  let maxCell = 0;
  daily.forEach(d => models.forEach(m => { maxCell = Math.max(maxCell, d.modelCosts?.[m] || 0); }));

  function heatBg(val) {
    if (val < 0.01) return 'transparent';
    const intensity = Math.min(val / maxCell, 1);
    // From dark to bright: low=dim, high=vivid
    const alpha = 0.15 + intensity * 0.65;
    return `rgba(124, 92, 252, ${alpha.toFixed(2)})`;
  }

  function fmtCost(v) {
    if (v < 0.01) return '—';
    if (v < 1) return '$' + v.toFixed(2);
    return '$' + v.toFixed(0);
  }

  // Header: Model | Day1 | Day2 | ... | Total
  let html = '<table><thead><tr><th></th>';
  daily.forEach(d => { html += `<th>${d.date.slice(5)}</th>`; });
  html += '<th>Total</th></tr></thead><tbody>';

  // Rows: one per model
  models.forEach(m => {
    html += `<tr><td><span class="ops-model-dot" style="background:${getModelColor(m)};display:inline-block;margin-right:4px;vertical-align:middle"></span>${shortModel(m)}</td>`;
    let rowTotal = 0;
    daily.forEach(d => {
      const v = d.modelCosts?.[m] || 0;
      rowTotal += v;
      html += `<td><span class="heat-cell" style="background:${heatBg(v)}">${fmtCost(v)}</span></td>`;
    });
    html += `<td><strong>${fmtCost(rowTotal)}</strong></td></tr>`;
  });

  // Total row
  html += '<tr class="total-row"><td>Total</td>';
  let grandTotal = 0;
  daily.forEach(d => {
    const dayTotal = d.cost || 0;
    grandTotal += dayTotal;
    html += `<td><strong>${fmtCost(dayTotal)}</strong></td>`;
  });
  html += `<td><strong>${fmtCost(grandTotal)}</strong></td></tr>`;

  html += '</tbody></table>';
  el.innerHTML = html;
}

function drawDailyCostChart(canvas, daily) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width, H = rect.height;
  const pad = { top: 14, right: 10, bottom: 24, left: 50 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;

  // Collect models sorted by total cost
  const allModels = new Set();
  daily.forEach(d => Object.keys(d.modelCosts || {}).forEach(m => { if ((d.modelCosts[m] || 0) > 0) allModels.add(m); }));
  const modelList = [...allModels].sort((a, b) => {
    const ta = daily.reduce((s, d) => s + (d.modelCosts?.[a] || 0), 0);
    const tb = daily.reduce((s, d) => s + (d.modelCosts?.[b] || 0), 0);
    return tb - ta;
  });

  const maxCost = Math.max(...daily.map(d => d.cost || 0), 1);
  const barW = Math.max(4, (cW / daily.length) - 2);

  ctx.clearRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = '#1a1f2e';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (cH * i / 4);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
  }

  // Stacked cost bars
  daily.forEach((d, i) => {
    const x = pad.left + (i * cW / daily.length) + 1;
    let yOffset = pad.top + cH;

    modelList.forEach(m => {
      const c = d.modelCosts?.[m] || 0;
      if (c <= 0) return;
      const h = (c / maxCost) * cH;
      yOffset -= h;
      ctx.fillStyle = getModelColor(m);
      ctx.beginPath();
      ctx.roundRect(x, yOffset, barW, h, 1);
      ctx.fill();
    });

    // Total cost label above bar
    if ((d.cost || 0) > 0) {
      ctx.fillStyle = '#c9d1d9';
      ctx.font = 'bold 9px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$' + (d.cost).toFixed(0), x + barW / 2, yOffset - 3);
    }

    // Date label
    ctx.fillStyle = '#8b949e';
    ctx.font = '9px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(d.date.slice(5), x + barW / 2, pad.top + cH + 14);
  });

  // Y-axis (dollar)
  ctx.fillStyle = '#8b949e';
  ctx.font = '9px -apple-system, sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const val = maxCost * (4 - i) / 4;
    const y = pad.top + (cH * i / 4) + 3;
    ctx.fillText('$' + val.toFixed(0), pad.left - 6, y);
  }

  // Legend
  const legendEl = canvas.parentElement?.querySelector('.chart-cost-legend');
  if (legendEl) {
    legendEl.innerHTML = modelList.map(m =>
      `<span class="ops-model-legend-item"><span class="ops-model-dot" style="background:${getModelColor(m)}"></span>${shortModel(m)}</span>`
    ).join('');
  }
}

// ─── Confirm Dialog ───
function confirmDialog(message) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.innerHTML = `
      <div class="modal" style="max-width:400px;text-align:center;padding:28px 24px">
        <div style="font-size:.9rem;line-height:1.6;margin-bottom:22px;color:var(--text1)">${escHtml(message)}</div>
        <div style="display:flex;gap:10px;justify-content:center">
          <button class="btn-secondary" id="_cdCancel" style="min-width:90px">Cancel</button>
          <button class="btn-primary" id="_cdConfirm" style="min-width:90px;background:var(--accent);color:#fff;border-color:var(--accent)">Confirm</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#_cdCancel').onclick = () => { document.body.removeChild(overlay); resolve(false); };
    overlay.querySelector('#_cdConfirm').onclick = () => { document.body.removeChild(overlay); resolve(true); };
    overlay.onclick = e => { if (e.target === overlay) { document.body.removeChild(overlay); resolve(false); } };
  });
}
async function deleteTaskConfirm(taskId) {
  const ok = await confirmDialog('Delete this task?');
  if (ok) deleteTask(taskId);
}

// ═══ INIT ═══
applyLanguageUI();
checkConnection();
(async () => {
  // Fetch model colors early so charts render with correct colors from first paint
  try {
    const colorData = await apiFetch('/api/ground-truth/model-colors');
    if (colorData?.colors) Object.assign(MODEL_COLORS, colorData.colors);
  } catch(e) { /* non-fatal — fallback colors will be used */ }

  await refreshCapabilities();
  await loadSystemInfo();
  loadSessions(); // Load sessions tab (default) after caps so model selects render enabled when allowed
  loadTasks(true);
})();
loadAgentMonitor();
pollWatchdogStatus();
startLivePolling(); // Auto-poll tasks every 3s for live updates
setInterval(checkConnection, 30000);
setInterval(loadAgentMonitor, 60000); // was 15s, reduced to 60s // Refresh agent monitor every 15s
setInterval(pollWatchdogStatus, 10000);

// Kanban mobile resize handler
window.addEventListener('resize', () => {
  if (taskView === 'kanban') {
    const board = document.getElementById('kanbanBoard');
    if (!board) return;
    if (window.innerWidth <= 768) board.classList.add('horizontal-scroll');
    else board.classList.remove('horizontal-scroll');
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeDetailModal(); closeCreateModal(); }
  if (e.key === 'n' && e.ctrlKey && e.shiftKey) { e.preventDefault(); openCreateModal(); }
});
