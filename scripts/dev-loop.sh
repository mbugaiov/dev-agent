#!/usr/bin/env bash
# Dev factory scheduler (internal — use scripts/arm_dev_loop.sh only).
# Usage: bash scripts/dev-loop.sh <slug>
#
# DEV_LOOP_EXIT_ON_IDLE=1 — Kairos oneshot mode: after backlog drains to IDLE, exit
# (no permanent loop). Default remains forever-loop for legacy arms.
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
EXIT_ON_IDLE="${DEV_LOOP_EXIT_ON_IDLE:-0}"
SAW_WORK=0
PID_FILE="$ROOT/projects/$SLUG/factory/loop.pid"

cleanup_exit() {
  local code="${1:-0}"
  rm -f "$PID_FILE"
  exit "$code"
}

emit_tick() {
  export DEV_FACTORY_NEXT_WAKE_EPOCH="$(( $(date +%s) + INTERVAL ))"
  local out
  out="$(bash "$ROOT/scripts/dev_factory_tick.sh" "$SLUG" 2>&1)" || true
  printf '%s\n' "$out"
  if echo "$out" | grep -q '^BACKLOG_WAKE_EXECUTE'; then
    SAW_WORK=1
  fi
  if echo "$out" | grep -q '^DEV_FACTORY_IDLE\|^JIRA_UNAVAILABLE\|^GITHUB_UNAVAILABLE'; then
    if [[ "$EXIT_ON_IDLE" == "1" ]]; then
      # Only sleep when the tick *is* idle (not when the wake prompt mentions IDLE).
      if echo "$out" | grep -q '^DEV_FACTORY_IDLE'; then
        printf 'LOOP_EXIT_IDLE {"slug":"%s","sawWork":%s}\n' "$SLUG" "$SAW_WORK"
        cleanup_exit 0
      fi
    fi
  fi
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
  printf 'LOOP_NEXT_WAKE {"slug":"%s","nextBacklogWake":"%s","nextPrBackupWake":"%s","backlogWakeInSec":%s,"prBackupWakeInSec":%s,"intervalSec":%s,"prBackupSec":%s,"exitOnIdle":%s}\n' \
    "$SLUG" "$(format_ts "$NEXT")" "$(format_ts "$PR_NEXT")" "$backlog_in" "$pr_in" "$INTERVAL" "$PR_BACKUP" "$EXIT_ON_IDLE"
}

if [[ "$EXIT_ON_IDLE" == "1" ]]; then
  printf 'LOOP_ONESHOT {"slug":"%s","intervalSec":%s}\n' "$SLUG" "$INTERVAL"
fi

NEXT=$(( $(date +%s) + INTERVAL ))
PR_NEXT=$(( $(date +%s) + PR_BACKUP ))

emit_tick
# If EXIT_ON_IDLE and first tick was IDLE, emit_tick already exited.
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
