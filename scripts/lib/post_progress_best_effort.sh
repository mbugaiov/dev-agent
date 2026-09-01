#!/usr/bin/env bash
# Best-effort mid-flight progress post for wait_pr_* scripts.
# Reads projects/<slug>/factory/progress-ticket.key (or DEV_PROGRESS_TICKET).
# Dual-write Bitbucket PR when progress-pr.key / DEV_PROGRESS_PR is set
# (post_agent_progress.ts handles git.provider=bitbucket).
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

PR_ID="${DEV_PROGRESS_PR:-}"
if [[ -z "$PR_ID" && -f "$ROOT/projects/$SLUG/factory/progress-pr.key" ]]; then
  PR_ID="$(tr -d '[:space:]' <"$ROOT/projects/$SLUG/factory/progress-pr.key" || true)"
fi

# shellcheck disable=SC1091
source "$ROOT/scripts/source_project_secrets.sh" "$SLUG" 2>/dev/null || true

# Primary: Jira KEY or GitHub issue number from latch
if [[ -n "$TICKET" ]]; then
  TARGET="$TICKET"
  if [[ "$TICKET" == *"#"* ]]; then
    TARGET="${TICKET##*#}"
  fi
  bash "$ROOT/scripts/post_agent_progress.sh" "$SLUG" "$TARGET" "$SEAT" "$MILESTONE" "$DETAIL" \
    >/dev/null 2>&1 || true
elif [[ -n "$PR_ID" ]]; then
  # PR-only (no Jira latch) — Bitbucket path via pr:N
  bash "$ROOT/scripts/post_agent_progress.sh" "$SLUG" "pr:${PR_ID}" "$SEAT" "$MILESTONE" "$DETAIL" \
    >/dev/null 2>&1 || true
fi

exit 0
