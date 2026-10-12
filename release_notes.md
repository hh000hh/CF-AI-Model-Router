# CF AI Model Router v1.1.0

## New Features

- Dashboard MCP Direct Router
- Hermes Integration
- Workers AI Statistics
- OpenAI Statistics
- OpenRouter Statistics
- Provider Status Query
- Dashboard Health Monitoring
- Dashboard Information Query
- Dashboard Statistics Query

## Supported MCP Tools

- get_health
- get_dashboard_info
- get_dashboard_stats
- get_workers_ai_stats
- get_openrouter_stats
- get_openai_stats
- get_providers

## Improvements

- Optimized MCP response extraction
- Improved Hermes compatibility
- Reduced unnecessary model calls
- Maintained ENABLE_TOOL_CALLING compatibility
- Enhanced MCP debugging logs

## 2026-10-12 v1.1.1

### Fixed

- Fixed stock query false-positive routing
- Fixed Hermes streaming compatibility
- Fixed SSE handling for FX responses
- Fixed SSE handling for stock responses
- Fixed BTC/ETH/SOL/DOGE symbol matching
- Fixed crypto routing conflicts
- Fixed Provider Service Error in Hermes

### Refactor

- Added replyText() helper
- Unified streaming and non-streaming responses
- Synced runtime entry files

### Verified

- AI Chat
- Weather
- Exchange Rates
- Stocks
- Crypto
- Hermes WeChat
- SSE Streaming

