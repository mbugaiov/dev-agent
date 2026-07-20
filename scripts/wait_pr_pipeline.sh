#!/usr/bin/env bash
# Poll Bitbucket PR pipeline — delegates to app repo script.
# Usage: wait_pr_pipeline.sh <slug> <PR_ID> [POLL_SEC]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SLUG="${1:-}"
PR_ID="${2:-}"
if [[ -z "$SLUG" || -z "$PR_ID" || ! "$PR_ID" =~ ^[0-9]+$ ]]; then
  echo "Usage: wait_pr_pipeline.sh <slug> <PR_ID> [POLL_SEC]" >&2
  exit 2
fi
shift 2
exec bash "$ROOT/scripts/run_app_script.sh" "$SLUG" wait_pr_pipeline "$PR_ID" "$@"
