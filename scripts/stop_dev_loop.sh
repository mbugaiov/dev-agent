#!/usr/bin/env bash
# Stop Hephaestus scheduler + Cursor log watchers for one slug.
# Usage: bash scripts/stop_dev_loop.sh <slug> [--force]
# Kairos calls this on IDLE / orphan reap. Safe when nothing is running.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SLUG="${1:-}"
FORCE=0
shift || true
for arg in "$@"; do
  [[ "$arg" == "--force" ]] && FORCE=1
done

if [[ -z "$SLUG" || ! "$SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "Usage: stop_dev_loop.sh <slug> [--force]" >&2
  exit 2
fi

FACTORY_DIR="$ROOT/projects/$SLUG/factory"
PID_FILE="$FACTORY_DIR/loop.pid"
WATCH_PID_FILE="$FACTORY_DIR/watch.pid"
killed_sched=0
killed_watch=0

kill_pid() {
  local pid="$1" label="$2"
  [[ -z "$pid" ]] && return 0
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    sleep 0.2
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
    printf 'LOOP_STOP_KILL {"slug":"%s","kind":"%s","pid":%s}\n' "$SLUG" "$label" "$pid"
    return 0
  fi
  return 1
}

# Scheduler via pid file
if [[ -f "$PID_FILE" ]]; then
  OLD="$(tr -d '[:space:]' <"$PID_FILE" || true)"
  if kill_pid "$OLD" "scheduler"; then
    killed_sched=1
  fi
  rm -f "$PID_FILE"
fi

# Any matching dev-loop.sh <slug> (stale / double-fork leftovers)
while read -r pid; do
  [ -z "$pid" ] && continue
  cmd="$(ps -p "$pid" -o args= 2>/dev/null || true)"
  if [[ "$cmd" =~ scripts/dev-loop\.sh[[:space:]]+${SLUG}([[:space:]]|$) ]]; then
    if kill_pid "$pid" "scheduler"; then
      killed_sched=1
    fi
  fi
done < <(pgrep -f "scripts/dev-loop.sh" 2>/dev/null || true)

# Watcher via watch.pid
if [[ -f "$WATCH_PID_FILE" ]]; then
  WOLD="$(tr -d '[:space:]' <"$WATCH_PID_FILE" || true)"
  if kill_pid "$WOLD" "watcher"; then
    killed_watch=1
  fi
  rm -f "$WATCH_PID_FILE"
fi

# Orphan watch_dev_loop.sh <slug> + their tail -F children
while read -r pid; do
  [ -z "$pid" ] && continue
  cmd="$(ps -p "$pid" -o args= 2>/dev/null || true)"
  if [[ "$cmd" =~ watch_dev_loop\.sh[[:space:]]+${SLUG}([[:space:]]|$) ]]; then
    # Kill process group if setsid; else pid + children
    if kill_pid "$pid" "watcher"; then
      killed_watch=1
    fi
    # Child tails often keep the Cursor Shell "running"
    while read -r cpid; do
      [ -z "$cpid" ] && continue
      ccmd="$(ps -p "$cpid" -o args= 2>/dev/null || true)"
      if [[ "$ccmd" =~ tail[[:space:]].*loop\.out ]] || [[ "$ccmd" =~ tail[[:space:]].*-F ]]; then
        kill_pid "$cpid" "tail" || true
      fi
    done < <(pgrep -P "$pid" 2>/dev/null || true)
  fi
done < <(pgrep -f "watch_dev_loop.sh" 2>/dev/null || true)

printf 'LOOP_STOPPED {"slug":"%s","schedulerKilled":%s,"watcherKilled":%s,"force":%s}\n' \
  "$SLUG" "$killed_sched" "$killed_watch" "$FORCE"
exit 0
