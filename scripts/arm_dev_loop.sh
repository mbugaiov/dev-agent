#!/usr/bin/env bash
# Arm the dev factory loop — supported entry point.
# Usage: bash scripts/arm_dev_loop.sh <slug>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SLUG="${1:-${DEV_AGENT_SLUG:-}}"
if [[ -z "$SLUG" ]]; then
  echo "Usage: arm_dev_loop.sh <slug>" >&2
  exit 1
fi

INTERVAL="${DEV_LOOP_INTERVAL_SEC:-300}"
PR_BACKUP="${DEV_PR_BACKUP_SEC:-300}"

while read -r pid; do
  [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
done < <(pgrep -f 'scripts/dev-loop.sh' 2>/dev/null || true)

cd "$ROOT"
export DEV_AGENT_SLUG="$SLUG"
# shellcheck disable=SC1091
source "$ROOT/scripts/source_project_secrets.sh" "$SLUG" || true

npx tsx scripts/print_loop_armed.ts "$SLUG" "$INTERVAL"
printf 'LOOP_ARM_AGENT_INSTRUCTIONS Launch in background (block_until_ms=0) with notify_on_output on %s. On BACKLOG_WAKE_EXECUTE: start oldest ticket NOW — no status-only replies. On BACKLOG_WAKE: drain backlog — do NOT end turn after one handoff.\n' \
  "^(BACKLOG_WAKE_EXECUTE|BACKLOG_WAKE|DEV_FACTORY_IDLE|LOOP_ARMED|MR_SESSION_MERGED_STALE_BRANCH|MR_PR_BACKUP_|AGENT_LOOP_TICK_)"

export DEV_LOOP_INTERVAL_SEC="$INTERVAL"
export DEV_PR_BACKUP_SEC="$PR_BACKUP"
export DEV_LOOP_ARMED=1
export DEV_AGENT_SLUG="$SLUG"
exec bash scripts/dev-loop.sh "$SLUG"
