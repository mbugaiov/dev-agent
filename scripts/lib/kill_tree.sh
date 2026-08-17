#!/usr/bin/env bash
# Shared process-tree kill helpers for stop_dev_loop / ensure_hephaestus.
# Requires SLUG in the environment for LOOP_STOP_KILL log lines.
# Source only — do not execute.

kill_pid() {
  local pid="$1" label="$2"
  [[ -z "$pid" ]] && return 1
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    sleep 0.2
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
    printf 'LOOP_STOP_KILL {"slug":"%s","kind":"%s","pid":%s}\n' "${SLUG:-}" "$label" "$pid"
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
