#!/usr/bin/env bash
# Tail detached dev-loop log for Cursor notify_on_output (execute/PR wakes only).
# Usage: bash scripts/watch_dev_loop.sh <slug>
#
# Exits when the scheduler (loop.pid / dev-loop.sh) is gone — do not leave forever
# `tail -F` Cursor Shells after oneshot LOOP_EXIT_IDLE (#Kairos reap contract).
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
WATCH_PID_FILE="$FACTORY_DIR/watch.pid"
# Execute + PR backup only — never LOOP_ARMED / DEV_FACTORY_IDLE (avoids status-only turns).
WATCH_PATTERN='^(BACKLOG_WAKE_EXECUTE|MR_SESSION_MERGED_STALE_BRANCH|MR_PR_BACKUP_)'
POLL_SEC="${WATCH_SCHEDULER_POLL_SEC:-5}"
MISS_GRACE="${WATCH_SCHEDULER_MISS_GRACE:-3}"

mkdir -p "$FACTORY_DIR"
touch "$LOG"

scheduler_alive() {
  local pid=""
  if [[ -f "$PID_FILE" ]]; then
    pid="$(tr -d '[:space:]' <"$PID_FILE" || true)"
  fi
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    return 0
  fi
  # Stale pid file / race: any live dev-loop for this slug counts
  while read -r p; do
    [ -z "$p" ] && continue
    cmd="$(ps -p "$p" -o args= 2>/dev/null || true)"
    if [[ "$cmd" =~ scripts/dev-loop\.sh[[:space:]]+${SLUG}([[:space:]]|$) ]]; then
      return 0
    fi
  done < <(pgrep -f "scripts/dev-loop.sh" 2>/dev/null || true)
  return 1
}

SCHED_PID=""
if [[ -f "$PID_FILE" ]]; then
  SCHED_PID="$(tr -d '[:space:]' <"$PID_FILE" || true)"
fi
if scheduler_alive; then
  SCHED_STATUS="alive pid=${SCHED_PID:-unknown}"
else
  SCHED_STATUS="missing — run bash scripts/arm_dev_loop.sh $SLUG first (detached nohup default)"
fi

printf 'LOOP_WATCH_ATTACHED {"slug":"%s","log":"%s","scheduler":"%s","notifyPattern":"%s","watchPid":%s}\n' \
  "$SLUG" "$LOG" "$SCHED_STATUS" "$WATCH_PATTERN" "$$"
printf 'LOOP_ARM_AGENT_INSTRUCTIONS This Shell is the log watcher (not the scheduler). Arm once with arm_dev_loop.sh (nohup default); attach this watcher with notify_on_output on %s. On BACKLOG_WAKE_EXECUTE: start oldest ticket NOW — no status-only replies; drain backlog until idle. Watcher exits when scheduler dies (LOOP_EXIT_IDLE / stop_dev_loop). If aborted mid-run, re-run watch_dev_loop.sh only while loop.pid is alive.\n' \
  "$WATCH_PATTERN"

# Record watcher so Kairos / stop_dev_loop can reap Cursor Shells.
echo "$$" >"$WATCH_PID_FILE"

cleanup() {
  local code=$?
  if [[ -n "${TAIL_PID:-}" ]] && kill -0 "$TAIL_PID" 2>/dev/null; then
    kill "$TAIL_PID" 2>/dev/null || true
  fi
  if [[ -f "$WATCH_PID_FILE" ]]; then
    cur="$(tr -d '[:space:]' <"$WATCH_PID_FILE" || true)"
    if [[ "$cur" == "$$" ]]; then
      rm -f "$WATCH_PID_FILE"
    fi
  fi
  exit "$code"
}
trap cleanup EXIT INT TERM

# No scheduler at attach: wait briefly (oneshot may still be forking), then exit.
miss=0
if ! scheduler_alive; then
  while [[ "$miss" -lt "$MISS_GRACE" ]]; do
    sleep 1
    if scheduler_alive; then
      break
    fi
    miss=$((miss + 1))
  done
  if ! scheduler_alive; then
    printf 'LOOP_WATCH_EXIT {"slug":"%s","reason":"no_scheduler"}\n' "$SLUG"
    exit 0
  fi
fi

# Scheduler emit_tick runs immediately on detach; this watcher often attaches seconds later.
# Replay recent matching lines so notify_on_output still sees the first wake (tail -n 0 alone misses it).
tail -n 200 "$LOG" 2>/dev/null | grep -E "$WATCH_PATTERN" || true

# Follow log in background; parent polls scheduler and exits → Cursor Shell closes.
tail -n 0 -F "$LOG" &
TAIL_PID=$!

while scheduler_alive; do
  if ! kill -0 "$TAIL_PID" 2>/dev/null; then
    printf 'LOOP_WATCH_EXIT {"slug":"%s","reason":"tail_died"}\n' "$SLUG"
    exit 0
  fi
  sleep "$POLL_SEC"
done

printf 'LOOP_WATCH_EXIT {"slug":"%s","reason":"scheduler_gone"}\n' "$SLUG"
exit 0
