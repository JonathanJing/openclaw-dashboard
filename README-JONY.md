# Jony's Dashboard 🦞

OpenClaw Agent Dashboard — Jony 专属版

## 启动方式

```bash
cd /Users/jonyopenclaw/Library/Mobile\ Documents/com\~apple\~CloudDocs/Projects/jony-dashboard
./start.sh
```

## 访问地址

| 服务 | 地址 |
|------|------|
| Dashboard UI | http://127.0.0.1:18791 (通过 `agent-dashboard.html` 直接打开) |
| API Server | http://127.0.0.1:18791 |
| Gateway WebSocket | ws://127.0.0.1:18789 |

> Dashboard HTML 可直接在浏览器中打开，它会自动连接 API Server（端口 18791）和 Gateway WebSocket（端口 18789）。

## 环境变量

| 变量 | 值 |
|------|----|
| `OPENCLAW_AUTH_TOKEN` | `REDACTED_SECRET` |
| `OPENCLAW_WORKSPACE` | `/Users/jonyopenclaw/.openclaw/workspace` |
| `DASHBOARD_PORT` | `18791` |

## Gateway 地址

- HTTP Hooks: `http://127.0.0.1:18789/hooks`
- Agent Hook: `http://127.0.0.1:18789/hooks/agent`
- WebSocket: `ws://127.0.0.1:18789`

## 已集成 APIs

| API | Provider | 用途 |
|-----|----------|------|
| Discord Bot | Discord API | 主消息频道，Send/Read/React/Components v2 |
| Anthropic Claude | Anthropic API | 主 LLM，Claude Sonnet 4.6 / Opus 4.6 |
| Brave Search | Brave API | 网页搜索 |
| Notion | Notion API | 数据库读写 |
| OpenAI | OpenAI API | GPT-5.2 / Codex |
| Google Gemini | Google AI | Gemini 3 Pro / Flash |
| X API | Twitter API v2 | 推文抓取 @steipete @openclaw |
| Web Fetch | Built-in | 网页内容提取 |
| OpenAI Whisper API | OpenAI API | 语音转文字 |
