#!/usr/bin/env bash
# Arm the dev factory loop — supported entry point.
# Usage: bash scripts/arm_dev_loop.sh <slug>
#
# Slug-scoped: arming one factory does NOT kill another slug's loop.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SLUG="${1:-${DEV_AGENT_SLUG:-}}"
if [[ -z "$SLUG" ]]; then
  echo "Usage: arm_dev_loop.sh <slug>" >&2
  exit 1
fi
if [[ ! "$SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "Invalid slug '$SLUG' — expected ^[a-z0-9][a-z0-9-]*$" >&2
  exit 2
fi

PR_BACKUP="${DEV_PR_BACKUP_SEC:-300}"

# Kill only this slug's loop — other factories must coexist.
while read -r pid; do
  [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
done < <(pgrep -f "scripts/dev-loop.sh ${SLUG}" 2>/dev/null || true)

cd "$ROOT"
export DEV_AGENT_SLUG="$SLUG"
# shellcheck disable=SC1091
source "$ROOT/scripts/source_project_secrets.sh" "$SLUG" || true

if [[ -n "${DEV_LOOP_INTERVAL_SEC:-}" ]]; then
  INTERVAL="$DEV_LOOP_INTERVAL_SEC"
else
  INTERVAL="$(npx tsx scripts/resolve_loop_interval.ts "$SLUG")"
fi

npx tsx scripts/print_loop_armed.ts "$SLUG" "$INTERVAL"
printf 'LOOP_ARM_AGENT_INSTRUCTIONS Launch in background (block_until_ms=0) with notify_on_output on %s. On BACKLOG_WAKE_EXECUTE: start oldest ticket NOW — no status-only replies; drain backlog until DEV_FACTORY_IDLE.\n' \
  "^(BACKLOG_WAKE_EXECUTE|DEV_FACTORY_IDLE|LOOP_ARMED|MR_SESSION_MERGED_STALE_BRANCH|MR_PR_BACKUP_|AGENT_LOOP_TICK_)"

export DEV_LOOP_INTERVAL_SEC="$INTERVAL"
export DEV_PR_BACKUP_SEC="$PR_BACKUP"
export DEV_LOOP_ARMED=1
export DEV_AGENT_SLUG="$SLUG"
exec bash scripts/dev-loop.sh "$SLUG"
