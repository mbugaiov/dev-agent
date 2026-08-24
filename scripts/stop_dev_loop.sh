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

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/kill_tree.sh"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/oneshot_cmd.sh"

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

# Cursor-agent oneshot (Kairos K13 path) — kill only when cmdline is slug-bound.
# Require DEV_FACTORY_SLUG=<slug> with end boundary (same class as scheduler
# `dev-loop.sh <slug>`). Never match bare *cursor-agent* or loose *" $SLUG"* —
# a recycled PID must not kill another tenant's oneshot.
if [[ -f "$AGENT_PID_FILE" ]]; then
  AOLD="$(tr -d '[:space:]' <"$AGENT_PID_FILE" || true)"
  if [[ -n "$AOLD" ]] && kill -0 "$AOLD" 2>/dev/null; then
    should_kill=0
    if agent_oneshot_tree_matches_slug "$AOLD" "$SLUG" "hephaestus"; then
      should_kill=1
    elif [[ -f "$FACTORY_DIR/hephaestus-oneshot.claim.json" ]] \
      && grep -q "\"slug\"[[:space:]]*:[[:space:]]*\"${SLUG}\"" \
        "$FACTORY_DIR/hephaestus-oneshot.claim.json" 2>/dev/null; then
      acmd="$(ps -p "$AOLD" -o args= 2>/dev/null || true)"
      if ! oneshot_cmd_conflicts_slug "$acmd" "$SLUG" "hephaestus"; then
        if oneshot_factory_path_in_cmd "$acmd" "$SLUG" \
          || oneshot_environ_matches_slug "$AOLD" "$SLUG" \
          || { oneshot_runner_in_cmd "$acmd" \
            && { oneshot_ancestors_match_slug "$AOLD" "$SLUG" "hephaestus" \
              || oneshot_environ_matches_slug "$AOLD" "$SLUG"; }; }; then
          should_kill=1
        fi
      fi
    fi
    if [[ "$should_kill" -eq 1 ]]; then
      if kill_tree "$AOLD" "agent-oneshot"; then
        killed_agent=1
      fi
      rm -f "$FACTORY_DIR/hephaestus-oneshot.claim.json"
    else
      acmd="$(ps -p "$AOLD" -o args= 2>/dev/null || true)"
      printf 'LOOP_STOP_SKIP {"slug":"%s","kind":"agent-oneshot","pid":%s,"reason":"cmdline-mismatch","cmd":%s}\n' \
        "$SLUG" "$AOLD" "$(printf '%q' "${acmd:0:120}")"
    fi
  fi
  rm -f "$AGENT_PID_FILE"
fi

# Orphan slug-bound agent oneshot (no pid file / stale file already removed).
# pgrep -f "DEV_FACTORY_SLUG=${SLUG}" is a substring prefilter; the end-boundary
# regex below rejects ${SLUG}-other. Any process that embeds the exact
# DEV_FACTORY_SLUG=<slug> token in argv (including prompt text) is in scope.
while read -r pid; do
  [ -z "$pid" ] && continue
  if agent_oneshot_tree_matches_slug "$pid" "$SLUG" "hephaestus"; then
    if kill_tree "$pid" "agent-oneshot"; then
      killed_agent=1
    fi
  fi
done < <(pgrep -f "DEV_FACTORY_SLUG=${SLUG}([^a-z0-9-]|$)|Hephaestus oneshot for ${SLUG}([^a-z0-9-]|$)" 2>/dev/null || true)


printf 'LOOP_STOPPED {"slug":"%s","schedulerKilled":%s,"watcherKilled":%s,"agentKilled":%s}\n' \
  "$SLUG" "$killed_sched" "$killed_watch" "$killed_agent"
exit 0
