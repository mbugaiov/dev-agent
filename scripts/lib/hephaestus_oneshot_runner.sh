#!/usr/bin/env bash
# Run cursor-agent oneshot with log + heartbeat (K14 liveness).
#
# CRITICAL: do NOT pipe agent stdout into `while read`. cursor-agent fully buffers
# when stdout is a pipe (not a TTY), so the read-loop never sees lines, the log
# stays empty, heartbeat freezes at arm time, and K14 only kill/re-arms forever.
#
# Instead: append stdout/stderr to the log (prefer line-buffered via stdbuf/script),
# and advance heartbeat only when the log grows.
#
# Usage: HEPHAESTUS_LOG=... HEPHAESTUS_HEARTBEAT=... bash hephaestus_oneshot_runner.sh <agent_bin> [args...]
set -euo pipefail

LOG="${HEPHAESTUS_LOG:?HEPHAESTUS_LOG required}"
HEARTBEAT="${HEPHAESTUS_HEARTBEAT:?HEPHAESTUS_HEARTBEAT required}"
AGENT_BIN="${1:?agent bin}"
shift
POLL_SEC="${HEPHAESTUS_HEARTBEAT_POLL_SEC:-15}"

touch_heartbeat() {
  date -u +%s >"$HEARTBEAT"
}

log_bytes() {
  wc -c <"$LOG" 2>/dev/null | tr -d '[:space:]' || echo 0
}

run_agent() {
  # Prefer line-buffered stdio so progress reaches the log before process exit.
  if command -v stdbuf >/dev/null 2>&1; then
    stdbuf -oL -eL "$AGENT_BIN" "$@"
    return $?
  fi
  # macOS: fake a TTY so Node/cursor-agent line-buffers like an interactive session.
  if [[ "$(uname -s)" == "Darwin" ]] && command -v script >/dev/null 2>&1; then
    script -q /dev/null "$AGENT_BIN" "$@"
    return $?
  fi
  "$AGENT_BIN" "$@"
}

: >"$LOG"
touch_heartbeat

run_agent "$@" >>"$LOG" 2>&1 &
agent_pid=$!

hb_pid=""
cleanup() {
  if [[ -n "${hb_pid:-}" ]] && kill -0 "$hb_pid" 2>/dev/null; then
    kill "$hb_pid" 2>/dev/null || true
    wait "$hb_pid" 2>/dev/null || true
  fi
  if kill -0 "$agent_pid" 2>/dev/null; then
    kill "$agent_pid" 2>/dev/null || true
    wait "$agent_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

(
  last_size=0
  while kill -0 "$agent_pid" 2>/dev/null; do
    size="$(log_bytes)"
    if [[ "${size:-0}" -gt "${last_size:-0}" ]]; then
      touch_heartbeat
      last_size="$size"
    fi
    sleep "$POLL_SEC"
  done
) &
hb_pid=$!

set +e
wait "$agent_pid"
ec=$?
set -e

if [[ -n "$hb_pid" ]]; then
  kill "$hb_pid" 2>/dev/null || true
  wait "$hb_pid" 2>/dev/null || true
  hb_pid=""
fi
trap - EXIT INT TERM

if [[ "$(log_bytes)" -gt 0 ]]; then
  touch_heartbeat
fi
exit "$ec"
