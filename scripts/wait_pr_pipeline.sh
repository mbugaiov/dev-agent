#!/usr/bin/env bash
# Poll Bitbucket PR pipeline — delegates to app repo script.
# Usage: wait_pr_pipeline.sh <slug> <PR_ID> [POLL_SEC]
# Posts mid-flight progress when projects/<slug>/factory/progress-ticket.key exists.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SLUG="${1:-}"
PR_ID="${2:-}"
if [[ -z "$SLUG" || -z "$PR_ID" || ! "$PR_ID" =~ ^[0-9]+$ ]]; then
  echo "Usage: wait_pr_pipeline.sh <slug> <PR_ID> [POLL_SEC]" >&2
  exit 2
fi
shift 2

bash "$ROOT/scripts/lib/post_progress_best_effort.sh" "$SLUG" pipeline_waiting \
  "PR #${PR_ID} — wait_pr_pipeline armed" || true

set +e
bash "$ROOT/scripts/run_app_script.sh" "$SLUG" wait_pr_pipeline "$PR_ID" "$@"
ec=$?
set -e

if [[ "$ec" -eq 0 ]]; then
  bash "$ROOT/scripts/lib/post_progress_best_effort.sh" "$SLUG" pipeline_green \
    "PR #${PR_ID} — pipeline green" || true
else
  bash "$ROOT/scripts/lib/post_progress_best_effort.sh" "$SLUG" pipeline_failed \
    "PR #${PR_ID} — pipeline failed (exit ${ec}); fix and re-run wait" || true
fi
exit "$ec"
