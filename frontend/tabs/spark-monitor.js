/**
 * spark-monitor.js — Spark Monitor Tab
 * Shows: task summary cards, GPU timeline chart, recent task list, PR Hunter results
 */

// ── Summary Cards ─────────────────────────────────────────────────────────────

async function loadSparkSummary() {
  try {
    const data = await apiFetch('/api/spark-tasks/summary');
    if (!data?.ok) return;

    // Status counts
    const byStatus = data.tasks?.byStatus || [];
    const get = (s) => (byStatus.find(r => r.status === s)?.count || 0);
    document.getElementById('sparkTasksDone').textContent    = get('done');
    document.getElementById('sparkTasksRunning').textContent = get('running');
    document.getElementById('sparkTasksError').textContent   = get('error');

    // GPU
    const avgGpu = data.gpu?.avg_gpu;
    document.getElementById('sparkGpuAvg').textContent = avgGpu != null ? Number(avgGpu).toFixed(1) + '%' : '—';

    // Tokens
    const byType = data.tasks?.byType || [];
    const totalTokens = byType.reduce((s, r) => s + (r.total_tokens || 0), 0);
    document.getElementById('sparkTokensTotal').textContent = totalTokens > 0 ? fmtTokens(totalTokens) : '0';

    // PR Hunter latest
    renderPrHunterLatest(data.recent || []);

  } catch (e) {
    console.warn('[spark-monitor] summary error:', e);
  }
}

function fmtTokens(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

// ── GPU Timeline Chart ────────────────────────────────────────────────────────

async function loadSparkGpuTimeline() {
  const hours = document.getElementById('sparkGpuHours')?.value || 24;
  const el = document.getElementById('sparkGpuChart');
  if (!el) return;

  try {
    const data = await apiFetch(`/api/spark-tasks/gpu?hours=${hours}`);
    const timeline = data?.timeline || [];

    if (timeline.length === 0) {
      el.innerHTML = '<div style="color:var(--text2);text-align:center;padding:30px;font-size:.8rem">No GPU data yet — GPU Reporter runs every 5 minutes</div>';
      return;
    }

    // Mini SVG bar chart
    const max = Math.max(...timeline.map(p => p.gpu_pct || 0), 1);
    const w = 800, h = 90, barW = Math.max(2, Math.floor(w / timeline.length) - 1);
    const bars = timeline.map((p, i) => {
      const pct  = (p.gpu_pct || 0) / max;
      const barH = Math.max(2, Math.round(pct * (h - 20)));
      const x    = Math.round(i * (w / timeline.length));
      const y    = h - barH - 10;
      const col  = p.slots_busy > 0 ? '#7c6af7' : '#3b82f6';
      const ts   = new Date(p.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${col}" rx="1" opacity=".85">
        <title>${ts} — GPU: ${(p.gpu_pct||0).toFixed(1)}% | slots busy: ${p.slots_busy||0}${p.active_task ? ' | task: '+p.active_task : ''}</title>
      </rect>`;
    }).join('');

    // X-axis labels (every ~20% of points)
    const step = Math.max(1, Math.floor(timeline.length / 5));
    const labels = timeline.filter((_, i) => i % step === 0).map((p, i) => {
      const x = Math.round((i * step) * (w / timeline.length));
      const ts = new Date(p.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `<text x="${x}" y="${h}" font-size="9" fill="var(--text2)">${ts}</text>`;
    }).join('');

    el.innerHTML = `
      <svg viewBox="0 0 ${w} ${h + 5}" style="width:100%;height:100px" preserveAspectRatio="none">
        <line x1="0" y1="${h-10}" x2="${w}" y2="${h-10}" stroke="var(--border)" stroke-width="1"/>
        ${bars}
        ${labels}
      </svg>
      <div style="display:flex;gap:16px;margin-top:4px;font-size:.68rem;color:var(--text2)">
        <span><span style="display:inline-block;width:10px;height:10px;background:#7c6af7;border-radius:2px;margin-right:3px"></span>Spark Agent active</span>
        <span><span style="display:inline-block;width:10px;height:10px;background:#3b82f6;border-radius:2px;margin-right:3px"></span>OpenClaw slot</span>
      </div>`;
  } catch (e) {
    el.innerHTML = `<div style="color:var(--red);font-size:.8rem">Error loading GPU data: ${e.message}</div>`;
  }
}

// ── Task List ─────────────────────────────────────────────────────────────────

async function loadSparkTaskList() {
  const type   = document.getElementById('sparkTaskTypeFilter')?.value || '';
  const status = document.getElementById('sparkTaskStatusFilter')?.value || '';
  const el     = document.getElementById('sparkTaskList');
  if (!el) return;

  try {
    const data = await apiFetch(`/api/spark-tasks/list?type=${type}&status=${status}&limit=30`);
    const tasks = data?.tasks || [];

    if (tasks.length === 0) {
      el.innerHTML = '<div style="color:var(--text2);text-align:center;padding:20px;font-size:.8rem">No tasks yet — first run at 3:00 AM PST</div>';
      return;
    }

    const statusColor = { done: 'var(--green)', running: 'var(--accent)', error: 'var(--red)', unknown: 'var(--text2)' };
    const statusIcon  = { done: '✅', running: '⏳', error: '❌', unknown: '❓' };

    const rows = tasks.map(t => {
      const sc   = statusColor[t.status] || statusColor.unknown;
      const si   = statusIcon[t.status]  || statusIcon.unknown;
      const dur  = t.duration_s != null ? `${Number(t.duration_s).toFixed(0)}s` : '—';
      const ts   = t.started_at ? new Date(t.started_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
      const sum  = t.result_summary ? `<div style="font-size:.7rem;color:var(--text2);margin-top:2px">${t.result_summary}</div>` : '';
      return `<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:1rem;min-width:20px">${si}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:.82rem;font-weight:600;color:var(--text1)">${t.task_name}</div>
          <div style="font-size:.7rem;color:var(--text2)">${t.task_type} · ${ts} · ${dur}</div>
          ${sum}
        </div>
        <span style="font-size:.7rem;padding:2px 8px;border-radius:10px;background:rgba(255,255,255,.06);color:${sc};white-space:nowrap">${t.status}</span>
      </div>`;
    }).join('');

    el.innerHTML = `<div>${rows}</div>`;
  } catch (e) {
    el.innerHTML = `<div style="color:var(--red);font-size:.8rem">Error: ${e.message}</div>`;
  }
}

// ── PR Hunter Results ─────────────────────────────────────────────────────────

function renderPrHunterLatest(recent) {
  const el = document.getElementById('sparkPrHunterContent');
  if (!el) return;

  const prTask = recent.find(t => t.task_type === 'pr_hunter' && t.status === 'done');
  if (!prTask) {
    el.innerHTML = `<div style="color:var(--text2);font-size:.82rem;padding:20px;text-align:center">
      <div style="font-size:1.5rem;margin-bottom:8px">🌙</div>
      PR Hunter 首次运行在凌晨 3:00 AM PST<br>
      <span style="font-size:.72rem">分析 OpenClaw 最近 merge 的 PR，找趋势 + 生成 PR 草稿</span>
    </div>`;
    return;
  }

  const ts  = new Date(prTask.finished_at || prTask.started_at).toLocaleString();
  const dur = prTask.duration_s ? `${Number(prTask.duration_s).toFixed(0)}s` : '—';
  el.innerHTML = `<div style="font-size:.8rem">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <span style="color:var(--green);font-weight:600">✅ Last Run: ${ts}</span>
      <span style="color:var(--text2)">· ${dur}</span>
    </div>
    <div style="padding:10px;background:rgba(255,255,255,.04);border-radius:8px;color:var(--text1);line-height:1.6">
      ${prTask.result_summary || 'No summary available'}
    </div>
    <div style="margin-top:8px;font-size:.7rem;color:var(--text2)">
      结果文件保存在 Spark: ~/spark-agent/results/pr-hunter/ · 每天凌晨 3:00 更新
    </div>
  </div>`;
}

// ── Tab Init ──────────────────────────────────────────────────────────────────

async function loadSparkMonitor() {
  await Promise.all([
    loadSparkSummary(),
    loadSparkGpuTimeline(),
    loadSparkTaskList(),
  ]);
}

// Register with boot system (same pattern as other tabs)
if (typeof window !== 'undefined') {
  window._sparkMonitorInit = false;
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.tab === 'spark' && !window._sparkMonitorInit) {
          window._sparkMonitorInit = true;
          loadSparkMonitor();
        }
      });
    });

    // i18n labels
    const el = document.getElementById('tabSparkLabel');
    if (el) el.textContent = (window._lang === 'zh') ? 'Spark' : 'Spark';
  });
}
