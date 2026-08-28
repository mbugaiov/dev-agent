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

REPO_GUESS="$(
  python3 - <<PY
import re, pathlib
t = pathlib.Path("$ROOT/projects/$SLUG/project.yaml").read_text()
ws = re.search(r"(?ms)^git:\s*\n(?:[ \t]+.+\n)*?[ \t]+workspace:\s*(\S+)", t)
repo = re.search(r"(?ms)^git:\s*\n(?:[ \t]+.+\n)*?[ \t]+repo:\s*(\S+)", t)
if ws and repo:
  print(f"{ws.group(1).strip()}/{repo.group(1).strip()}")
else:
  print("")
PY
)"
REPO_GUESS="${REPO_GUESS:-unknown}"

if [[ "$ec" -eq 0 ]]; then
  bash "$ROOT/scripts/lib/write_pr_pipeline_result.sh" "$SLUG" "$PR_ID" "$REPO_GUESS" green || true
  bash "$ROOT/scripts/lib/post_progress_best_effort.sh" "$SLUG" pipeline_green \
    "PR #${PR_ID} — pipeline green" || true
else
  bash "$ROOT/scripts/lib/write_pr_pipeline_result.sh" "$SLUG" "$PR_ID" "$REPO_GUESS" failed "exit:$ec" || true
  bash "$ROOT/scripts/lib/post_progress_best_effort.sh" "$SLUG" pipeline_failed \
    "PR #${PR_ID} — pipeline failed (exit ${ec}); fix and re-run wait" || true
fi
exit "$ec"
