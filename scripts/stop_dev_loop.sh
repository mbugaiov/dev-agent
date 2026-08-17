#!/usr/bin/env bash
# Stop Hephaestus scheduler + Cursor log watchers for one slug.
# Usage: bash scripts/stop_dev_loop.sh <slug>
# Kairos calls this on orphan/idle reap. Safe when nothing is running.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SLUG="${1:-}"

if [[ -z "$SLUG" || ! "$SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "Usage: stop_dev_loop.sh <slug>" >&2
  exit 2
fi

FACTORY_DIR="$ROOT/projects/$SLUG/factory"
PID_FILE="$FACTORY_DIR/loop.pid"
WATCH_PID_FILE="$FACTORY_DIR/watch.pid"
AGENT_PID_FILE="$FACTORY_DIR/hephaestus-oneshot.pid"
killed_sched=0
killed_watch=0
killed_agent=0

kill_pid() {
  local pid="$1" label="$2"
  [[ -z "$pid" ]] && return 1
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

# Kill children before parent so tails are not reparented past pgrep -P.
kill_tree() {
  local pid="$1" label="$2"
  [[ -z "$pid" ]] && return 1
  local kids=()
  while read -r cpid; do
    [ -z "$cpid" ] && continue
    kids+=("$cpid")
  done < <(pgrep -P "$pid" 2>/dev/null || true)
  local c
  for c in "${kids[@]+"${kids[@]}"}"; do
    kill_tree "$c" "${label}-child" || true
  done
  kill_pid "$pid" "$label"
}

# Scheduler via pid file — only if cmdline still matches this slug
if [[ -f "$PID_FILE" ]]; then
  OLD="$(tr -d '[:space:]' <"$PID_FILE" || true)"
  cmd="$(ps -p "$OLD" -o args= 2>/dev/null || true)"
  if [[ -n "$OLD" && "$cmd" =~ scripts/dev-loop\.sh[[:space:]]+${SLUG}([[:space:]]|$) ]]; then
    if kill_tree "$OLD" "scheduler"; then
      killed_sched=1
    fi
  fi
  rm -f "$PID_FILE"
fi

# Any matching dev-loop.sh <slug> (stale / double-fork leftovers)
while read -r pid; do
  [ -z "$pid" ] && continue
  cmd="$(ps -p "$pid" -o args= 2>/dev/null || true)"
  if [[ "$cmd" =~ scripts/dev-loop\.sh[[:space:]]+${SLUG}([[:space:]]|$) ]]; then
    if kill_tree "$pid" "scheduler"; then
      killed_sched=1
    fi
  fi
done < <(pgrep -f "scripts/dev-loop.sh" 2>/dev/null || true)

# Watcher via watch.pid — children (tail -F) first
if [[ -f "$WATCH_PID_FILE" ]]; then
  WOLD="$(tr -d '[:space:]' <"$WATCH_PID_FILE" || true)"
  if kill_tree "$WOLD" "watcher"; then
    killed_watch=1
  fi
  rm -f "$WATCH_PID_FILE"
fi

# Orphan watch_dev_loop.sh <slug> + tails (children before parent)
while read -r pid; do
  [ -z "$pid" ] && continue
  cmd="$(ps -p "$pid" -o args= 2>/dev/null || true)"
  if [[ "$cmd" =~ watch_dev_loop\.sh[[:space:]]+${SLUG}([[:space:]]|$) ]]; then
    if kill_tree "$pid" "watcher"; then
      killed_watch=1
    fi
  fi
done < <(pgrep -f "watch_dev_loop.sh" 2>/dev/null || true)

# Stray tails still following this slug's loop.out
LOG="$FACTORY_DIR/loop.out"
if [[ -f "$LOG" ]]; then
  while read -r pid; do
    [ -z "$pid" ] && continue
    cmd="$(ps -p "$pid" -o args= 2>/dev/null || true)"
    if [[ "$cmd" == *"$LOG"* ]] && [[ "$cmd" == *tail* ]]; then
      kill_pid "$pid" "tail" || true
      killed_watch=1
    fi
  done < <(pgrep -f "tail" 2>/dev/null || true)
fi

# Cursor-agent oneshot (Kairos K13 path) — only kill if cmdline looks like the agent
if [[ -f "$AGENT_PID_FILE" ]]; then
  AOLD="$(tr -d '[:space:]' <"$AGENT_PID_FILE" || true)"
  if [[ -n "$AOLD" ]] && kill -0 "$AOLD" 2>/dev/null; then
    acmd="$(ps -p "$AOLD" -o args= 2>/dev/null || true)"
    if [[ "$acmd" == *cursor-agent* ]] || [[ "$acmd" == *DEV_FACTORY_SLUG=$SLUG* ]] || [[ "$acmd" == *" $SLUG"* ]]; then
      if kill_tree "$AOLD" "agent-oneshot"; then
        killed_agent=1
      fi
    else
      printf 'LOOP_STOP_SKIP {"slug":"%s","kind":"agent-oneshot","pid":%s,"reason":"cmdline-mismatch"}\n' \
        "$SLUG" "$AOLD"
    fi
  fi
  rm -f "$AGENT_PID_FILE"
fi

printf 'LOOP_STOPPED {"slug":"%s","schedulerKilled":%s,"watcherKilled":%s,"agentKilled":%s}\n' \
  "$SLUG" "$killed_sched" "$killed_watch" "$killed_agent"
exit 0
