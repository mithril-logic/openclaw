# OpenClaw Fork Switch Log

## What This Is

This is a fork of OpenClaw with a **pre-dispatch classifier hook** — a surgical addition (~160 lines) that allows a cheap classifier to filter messages before they hit the expensive LLM.

**Branch:** `feature/pre-dispatch-classifier`
**Upstream:** `https://github.com/openclaw/openclaw.git`

## Switch Date: 2026-02-05

### What Changed

1. `/home/admin/openclaw` was renamed to `/home/admin/openclaw-upstream` (backup)
2. `/home/admin/openclaw` is now a symlink to this fork directory

### Config Addition

The fork recognizes this config block in `openclaw.json`:

```json
{
  "preClassifier": {
    "enabled": true,
    "url": "http://localhost:8000/gatekeeper",
    "timeoutMs": 5000
  }
}
```

### Gatekeeper Server

The classifier service runs separately:

- **Location:** `~/.openclaw/workspace/projects/rei-rewrite/gatekeeper/server.py`
- **Port:** 8000
- **Start:** `cd ~/.openclaw/workspace/projects/rei-rewrite/gatekeeper && python3 server.py --port 8000`

## How to Revert

```bash
# 1. Stop gateway
openclaw gateway stop

# 2. Remove symlink
rm /home/admin/openclaw

# 3. Restore upstream
mv /home/admin/openclaw-upstream /home/admin/openclaw

# 4. (Optional) Remove preClassifier from config, or leave it — upstream ignores it
# nano ~/.openclaw/openclaw.json

# 5. Restart gateway
openclaw gateway start
```

## How to Update Fork from Upstream

```bash
cd /home/admin/openclaw  # (the symlink, points to fork)
git fetch origin
git rebase origin/main
pnpm install
pnpm build
openclaw gateway restart
```

## Modified Files (vs upstream)

- `src/auto-reply/dispatch.ts` — calls pre-classifier before LLM dispatch
- `src/auto-reply/pre-classifier.ts` — new file, HTTP client for classifier
- `src/config/zod-schema.ts` — adds preClassifier config validation
- `docs/PRE-CLASSIFIER.md` — feature documentation

## Commits

```
a02a897a5 feat: add preClassifier config schema validation
9e7f236d8 docs: add fork documentation
a213d328d feat: add pre-dispatch classifier hook
```
