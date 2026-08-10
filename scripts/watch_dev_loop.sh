#!/usr/bin/env bash
# Tail detached dev-loop log for Cursor notify_on_output (execute/PR wakes only).
# Usage: bash scripts/watch_dev_loop.sh <slug>
#
# The scheduler (dev-loop.sh) must already be running under nohup via arm_dev_loop.sh
# (that is the default arm path — loop.pid / loop.out).
# Cursor may abort this watcher Shell — re-run watch_dev_loop.sh only; the scheduler stays up.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SLUG="${1:-${DEV_AGENT_SLUG:-}}"
if [[ -z "$SLUG" ]]; then
  echo "Usage: watch_dev_loop.sh <slug>" >&2
  exit 1
fi
if [[ ! "$SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "Invalid slug '$SLUG' — expected ^[a-z0-9][a-z0-9-]*$" >&2
  exit 2
fi

FACTORY_DIR="$ROOT/projects/$SLUG/factory"
LOG="$FACTORY_DIR/loop.out"
PID_FILE="$FACTORY_DIR/loop.pid"
# Execute + PR backup only — never LOOP_ARMED / DEV_FACTORY_IDLE (avoids status-only turns).
WATCH_PATTERN='^(BACKLOG_WAKE_EXECUTE|MR_SESSION_MERGED_STALE_BRANCH|MR_PR_BACKUP_)'

mkdir -p "$FACTORY_DIR"
touch "$LOG"

SCHED_PID=""
if [[ -f "$PID_FILE" ]]; then
  SCHED_PID="$(tr -d '[:space:]' <"$PID_FILE" || true)"
fi
if [[ -n "$SCHED_PID" ]] && kill -0 "$SCHED_PID" 2>/dev/null; then
  SCHED_STATUS="alive pid=$SCHED_PID"
else
  SCHED_STATUS="missing — run bash scripts/arm_dev_loop.sh $SLUG first (detached nohup default)"
fi

printf 'LOOP_WATCH_ATTACHED {"slug":"%s","log":"%s","scheduler":"%s","notifyPattern":"%s"}\n' \
  "$SLUG" "$LOG" "$SCHED_STATUS" "$WATCH_PATTERN"
printf 'LOOP_ARM_AGENT_INSTRUCTIONS This Shell is the log watcher (not the scheduler). Arm once with arm_dev_loop.sh (nohup default); attach this watcher with notify_on_output on %s. On BACKLOG_WAKE_EXECUTE: start oldest ticket NOW — no status-only replies; drain backlog until idle. If this watcher Shell is aborted, re-run watch_dev_loop.sh only (detached scheduler keeps ticking — verify projects/%s/factory/loop.pid).\n' \
  "$WATCH_PATTERN" "$SLUG"

# Scheduler emit_tick runs immediately on detach; this watcher often attaches seconds later.
# Replay recent matching lines so notify_on_output still sees the first wake (tail -n 0 alone misses it).
# Bound to recent log so a late re-attach does not dump the entire history.
tail -n 200 "$LOG" 2>/dev/null | grep -E "$WATCH_PATTERN" || true
exec tail -n 0 -F "$LOG"
