# Cloudflare AI Model Router

Cloudflare AI Model Router is an OpenAI-compatible AI routing gateway built on Cloudflare Workers.

The router intelligently directs requests to specialized AI models for chat, analysis, coding, and vision workloads while providing a unified API endpoint for clients and AI agents.

For Cloudflare bindings, environment variables, KV namespaces, R2 buckets, secrets, and deployment details, see:

```text
docs/cloudflare-bindings.md
```

---

# Purpose of the Project

The goal of the project is to provide a lightweight, low-cost, cloud-native AI gateway that can:

- Route different tasks to the most suitable AI model
- Centralize AI infrastructure behind a single OpenAI-compatible endpoint
- Reduce operational complexity for AI applications
- Support agent frameworks and messaging platforms
- Provide built-in search, finance, weather, and vision capabilities

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

# Weixin / WeChat Integration

Cloudflare AI Model Router can be used with Hermes Gateway to build intelligent WeChat assistants.

```text
Weixin User
      │
      ▼
Hermes Gateway
      │
      ▼
Cloudflare AI Model Router
      │
      ▼
CHAT / ANALYST / CODER / VISION
```

Typical use cases:

- Personal AI assistant
- Customer service bot
- Enterprise assistant
- Knowledge assistant
- Coding assistant
- Multi-agent automation workflows

---

# OpenAI-Compatible Applications

Any OpenAI-compatible application can connect directly to the router.

Examples:

```text
Hermes Agent
Open WebUI
LibreChat
Dify
Roo Code
Cline
Cursor
OpenHands
Custom Applications
```

Architecture:

```text
Client
  │
  ▼
Cloudflare AI Model Router
  │
  ▼
Workers AI Models
```

---

# Routing Architecture

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

---

# Available Models

## CHAT

Optimized for:

- Conversation
- Translation
- Rewriting
- Summarization
- Content generation

---

## ANALYST

Optimized for:

- Technical analysis
- Architecture discussions
- Research
- News lookup
- Market analysis
- General knowledge questions

---

## CODER

Optimized for:

- Software development
- Debugging
- Refactoring
- Code review
- Agent workflows

---

## VISION

Optimized for:

- OCR
- Screenshot analysis
- Image understanding
- Chart and UI analysis

---

# Built-in Services

The router includes several integrated services:

```text
Web Search

Stock Market Lookup

Cryptocurrency Prices

Exchange Rates

Weather Queries

Date & Calendar Services

OCR & Vision Processing
```

---

# Deployment

```bash
npx wrangler deploy
```

---

# Documentation

Cloudflare configuration and environment variables:

```text
docs/cloudflare-bindings.md
```

Core router implementation:

```text
src/index.js
```

---

# Repository

```text
https://github.com/hh000hh/CF-AI-Model-Router
```

---

# License

MIT
