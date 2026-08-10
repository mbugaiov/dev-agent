#!/usr/bin/env bash
# Canonical factory arm for Cursor sessions (default for pantheon and all slugs).
#
# 1) Detaches scheduler (setsid) via arm_dev_loop.sh → factory/loop.{pid,out}
# 2) Prints LOOP_WATCH_ATTACH_REQUIRED — agent MUST same-turn background:
#      bash scripts/watch_dev_loop.sh <slug>
#    with notify_on_output on the printed notifyPattern.
#
# Usage: bash scripts/run_dev_loop.sh <slug>
# Env: DEV_LOOP_INTERVAL_SEC, DEV_LOOP_FOREGROUND=1 (debug; skips detach)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SLUG="${1:-${DEV_AGENT_SLUG:-}}"
if [[ -z "$SLUG" ]]; then
  echo "Usage: run_dev_loop.sh <slug>" >&2
  exit 1
fi

cd "$ROOT"
bash scripts/arm_dev_loop.sh "$SLUG"

WATCH_PATTERN='^(BACKLOG_WAKE_EXECUTE|MR_SESSION_MERGED_STALE_BRANCH|MR_PR_BACKUP_)'
printf 'LOOP_WATCH_ATTACH_REQUIRED {"slug":"%s","mustSameTurn":true,"command":"bash scripts/watch_dev_loop.sh %s","notifyPattern":"%s","blockUntilMs":0,"reason":"Cursor execute wake — without this watcher, BACKLOG_WAKE_EXECUTE is silent and tickets will not run","forbidden":"Ending turn after LOOP_DETACHED without attaching watch_dev_loop.sh"}\n' \
  "$SLUG" "$SLUG" "$WATCH_PATTERN"
printf 'LOOP_ARM_AGENT_INSTRUCTIONS SAME TURN (mandatory): launch background Shell (block_until_ms=0) → bash scripts/watch_dev_loop.sh %s with notify_on_output pattern %s. On BACKLOG_WAKE_EXECUTE: start oldest ticket NOW; drain until DEV_FACTORY_IDLE. If watcher Shell aborts later, re-attach watch only (scheduler stays up via loop.pid).\n' \
  "$SLUG" "$WATCH_PATTERN"
exit 0
