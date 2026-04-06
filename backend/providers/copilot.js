'use strict';
const WebSocket = require('ws');
const redis = require('redis');
const fs = require('fs');
const path = require('path');

// Read API Key
let alibabaApiKey = process.env.ALIBABA_CLOUD_API_KEY;
if (!alibabaApiKey) {
  try {
    const envFile = fs.readFileSync(path.join(process.env.HOME, '.openclaw/.env'), 'utf8');
    const match = envFile.match(/ALIBABA_CLOUD_API_KEY=(.+)/);
    if (match) alibabaApiKey = match[1].trim();
  } catch (e) {}
}

let redisPubClient = null;

async function getRedisPubClient() {
  if (!redisPubClient) {
    redisPubClient = redis.createClient({ url: 'redis://127.0.0.1:6379' });
    redisPubClient.on('error', err => console.error('[copilot] Redis pub error:', err));
    await redisPubClient.connect();
  }
  return redisPubClient;
}

function generateId() {
  return 'evt_' + Math.random().toString(36).substr(2, 9);
}

async function handleWsConnection(clientWs, req) {
  console.log('[copilot] Client connected via WebSocket');

  if (!alibabaApiKey) {
    clientWs.send(JSON.stringify({ type: 'error', message: 'ALIBABA_CLOUD_API_KEY not found in env' }));
    clientWs.close();
    return;
  }

  const pub = await getRedisPubClient();

  // 1. Connect to DashScope WebSocket
  const dashUrl = 'wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime?model=qwen3-omni-flash-2025-12-01';
  const dashWs = new WebSocket(dashUrl, {
    headers: {
      'Authorization': `Bearer ${alibabaApiKey}`
    }
  });

  // 2. Setup Redis Subscriber for RAG and Insights
  const sub = redis.createClient({ url: 'redis://127.0.0.1:6379' });
  sub.on('error', err => console.error('[copilot] Redis sub error:', err));
  await sub.connect();

  await sub.subscribe('meeting.rag_hits', (message) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: 'rag_hits', data: JSON.parse(message) }));
    }
  });

  await sub.subscribe('meeting.insights', (message) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: 'insight', data: JSON.parse(message) }));
    }
  });

  dashWs.on('open', () => {
    console.log('[copilot] Connected to DashScope');
    clientWs.send(JSON.stringify({ type: 'system', message: 'Connected to Omni Realtime' }));
    
    // Configure session
    const sessionUpdate = {
      event_id: generateId(),
      type: 'session.update',
      session: {
        modalities: ['text'], // Only request text back, no audio playing from server
        voice: 'Cherry',
        input_audio_format: 'pcm',
        output_audio_format: 'pcm',
        instructions: '你是一个专业的会议速记员，只需安静地把听到的对话逐字记录下来。请务必根据音色或语气区分出不同的说话人，并用“发言人A：”、“发言人B：”等格式输出。除转写外，绝对不要发表你自己的意见、不要回答问题、不要总结。',
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          silence_duration_ms: 800
        }
      }
    };
    dashWs.send(JSON.stringify(sessionUpdate));
  });

  dashWs.on('message', (data) => {
    try {
      const resp = JSON.parse(data);
      const evtType = resp.type;

      // 1. Forward raw event type to frontend for Debug Log
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: 'debug', event: evtType }));
      }

      if (evtType === 'error') {
        console.error('[copilot] DashScope error:', resp);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: 'error', message: resp.error?.message || JSON.stringify(resp) }));
        }
      } else if (evtType === 'input_audio_buffer.speech_started') {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: 'state', message: '🎙️ VAD Detected Speech' }));
        }
      } else if (evtType === 'input_audio_buffer.speech_stopped') {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: 'state', message: '⏳ Processing Speech...' }));
        }
      } else if (evtType === 'conversation.item.input_audio_transcription.completed') {
        const text = resp.transcript?.trim();
        if (text) {
          const payload = { speaker: 'user', text, timestamp: Date.now() / 1000 };
          pub.publish('meeting.transcript', JSON.stringify(payload));
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'transcript', data: payload }));
          }
        }
      } else if (evtType === 'response.audio_transcript.done' || evtType === 'response.text.done') {
        const text = (resp.transcript || resp.text || '').trim();
        if (text) {
          // Since the prompt tells Omni to act as a diarization transcriber, we label it as 'omni_diarized'
          // We can parse '发言人A: ...' if needed, but for now we just pass it to transcript
          const payload = { speaker: 'omni', text, timestamp: Date.now() / 1000 };
          pub.publish('meeting.transcript', JSON.stringify(payload));
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'transcript', data: payload }));
          }
        }
      }
    } catch (e) {
      console.error('[copilot] DashScope parse error:', e);
    }
  });

  dashWs.on('close', () => {
    console.log('[copilot] DashScope closed');
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: 'system', message: 'DashScope disconnected' }));
    }
  });

  dashWs.on('error', (e) => console.error('[copilot] DashScope WS error', e));

  // Handle incoming from Client (Browser)
  clientWs.on('message', (message, isBinary) => {
    if (isBinary) {
      // Audio chunk (PCM 16kHz 16bit)
      if (dashWs.readyState === WebSocket.OPEN) {
        const base64Audio = message.toString('base64');
        const payload = {
          event_id: generateId(),
          type: 'input_audio_buffer.append',
          audio: base64Audio
        };
        dashWs.send(JSON.stringify(payload));
      }
    } else {
      // JSON messages from client
    }
  });

  clientWs.on('close', async () => {
    console.log('[copilot] Client closed WS');
    try {
      if (dashWs.readyState === WebSocket.OPEN) dashWs.close();
      await sub.unsubscribe();
      await sub.quit();
    } catch (e) {}
  });
}

function register(router) {
  // We don't register normal HTTP routes for this since it's WS only
}

module.exports = { register, handleWsConnection };