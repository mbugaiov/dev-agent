#!/usr/bin/env bash
# Best-effort mid-flight progress post for wait_pr_* scripts.
# Reads projects/<slug>/factory/progress-ticket.key (or DEV_PROGRESS_TICKET).
# Never fails the caller — tracker outages must not block pipelines.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SLUG="${1:-}"
MILESTONE="${2:-}"
DETAIL="${3:-}"
SEAT="${DEV_PROGRESS_SEAT:-Hephaestus}"

[[ -n "$SLUG" && -n "$MILESTONE" && -n "$DETAIL" ]] || exit 0

TICKET="${DEV_PROGRESS_TICKET:-}"
if [[ -z "$TICKET" && -f "$ROOT/projects/$SLUG/factory/progress-ticket.key" ]]; then
  TICKET="$(tr -d '[:space:]' <"$ROOT/projects/$SLUG/factory/progress-ticket.key" || true)"
fi
[[ -n "$TICKET" ]] || exit 0

# github_issues latch may be "slug#N" — post_agent_progress wants N or KEY
TARGET="$TICKET"
if [[ "$TICKET" == *"#"* ]]; then
  TARGET="${TICKET##*#}"
fi

# shellcheck disable=SC1091
source "$ROOT/scripts/source_project_secrets.sh" "$SLUG" 2>/dev/null || true
bash "$ROOT/scripts/post_agent_progress.sh" "$SLUG" "$TARGET" "$SEAT" "$MILESTONE" "$DETAIL" \
  >/dev/null 2>&1 || true
exit 0
