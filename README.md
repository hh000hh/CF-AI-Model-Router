# Cloudflare AI Model Router

Cloudflare AI Model Router is an OpenAI-compatible AI routing gateway built on Cloudflare Workers.

The router intelligently routes requests to specialized AI models and built-in services through a unified API endpoint while remaining compatible with OpenAI clients, AI agents, and messaging platforms.

---

# Features

## AI Model Routing

Automatically routes requests to the most suitable model:

```text
AUTO
 │
 ├─ CHAT
 ├─ ANALYST
 ├─ CODER
 └─ VISION
```

## OpenAI Compatible

Compatible with:

- Hermes Agent
- Open WebUI
- LibreChat
- Dify
- Roo Code
- Cline
- Cursor
- OpenHands
- Custom Applications

## Unified Gateway

- OpenAI-compatible API
- Intelligent model routing
- Built-in service routing
- Centralized AI infrastructure
- Cloudflare-native deployment
- Low operational cost

---

# Built-in Services

The router includes integrated utility services that can be accessed through the same OpenAI-compatible endpoint.

## AI Chat

Examples:

```text
你好
翻译
总结
帮我写邮件
解释 TCP/IP
```

---

## Weather

Examples:

```text
上海天气
北京天气
深圳天气
```

---

## Exchange Rates

Examples:

```text
美元汇率
欧元汇率

USD/CNY
EUR/USD
GBP/CNY

汇率
全部汇率
所有汇率
```

---

## Stock Market

Examples:

```text
AAPL
TSLA
NVDA
AMD
INTC

Intel股价
TSLA行情
SNAP一周股价
```

Supported Markets:

```text
US Stocks
Hong Kong Stocks
China A-Shares
```

---

## Cryptocurrency

Examples:

```text
BTC
ETH
SOL
DOGE
XRP

比特币
以太坊
狗狗币
瑞波币
```

---

## Search

Examples:

```text
新闻查询
市场研究
技术搜索
知识查询
```

---

## OCR & Vision

Examples:

```text
OCR
图片识别
截图分析
图表识别
界面分析
```

---

# Architecture

## AI Routing

```text
                    AUTO
                      │

      ┌───────────────┼───────────────┐
      │               │               │

      ▼               ▼               ▼

    CHAT          ANALYST         CODER

                      │
                      ▼

                    VISION
```

## Service Layer

```text
                    Router
                      │

     ┌────────┬────────┬────────┬────────┬────────┐
     │        │        │        │        │

     ▼        ▼        ▼        ▼        ▼

  Weather    FX      Stock    Crypto   Search
```

---

# Hermes Agent Integration

Cloudflare AI Model Router can be configured as the AI backend for Hermes Agent.

```text
Hermes Agent
      │
      ▼

Cloudflare AI Model Router
      │
      ▼

CHAT / ANALYST / CODER / VISION
```

Benefits:

- OpenAI-compatible endpoint
- Intelligent model routing
- Centralized model management
- Search integration
- Vision support
- Cost control

---

# WeChat Integration

Cloudflare AI Model Router can be used with Hermes Gateway to build intelligent WeChat assistants.

```text
WeChat User
      │
      ▼

Hermes Gateway
      │
      ▼

Cloudflare AI Model Router
      │
      ▼

AI Models + Built-in Services
```

Typical Use Cases:

- Personal AI Assistant
- Enterprise Assistant
- Customer Service Bot
- Knowledge Assistant
- Coding Assistant
- Agent Automation Workflows

---

# Supported Models

## CHAT

Optimized for:

- Conversation
- Translation
- Rewriting
- Summarization
- Content Generation

---

## ANALYST

Optimized for:

- Research
- Architecture Discussions
- Market Analysis
- News Lookup
- Technical Analysis
- General Knowledge

---

## CODER

Optimized for:

- Software Development
- Debugging
- Refactoring
- Code Review
- Agent Workflows

---

## VISION

Optimized for:

- OCR
- Screenshot Analysis
- Image Understanding
- Chart Recognition
- UI Analysis

---

# Deployment

```bash
npm install
npx wrangler deploy
```

---

# Configuration

Cloudflare resources, bindings, KV namespaces, R2 buckets, environment variables and deployment settings:

```text
docs/cloudflare-bindings.md
```

---

# Project Structure

```text
cf-ai/
│
├── docs/
│   └── cloudflare-bindings.md
│
├── src/
│   └── cf-ai-router.js
│   
│
├── wrangler.toml
├── README.md
└── release_notes.md
```

Current Worker Entry:

```toml
main = "src/cf-ai-router.js"
```

---

# Verified Services

```text
✓ AI Chat
✓ Weather
✓ Exchange Rates
✓ Stocks
✓ Cryptocurrency
✓ Search
✓ OCR & Vision
✓ SSE Streaming
✓ OpenAI Compatible
✓ Hermes Agent
✓ WeChat Integration
```

---

# Release Highlights

## v1.1.1

### Fixed

- Fixed stock query false-positive routing
- Fixed crypto routing conflicts
- Fixed BTC / ETH / SOL / DOGE symbol matching
- Fixed exchange-rate SSE streaming
- Fixed stock SSE streaming
- Fixed Hermes EmptyStreamError
- Fixed Provider Service Error handling

### Refactor

- Added `replyText()` helper
- Unified streaming and non-streaming responses
- Improved router stability
- Synced runtime entry files

### Verified

```text
AI Chat
Weather
Exchange Rates
Stocks
Crypto
Hermes WeChat
SSE Streaming
```

---

# Repository

```text
https://github.com/hh000hh/CF-AI-Model-Router
```

---

# License

MIT
