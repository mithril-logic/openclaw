# OpenClaw Gatekeeper Fork

This is a surgical fork of OpenClaw that adds a pre-dispatch classifier hook.

## Purpose

Intercept messages **before** they hit the expensive Claude API, allowing cheap local classification to filter simple messages and save API costs.

## The Problem

Without this hook:
- Every message hits Claude API (~$0.01-0.03 per interaction)
- Simple acknowledgments ("thanks", "ok") waste API calls
- No way to batch rapid-fire messages

With this hook:
- Local classifier runs first (~200 tokens, ~$0.0001)
- SIMPLE messages get hardcoded responses (free)
- STOP messages are dropped (free)
- Only PROCESS messages hit Claude

**Potential savings: 60% of API costs** (if 60% of messages are simple)

## Changes

Two files modified:
- `src/auto-reply/dispatch.ts` — Calls classifier before LLM
- `src/auto-reply/pre-classifier.ts` — New module for classifier logic

## Configuration

Add to `openclaw.json`:

```json
{
  "preClassifier": {
    "enabled": true,
    "url": "http://localhost:8000/gatekeeper",
    "timeoutMs": 5000
  }
}
```

## Classifier API

**POST /gatekeeper**

Request:
```json
{
  "message": "thanks",
  "sender": "@user:matrix.local",
  "channel": "matrix",
  "sessionKey": "...",
  "timestamp": 1234567890
}
```

Response:
```json
{
  "action": "SIMPLE",
  "text": "You're welcome!",
  "reason": "simple_pattern",
  "confidence": 0.8
}
```

Actions:
- `PROCESS` — Continue to LLM (default)
- `STOP` — Drop message silently
- `SIMPLE` — Send `text` directly, skip LLM
- `WAIT` — Buffer for batching (placeholder)
- `APPEND` — Add to buffer (placeholder)

## Running the Classifier

```bash
cd ~/.openclaw/workspace/projects/rei-rewrite/gatekeeper
python3 server.py --port 8000
```

## Rebasing

This fork is designed for easy rebasing:

```bash
git fetch upstream
git rebase upstream/main
```

The diff is minimal (~100 lines), so conflicts should be rare.

## Upstream PR

This could be contributed upstream as a generic `preDispatchHook` feature:
- Many users would benefit from local filtering
- Pattern is common in production systems
- Doesn't break existing behavior (disabled by default)
