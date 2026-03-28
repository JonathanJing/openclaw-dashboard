window.escHtml = window.escHtml || function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

/* Boot & Init — runs after all tab modules loaded */

// Dashboard is read-only. Only restart and doctor --fix are allowed as control actions.
async function opsAction(action) {
  const btnMap  = { restart: 'btnRestart', doctor: 'btnDoctor' };
  const badgeMap = { restart: 'badgeRestart', doctor: 'badgeDoctor' };
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

    } else if (action === 'doctor') {
      if (badge) badge.textContent = '🩺';
      const data = await apiFetch('/ops/doctor', { method: 'POST' });
      if (badge) badge.textContent = data?.ok ? '✅' : '⚠️';
      html = `<span style="color:${data?.ok ? 'var(--green)' : 'var(--yellow)'}">${data?.ok ? '✅' : '⚠️'} openclaw doctor --fix</span>
        <pre style="margin-top:8px;font-size:.72rem;color:var(--text2);white-space:pre-wrap;word-break:break-all;max-height:200px;overflow:auto">${escHtml(data?.output || 'No output.')}</pre>`;

    } else {
      throw new Error(`Unknown action: ${action}`);
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
  const today = new Date();
  const pstNow = new Date(today.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const dayOfWeek = pstNow.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const thisMonday = new Date(pstNow);
  thisMonday.setDate(pstNow.getDate() + mondayOffset + (offset * 7));
  thisMonday.setHours(0, 0, 0, 0);

  const thisSunday = new Date(thisMonday);
  thisSunday.setDate(thisMonday.getDate() + 6);

  const fmtDate = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const startStr = fmtDate(thisMonday);
  const endStr = fmtDate(thisSunday);

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

function _drawWeeklyBarChart(canvas, days, valueKey, color) {
  if (!canvas || !days || !days.length) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = Math.max(320, (canvas.parentElement?.clientWidth || 360) - 12);
  const H = 120;
  canvas.width = W * 2;
  canvas.height = H * 2;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const pad = { l: 24, r: 8, t: 10, b: 22 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const vals = days.map(d => Number(d[valueKey] || 0));
  const maxVal = Math.max(...vals, 1);
  const step = innerW / days.length;
  const barW = Math.max(12, step * 0.58);

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = pad.t + (innerH / 3) * i;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(W - pad.r, y);
    ctx.stroke();
  }

  ctx.fillStyle = color;
  days.forEach((d, i) => {
    const v = Number(d[valueKey] || 0);
    const h = Math.max(2, (v / maxVal) * innerH);
    const x = pad.l + i * step + (step - barW) / 2;
    const y = pad.t + innerH - h;
    ctx.fillRect(x, y, barW, h);
  });

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  days.forEach((d, i) => {
    const x = pad.l + i * step + step / 2;
    ctx.fillText(String(d.date || '').slice(5), x, H - 6);
  });
}

function renderWeekView() {
  const { days, startStr, endStr } = getWeekSlice(_weekAllDaily, _weekOffset);
  const label = document.getElementById('weekLabel');
  const prevBtn = document.getElementById('weekPrev');
  const nextBtn = document.getElementById('weekNext');
  const dailyCanvas = document.getElementById('dailyChart');
  const costCanvas = document.getElementById('dailyCostChart');

  const oldestDate = _weekAllDaily.length > 0 ? _weekAllDaily[0].date : startStr;
  const hasPrev = startStr > oldestDate;
  const hasNext = _weekOffset < 0;

  if (prevBtn) prevBtn.disabled = !hasPrev;
  if (nextBtn) nextBtn.disabled = !hasNext;

  if (label) {
    if (_weekOffset === 0) label.textContent = `This Week · ${startStr.slice(5)} – ${endStr.slice(5)}`;
    else label.textContent = `${startStr.slice(5)} – ${endStr.slice(5)}`;
  }

  _drawWeeklyBarChart(dailyCanvas, days, 'tokens', '#7c5cff');
  _drawWeeklyBarChart(costCanvas, days, 'cost', '#34d399');
}

// Continue normal boot flow below (hotfix boot sequence)
async function bootstrapDashboard() {
  try { checkConnection(); } catch {}
  try { applyLanguageUI(); } catch {}
  try { await refreshCapabilities(); } catch {}
  try { await loadAgentMonitor(); } catch {}
  try { await loadSessions(); } catch {}
  try { await loadCronEnhanced(); } catch {}
  try { await loadCronCosts(); } catch {}
  try { await loadSystemInfo(); } catch {}
  try { await loadTasks(true); } catch {}
  try { pollWatchdogStatus(); } catch {}
}

bootstrapDashboard();
setInterval(checkConnection, 10000);
setInterval(pollWatchdogStatus, 10000);
