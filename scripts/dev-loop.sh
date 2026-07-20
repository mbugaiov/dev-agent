#!/usr/bin/env bash
# Dev factory scheduler (internal — use scripts/arm_dev_loop.sh only).
# Usage: bash scripts/dev-loop.sh <slug>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SLUG="${1:-${DEV_AGENT_SLUG:-}}"
if [[ -z "$SLUG" ]]; then
  echo "Usage: dev-loop.sh <slug>" >&2
  exit 1
fi

export DEV_AGENT_SLUG="$SLUG"
# shellcheck disable=SC1091
source "$ROOT/scripts/source_project_secrets.sh" "$SLUG" || true

if [ "${DEV_LOOP_ARMED:-}" != "1" ]; then
  printf 'LOOP_UNARMED_REFUSED {"reason":"Use bash scripts/arm_dev_loop.sh <slug> with notify_on_output — direct dev-loop ticks silently"}\n'
  exit 1
fi

INTERVAL="${DEV_LOOP_INTERVAL_SEC:-300}"
POLL="${DEV_LOOP_POLL_SEC:-30}"
PR_BACKUP="${DEV_PR_BACKUP_SEC:-300}"

emit_tick() {
  bash "$ROOT/scripts/dev_factory_tick.sh" "$SLUG"
}

emit_pr_backup() {
  local app_root
  app_root=$(npx tsx -e "
import { loadProjectConfig, resolveAppRoot } from './lib/loadProject.ts';
console.log(resolveAppRoot('$ROOT', loadProjectConfig('$ROOT', '$SLUG')));
")
  if [ ! -f "$app_root/scripts/mr_session_status.ts" ]; then
    return 0
  fi
  (cd "$app_root" && npx tsx scripts/mr_session_status.ts --backup-wake) || true
}

format_ts() {
  local epoch="$1" formatted
  formatted=$(date -u -r "$epoch" '+%Y-%m-%d %H:%M:%S UTC' 2>/dev/null) && {
    printf '%s' "$formatted"
    return
  }
  formatted=$(date -u -d "@${epoch}" '+%Y-%m-%d %H:%M:%S UTC' 2>/dev/null) && {
    printf '%s' "$formatted"
    return
  }
  printf 'epoch:%s' "$epoch"
}

emit_schedule() {
  local now backlog_in pr_in
  now=$(date +%s)
  backlog_in=$(( NEXT - now ))
  pr_in=$(( PR_NEXT - now ))
  if [ "$backlog_in" -lt 0 ]; then backlog_in=0; fi
  if [ "$pr_in" -lt 0 ]; then pr_in=0; fi
  printf 'LOOP_NEXT_WAKE {"slug":"%s","nextBacklogWake":"%s","nextPrBackupWake":"%s","backlogWakeInSec":%s,"prBackupWakeInSec":%s,"intervalSec":%s,"prBackupSec":%s}\n' \
    "$SLUG" "$(format_ts "$NEXT")" "$(format_ts "$PR_NEXT")" "$backlog_in" "$pr_in" "$INTERVAL" "$PR_BACKUP"
}

NEXT=$(( $(date +%s) + INTERVAL ))
PR_NEXT=$(( $(date +%s) + PR_BACKUP ))

emit_tick
emit_pr_backup
emit_schedule

while true; do
  NOW=$(date +%s)
  if [ "$NOW" -ge "$PR_NEXT" ]; then
    emit_pr_backup
    PR_NEXT=$(( NOW + PR_BACKUP ))
    emit_schedule
  fi
  if [ "$NOW" -ge "$NEXT" ]; then
    emit_tick
    NEXT=$(( NOW + INTERVAL ))
    emit_schedule
  fi
  WAIT=$(( NEXT - $(date +%s) ))
  PR_WAIT=$(( PR_NEXT - $(date +%s) ))
  if [ "$PR_WAIT" -lt "$WAIT" ]; then
    WAIT=$PR_WAIT
  fi
  if [ "$WAIT" -le 0 ]; then
    continue
  fi
  if [ "$WAIT" -gt "$POLL" ]; then
    WAIT=$POLL
  fi
  sleep "$WAIT"
done
