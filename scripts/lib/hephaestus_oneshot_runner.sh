#!/usr/bin/env bash
# Run cursor-agent oneshot with log + heartbeat (K14 liveness).
# Usage: HEPHAESTUS_LOG=... HEPHAESTUS_HEARTBEAT=... bash hephaestus_oneshot_runner.sh <agent_bin> [cursor-agent args...]
set -euo pipefail

LOG="${HEPHAESTUS_LOG:?HEPHAESTUS_LOG required}"
HEARTBEAT="${HEPHAESTUS_HEARTBEAT:?HEPHAESTUS_HEARTBEAT required}"
AGENT_BIN="${1:?agent bin}"
shift

touch_heartbeat() {
  date -u +%s >"$HEARTBEAT"
}

: >"$LOG"
touch_heartbeat

# Line-buffered output → log growth + heartbeat for stall probe.
"$AGENT_BIN" "$@" 2>&1 | while IFS= read -r line || [[ -n "${line:-}" ]]; do
  printf '%s\n' "$line" >>"$LOG"
  touch_heartbeat
done
