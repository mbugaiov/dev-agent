#!/usr/bin/env bash
# Poll GitHub PR checks until required engine GitHub gates are green (or failed).
# Required: test, review (Themis), isolation (Themis)
#
# Usage: bash scripts/wait_github_pr_pipeline.sh <PR_NUMBER> [POLL_SEC]
# Exit 0 → PR_PIPELINE_GREEN — safe to merge.
# Exit 1 → PR_PIPELINE_FAILED — fix Blocking / CI first. Do NOT merge.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PR="${1:-}"
POLL="${2:-30}"
if [[ -z "$PR" || ! "$PR" =~ ^[0-9]+$ ]]; then
  echo "Usage: wait_github_pr_pipeline.sh <PR_NUMBER> [POLL_SEC]" >&2
  exit 2
fi

REPO="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
REQUIRED=("test" "review (Themis)" "isolation (Themis)")
echo "Waiting on PR #$PR in $REPO (required: ${REQUIRED[*]}; poll ${POLL}s)..."

while true; do
  OUT="$(gh pr checks "$PR" -R "$REPO" 2>&1 || true)"
  echo "$OUT"
  echo "---"

  FAIL=0
  PENDING=0
  for name in "${REQUIRED[@]}"; do
    # gh pr checks columns: name, state, ...
    line="$(echo "$OUT" | awk -v n="$name" 'BEGIN{FS="\t"} $1==n {print; found=1} END{if(!found) exit 1}' 2>/dev/null \
      || echo "$OUT" | grep -F "$name" | head -1 || true)"
    if [[ -z "$line" ]]; then
      echo "check missing: $name"
      PENDING=1
      continue
    fi
    low="$(echo "$line" | tr '[:upper:]' '[:lower:]')"
    if echo "$low" | grep -qE 'fail|failure|cancel|timed'; then
      echo "check FAILED: $name"
      FAIL=1
    elif echo "$low" | grep -qE 'pass|success|skip'; then
      echo "check OK: $name"
    else
      echo "check pending: $name"
      PENDING=1
    fi
  done

  if [[ "$FAIL" -eq 1 ]]; then
    echo "PR_PIPELINE_FAILED {\"pr\":${PR},\"repo\":\"${REPO}\"}"
    echo "Do NOT merge — fix review Blocking issues / CI, then push and wait again."
    exit 1
  fi
  if [[ "$PENDING" -eq 0 ]]; then
    # Suggestions / High priority / Risks must be fixed in PR or filed to backlog
    # Re-use resolved REPO so dispose cannot disagree with checks above.
    # After filing follow-ups, re-run this waiter (fail-closed until disposed).
    if ! THEMIS_FOLLOWUP_REPO="$REPO" bash "$ROOT/scripts/check_review_followups_disposed.sh" "$PR"; then
      echo "PR_PIPELINE_FAILED {\"pr\":${PR},\"repo\":\"${REPO}\",\"reason\":\"followups_undisposed\"}"
      echo "File/fix Suggestions·Risks then re-run: bash scripts/wait_github_pr_pipeline.sh $PR"
      exit 1
    fi
    echo "PR_PIPELINE_GREEN {\"pr\":${PR},\"repo\":\"${REPO}\"}"
    exit 0
  fi
  sleep "$POLL"
done
