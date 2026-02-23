# Jony's OpenClaw Dashboard

[![Built by Jony Jing](https://img.shields.io/badge/Built%20by-Jony%20Jing-a78bfa.svg)](https://github.com/JonathanJing)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

OpenClaw 的移动优先运维面板：一个页面同时看会话、成本、Cron、模型配置与系统健康，并支持远程手机巡检。

![Dashboard Preview](screenshots/dashboard-preview.png)

## 产品设计

### 1) 设计目标
- **手机优先**：关键运维指标在 iPhone 上可读、可点、可操作。
- **低认知切换**：将原先分散信息统一到会话中心视角，减少跨工具跳转。
- **快速恢复**：出现异常时，优先给出状态、原因、按钮式恢复路径。
- **本地可信**：默认只读取本机 OpenClaw 数据，不引入重型依赖。

### 2) 设计原则
- **Single-file 前端**：`agent-dashboard.html` 内联 CSS/JS，部署和迭代都快。
- **无框架后端**：`api-server.js` 基于 Node.js 原生 `http/fs/https`。
- **操作优先信息架构**：Sessions -> Cost -> Cron -> Quality -> Audit -> Config -> Operations。
- **风险前置**：把“异常、浪费、降级建议、watchdog 告警”放在靠前位置。

### 3) 信息架构（IA）
- **Sessions**：每个会话的模型、消息、tokens、成本、匹配度、告警。
- **Cost**：当天与历史成本构成，模型维度趋势与热力图。
- **Cron**：任务卡片化管理，查看最近执行、耗时、模型和消耗。
- **Quality/Audit/Config**：质量信号、供应商核验、配置可视化审计。
- **Operations**：Watchdog、系统信息、一键运维动作。

## 最新功能清单（含 Type 与产品设计）

| 功能 | Type | 产品设计 |
|---|---|---|
| Watchdog 全局告警卡 + Operations 状态面板 | Reliability / Incident Response | 将运行态异常直接置顶展示，并提供“Open Operations”快速跳转，缩短发现到处理路径 |
| Watchdog 时间窗筛选（5/10/15 分钟）+ Critical only | Monitoring UX | 把“看全部”与“只看关键事件”分离，满足巡检与排障两种阅读模式 |
| Watchdog 时间线（healthy/down）可视化 | Observability | 用连续状态条替代纯日志，降低定位波动区间的认知成本 |
| `GET /ops/watchdog` 实时状态聚合 | Backend API / Reliability | 聚合 runtime 存活、state 文件、events.jsonl，前端一次请求拿到可渲染全量数据 |
| 会话表头可点击排序（模型/消息/tokens/成本/$/条/匹配） | Data Interaction | 允许从“状态浏览”切换为“问题排序”，优先处理高成本或低匹配会话 |
| 会话默认模型与 Cron 模型下拉选择 | Configuration UX | 运维可在面板内直接调参，无需频繁回到配置文件 |
| 任务-模型匹配看板（含移动端列展示优化） | Product Intelligence | 把“配置是否合理”可视化，支持快速识别模型浪费与错配 |
| Cron 成本分析（固定 vs 变量趋势） | Cost Analytics | 把“总成本”拆成可解释构成，便于预算与优化决策 |
| 系统信息条常驻 Sessions 顶部 | Operational Awareness | 保持关键系统上下文持续可见，减少误判与切屏 |
| OpenClaw 版本识别增强（stderr + fallback） | Reliability / Compatibility | 提高版本检测稳健性，避免单一命令输出格式导致失真 |
| PWA 与移动端体验优化（图标、布局、触控） | Mobile UX | 支持 Home Screen 安装与小屏高频操作，提升手机值守体验 |

## Quick Start

```bash
git clone https://github.com/JonathanJing/jony-openclaw-dashboard.git
cd jony-openclaw-dashboard

export OPENCLAW_AUTH_TOKEN="your-secret-token"
export DASHBOARD_PORT=18791

node api-server.js
```

服务会自动读取 `~/.openclaw/keys.env`（如 OpenAI/Anthropic 管理端 key）。

### Tailscale Funnel（远程访问）

```bash
tailscale funnel --bg 18791
```

### macOS LaunchAgent（后台常驻）

```bash
cp macos/com.openclaw.dashboard.plist.example ~/Library/LaunchAgents/com.jony.dashboard.plist
launchctl load ~/Library/LaunchAgents/com.jony.dashboard.plist
```

## API（核心）

| Endpoint | 说明 |
|---|---|
| `GET /health` | 服务健康检查 |
| `GET /agents` | Agent Monitor 数据 |
| `GET /ops/sessions` | 会话总览、告警与统计 |
| `GET /ops/channels` | 当天频道维度 token/cost |
| `GET /ops/alltime` | 历史模型成本与日维度趋势 |
| `GET /ops/cron` | Cron 任务列表与状态 |
| `GET /ops/cron-costs` | Cron 成本分析（固定/变量） |
| `GET /ops/system` | 系统运行信息 |
| `GET /ops/watchdog` | Watchdog 状态、事件与时间线 |
| `GET /ops/config` | 配置文件查看（密钥遮罩） |
| `GET /ops/audit` | 供应商核验与审计 |
| `POST /ops/session-model` | 修改会话默认模型 |
| `POST /ops/cron-model` | 修改 Cron 模型 |
| `POST /ops/update-openclaw` | 触发 OpenClaw 更新动作 |

所有接口需 `?token=<AUTH_TOKEN>` 或有效的 `ds` 登录 cookie。

## 成本定价（估算）

| Model | Input/1M | Output/1M |
|---|---|---|
| Claude Opus 4-6 | $15 | $75 |
| Claude Sonnet 4-6 | $3 | $15 |
| GPT-5.2 Codex | $2.50 | $10 |
| Gemini 3 Pro | $2.00 | $12.00 |
| Gemini 3 Flash | $0.50 | $3.00 |

## 技术架构

- 零外部运行时依赖（Node.js 原生模块）
- 前后端文件极简：`api-server.js` + `agent-dashboard.html`
- 本地文件驱动：读取 OpenClaw sessions / cron / watchdog 状态
- 缓存与轮询结合：兼顾实时性与 IO 压力
- 时区统一策略：日报与统计维度按统一时区计算

## Credits

项目最初 fork 自 [karem505/openclaw-agent-dashboard](https://github.com/karem505/openclaw-agent-dashboard)，后由 [Jony Jing](https://github.com/JonathanJing) 做深度重构与产品化迭代。

## License

MIT
