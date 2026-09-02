# Cloudflare AI Model Router

Repository:

https://github.com/hh000hh/CF-AI-Model-Router

---

## Worker

```text
Name: cf-ai
Compatibility Date: 2026-06-23
Usage Model: standard
```

---

## Models

### CHAT

```text
MODEL_CHAT
```

Used for:

- Chat
- Translation
- Rewrite
- Summarization
- General assistance

### ANALYST

```text
MODEL_ANALYST
```

Used for:

- Technical analysis
- News queries
- Stock analysis
- Weather queries
- Research
- General Q&A

### CODER

```text
MODEL_CODER
```

Used for:

- Coding
- Debugging
- Refactoring
- Code Review
- Agent workflows

### VISION

```text
MODEL_VISION_RAW
MODEL_VISION_RAW_SCHEMA
```

Used for:

- OCR
- Screenshot analysis
- Image understanding
- Chart and UI analysis

---

## Architecture

```text
                   AUTO
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼

      CHAT       ANALYST       CODER

                     │
                     ▼

                   VISION
```

---

## KV Namespaces

### COST_KV

```text
d97620ec271344008e8663b558fb42b8
```

### SYMBOL_CACHE

```text
7854a0decec94401aa78eea8d5301952
```

---

## R2 Bucket

### IMAGES_BUCKET

```text
images
```

---

## Environment Variables

### Routing

```text
CHAT_PATTERNS
CODING_PATTERNS
```

### Models

```text
MODEL_CHAT
MODEL_ANALYST
MODEL_CODER
MODEL_VISION_RAW
MODEL_VISION_RAW_SCHEMA
```

### Cost Control

```text
DAILY_BUDGET
DAILY_REQUEST_LIMIT

COST_CHEAP
COST_SMART
COST_LONG
COST_VISION
```

### Search

```text
SEARCH_ENABLED
SEARCH_TRIGGER_MODE
SEARCH_AI_PROMPT
SEARCH_AI_YES_PREFIX

SEARCH_KEYWORDS
SEARCH_FORCE_PATTERNS
SEARCH_FORCE_THRESHOLD

SEARCH_MAX_RESULTS
SEARCH_TIMEOUT_MS
```

### Vision

```text
VISION_MAX_TOKENS
VISION_PROMPT
VISION_RESPONSE_MODE
```

### Stocks

```text
STOCK_KEYWORDS
STOCK_HISTORY_KEYWORDS
STOCK_MARKET_KEYWORDS
STOCK_SYMBOL_BLACKLIST

CN_HK_STOCK_ALIASES
US_STOCK_ALIASES
DE_STOCK_ALIASES

TIME_UNIT
```

### Crypto

```text
CRYPTO_SYMBOLS
```

### Exchange Rate

```text
FX_CURRENCIES
```

### Date & Time

```text
DATE_TIME_TIMEZONE
DATE_TIME_MAX_LENGTH

DATE_TIME_KEYWORDS
DATE_ONLY_KEYWORDS
```

### Hermes

```text
HERMES_CONTINUE_KEYWORDS
HERMES_CONTINUE_THRESHOLD
HERMES_IMAGE_KEYWORDS
```

---

## Bindings

```text
AI
COST_KV
SYMBOL_CACHE
IMAGES_BUCKET
```

---

## Secrets

```text
API_KEY

OPENWEATHER_API_KEY

EXCHANGERATE_API_KEY

FINNHUB_API_KEY

TW_API_KEY

IMG_SIGN_API_KEY

SP_API_KEY

HMAC_SECRET
```

---

## Deploy

```bash
npx wrangler deploy
```
