'use strict';

// ── Meeting Copilot UI Module ───────────────────────────────────────────────

let ws = null;
let audioContext = null;
let scriptProcessor = null;
let mediaStream = null;
let analyserNode = null;
let meterInterval = null;

function initCopilot() {
  const containerTranscript = document.getElementById('copilotTranscript');
  const containerRag = document.getElementById('copilotRagHits');
  const containerInsights = document.getElementById('copilotInsights');
  const containerDebug = document.getElementById('copilotDebugLog');
  const startBtn = document.getElementById('btnStartCopilot');
  const stopBtn = document.getElementById('btnStopCopilot');
  const statusEl = document.getElementById('copilotStatus');
  const meterEl = document.getElementById('audioMeter');
  const meterFill = document.getElementById('audioMeterFill');

  if (!containerTranscript || window._copilotDomInit) return;
  window._copilotDomInit = true;

  function appendDebug(text, color = '#d1d5db') {
    const div = document.createElement('div');
    const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
    div.innerHTML = `<span style="color:#6b7280">[${time}]</span> <span style="color:${color}">${escapeHtml(text)}</span>`;
    containerDebug.appendChild(div);
    containerDebug.scrollTop = containerDebug.scrollHeight;
  }

  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    containerDebug.innerHTML = '';
    appendDebug('Connecting to backend WS...', '#60a5fa');
    
    try {
      await startRecording(containerTranscript, containerRag, containerInsights, statusEl, appendDebug, meterEl, meterFill);
      stopBtn.disabled = false;
      statusEl.textContent = "🔴 Recording...";
      statusEl.style.color = "#f87171";
      meterEl.style.display = 'block';
    } catch (err) {
      console.error(err);
      appendDebug(`Error starting mic: ${err.message}`, '#ef4444');
      startBtn.disabled = false;
    }
  });

  stopBtn.addEventListener('click', () => {
    stopRecording();
    startBtn.disabled = false;
    stopBtn.disabled = true;
    statusEl.textContent = "⏹️ Stopped";
    statusEl.style.color = "#9ca3af";
    meterEl.style.display = 'none';
    appendDebug('Stopped.', '#9ca3af');
  });
}

async function startRecording(tContainer, rContainer, iContainer, statusEl, appendDebug, meterEl, meterFill) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/api/copilot/ws`;
  
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    appendDebug('WS connected to OpenClaw Dashboard', '#34d399');
  };
  
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'transcript') {
        renderTranscript(msg.data, tContainer);
        statusEl.textContent = "🔴 Recording...";
      } else if (msg.type === 'rag_hits') {
        renderRag(msg.data, rContainer);
      } else if (msg.type === 'insight') {
        renderInsight(msg.data, iContainer);
      } else if (msg.type === 'system') {
        appendDebug(`System: ${msg.message}`, '#facc15');
      } else if (msg.type === 'error') {
        appendDebug(`DashScope Error: ${msg.message}`, '#ef4444');
      } else if (msg.type === 'debug') {
        appendDebug(`Event: ${msg.event}`, '#9ca3af');
      } else if (msg.type === 'state') {
        statusEl.textContent = msg.message;
      }
    } catch(err) {
      console.error('Failed to parse WS message', e.data);
    }
  };

  ws.onclose = () => {
    appendDebug('WS closed', '#ef4444');
    if (document.getElementById('btnStopCopilot').disabled === false) {
      document.getElementById('btnStopCopilot').click();
    }
  };

  // 2. Start Microphone
  appendDebug('Requesting mic permissions...');
  mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  appendDebug('Mic access granted. Sample rate converting to 16000Hz...', '#34d399');
  
  audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
  const source = audioContext.createMediaStreamSource(mediaStream);
  
  // Analyser for UI volume meter
  analyserNode = audioContext.createAnalyser();
  analyserNode.fftSize = 256;
  source.connect(analyserNode);
  
  const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
  meterInterval = setInterval(() => {
    if (!analyserNode) return;
    analyserNode.getByteTimeDomainData(dataArray);
    let max = 0;
    for (let i = 0; i < dataArray.length; i++) {
      let v = Math.abs(dataArray[i] - 128);
      if (v > max) max = v;
    }
    // max is 0 to 128. Map to 0-100%
    const pct = Math.min(100, Math.round((max / 128) * 100 * 2));
    meterFill.style.width = pct + '%';
    meterFill.style.background = pct > 20 ? '#10b981' : '#047857'; // bright green if loud
  }, 100);

  scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
  source.connect(scriptProcessor);
  scriptProcessor.connect(audioContext.destination);
  
  scriptProcessor.onaudioprocess = (e) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    const float32Array = e.inputBuffer.getChannelData(0);
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    ws.send(int16Array.buffer);
  };
}

function stopRecording() {
  if (meterInterval) {
    clearInterval(meterInterval);
    meterInterval = null;
  }
  if (scriptProcessor) {
    scriptProcessor.disconnect();
    scriptProcessor = null;
  }
  if (analyserNode) {
    analyserNode.disconnect();
    analyserNode = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
}

function renderTranscript(data, container) {
  const div = document.createElement('div');
  div.style.padding = '8px 12px';
  div.style.borderRadius = '6px';
  div.style.marginBottom = '4px';
  div.style.maxWidth = '85%';
  
  const time = new Date(data.timestamp * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
  
  if (data.speaker === 'user') {
    div.style.background = '#374151';
    div.style.alignSelf = 'flex-end';
    div.innerHTML = `<span style="font-size:0.75rem;color:#9ca3af">[${time}]</span> <span style="font-weight:600;color:#60a5fa">Raw Audio</span><br>${escapeHtml(data.text)}`;
  } else {
    div.style.background = '#1e3a8a';
    div.style.alignSelf = 'flex-start';
    div.innerHTML = `<span style="font-size:0.75rem;color:#9ca3af">[${time}]</span> <span style="font-weight:600;color:#34d399">Omni (Diarized)</span><br>${escapeHtml(data.text)}`;
  }
  
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function renderRag(data, container) {
  const time = new Date(data.timestamp * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  const div = document.createElement('div');
  div.style.borderLeft = '3px solid #60a5fa';
  div.style.paddingLeft = '8px';
  div.style.marginBottom = '12px';
  
  let html = `<div style="color:#9ca3af;font-size:0.8rem">🔎 RAG [${time}] Query: <i>${escapeHtml(data.query.substring(0, 30))}...</i></div>`;
  
  data.hits.forEach(hit => {
    html += `<div style="margin-top:6px;background:#1f2937;padding:6px;border-radius:4px;">
      <div style="color:#60a5fa;font-weight:600;font-size:0.8rem;word-break:break-all">${escapeHtml(hit.source)} <span style="color:#9ca3af">(${hit.score.toFixed(2)})</span></div>
      <div style="color:#d1d5db;margin-top:4px">${escapeHtml(hit.content_preview)}...</div>
    </div>`;
  });
  
  div.innerHTML = html;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function renderInsight(data, container) {
  const time = new Date(data.timestamp * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  const div = document.createElement('div');
  div.style.borderLeft = '3px solid #facc15';
  div.style.paddingLeft = '8px';
  div.style.marginBottom = '12px';
  div.style.background = '#422006';
  div.style.padding = '8px';
  div.style.borderRadius = '0 6px 6px 0';
  
  div.innerHTML = `<div style="color:#9ca3af;font-size:0.8rem">[${time}] Consultant</div>
    <div style="color:#fde047;margin-top:4px;font-weight:500;">${escapeHtml(data.insight)}</div>`;
    
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

document.addEventListener('DOMContentLoaded', () => {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === 'copilot') {
        initCopilot();
      }
    });
  });
});

window.initCopilot = initCopilot;
