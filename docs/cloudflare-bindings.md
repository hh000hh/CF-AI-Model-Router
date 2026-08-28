# Cloudflare AI Bot Configuration

## Worker

Name: cf-ai

Compatibility Date:

2026-06-23

## KV Namespaces

### COST_KV

ID:

d97620ec271344008e8663b558fb42b8

### SYMBOL_CACHE

ID:

7854a0decec94401aa78eea8d5301952

## R2 Buckets

### IMAGES_BUCKET

Bucket Name:

images

## Secrets

- API_KEY
- OPENWEATHER_API_KEY
- EXCHANGERATE_API_KEY
- FINNHUB_API_KEY
- TW_API_KEY
- IMG_SIGN_API_KEY
- HMAC_SECRET

## Commands

Deploy:

```bash
npx wrangler deploy
