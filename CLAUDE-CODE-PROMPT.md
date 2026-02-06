# OpenClaw Gatekeeper Fork — Setup & Integration

## Context

This is a **surgical fork** of OpenClaw that adds a pre-dispatch classifier hook. The goal is to intercept messages BEFORE they hit the Claude API, allowing cheap local classification to filter simple messages and save ~60% on API costs.

## Architecture

```
Current OpenClaw:
  Message → dispatchInboundMessage() → Claude API ($$$)

Forked OpenClaw:
  Message → pre-classifier check (localhost:8000) → decision
                ↓
    ├── STOP   → drop message (free)
    ├── SIMPLE → hardcoded response (free)
    └── PROCESS → Claude API (only when needed)
```

## What Was Changed

**Files modified (158 lines total):**

1. `src/auto-reply/dispatch.ts` — Added pre-classifier hook before `dispatchReplyFromConfig()`
2. `src/auto-reply/pre-classifier.ts` — New module that calls the local classifier HTTP endpoint

**Branch:** `feature/pre-dispatch-classifier`

## The Gatekeeper (Classifier)

Location: `/home/admin/.openclaw/workspace/projects/rei-rewrite/gatekeeper/`

**Key files:**

- `classifier.py` — Core classification logic (regex/rules, 21 tests passing)
- `server.py` — HTTP wrapper (POST /gatekeeper, GET /health)
- `gatekeeper.service` — systemd unit file

**To start:**

```bash
cd /home/admin/.openclaw/workspace/projects/rei-rewrite/gatekeeper
python3 server.py --port 8000
```

**Test it:**

```bash
curl -X POST http://localhost:8000/gatekeeper \
  -H "Content-Type: application/json" \
  -d '{"message":"thanks","sender":"test"}'
# Returns: {"action":"SIMPLE","text":"You're welcome!"}
```

## Configuration

Add to `~/.openclaw/openclaw.json`:

```json
{
  "preClassifier": {
    "enabled": true,
    "url": "http://localhost:8000/gatekeeper",
    "timeoutMs": 5000
  }
}
```

## Running the Fork

**Option 1: Development mode**

```bash
cd /home/admin/.openclaw/workspace/projects/openclaw-gatekeeper-fork
pnpm gateway:dev
```

**Option 2: Built version**

```bash
cd /home/admin/.openclaw/workspace/projects/openclaw-gatekeeper-fork
pnpm build
pnpm start
```

**Option 3: Direct CLI**

```bash
cd /home/admin/.openclaw/workspace/projects/openclaw-gatekeeper-fork
node openclaw.mjs gateway start
```

## Full Startup Sequence

1. **Start gatekeeper (Terminal 1):**

   ```bash
   cd /home/admin/.openclaw/workspace/projects/rei-rewrite/gatekeeper
   python3 server.py
   # Should show: [gatekeeper] Starting server on http://127.0.0.1:8000
   ```

2. **Verify gatekeeper:**

   ```bash
   curl http://localhost:8000/health
   # Should return: {"status": "ok"}
   ```

3. **Add config** (if not already):

   ```bash
   # Edit ~/.openclaw/openclaw.json and add preClassifier section
   ```

4. **Start forked OpenClaw (Terminal 2):**

   ```bash
   cd /home/admin/.openclaw/workspace/projects/openclaw-gatekeeper-fork
   pnpm gateway:dev
   ```

5. **Test end-to-end:**
   - Send a message via Matrix/Signal/etc
   - Watch gatekeeper logs for classification
   - Simple messages should get instant responses without Claude

## Classifier Actions

| Action  | Behavior                        | Cost |
| ------- | ------------------------------- | ---- |
| PROCESS | Forward to Claude (normal flow) | $$$  |
| STOP    | Drop message silently           | Free |
| SIMPLE  | Return hardcoded response       | Free |
| WAIT    | Buffer message (placeholder)    | Free |
| APPEND  | Add to buffer (placeholder)     | Free |

## What Gets Filtered

**STOP:** "stop", "cancel", "halt", "abort", etc.

**SIMPLE:**

- "thanks" → "You're welcome!"
- "ok" / "got it" → "👍"
- "what time is it" → Current time

**PROCESS:** Everything else (actual questions, tasks, etc.)

## Troubleshooting

**Gatekeeper not responding:**

```bash
# Check if running
curl http://localhost:8000/health

# Check logs
journalctl -u gatekeeper -f  # if installed as service
```

**Fork not using classifier:**

- Verify `preClassifier.enabled: true` in config
- Check URL is correct (http://localhost:8000/gatekeeper)
- Look for `[pre-classifier]` in OpenClaw logs

**TypeScript errors:**

```bash
cd /home/admin/.openclaw/workspace/projects/openclaw-gatekeeper-fork
pnpm build  # Rebuild after changes
```

## Files Reference

```
Fork:
  /home/admin/.openclaw/workspace/projects/openclaw-gatekeeper-fork/
  ├── src/auto-reply/dispatch.ts        # Modified
  ├── src/auto-reply/pre-classifier.ts  # New
  └── README-FORK.md                    # Documentation

Gatekeeper:
  /home/admin/.openclaw/workspace/projects/rei-rewrite/gatekeeper/
  ├── classifier.py      # Classification logic
  ├── server.py          # HTTP server
  ├── gatekeeper.service # systemd unit
  └── test-e2e.sh        # Test script

Config:
  ~/.openclaw/openclaw.json  # Add preClassifier section here
```

## Your Task

Please:

1. Verify the fork builds and runs correctly
2. Test the gatekeeper integration end-to-end
3. Confirm personality/workspace files load normally
4. Report any issues or improvements needed
