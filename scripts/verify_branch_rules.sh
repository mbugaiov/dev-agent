#!/usr/bin/env bash
# Verify GitHub ruleset blocks direct pushes to main (requires gh + repo access).
# Usage: bash scripts/verify_branch_rules.sh [owner/repo]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="${1:-}"
if [[ -z "$REPO" ]]; then
  remote="$(git -C "$ROOT" config --get remote.origin.url 2>/dev/null || true)"
  if [[ "$remote" =~ github\.com[:/]([^/]+)/([^/.]+) ]]; then
    REPO="${BASH_REMATCH[1]}/${BASH_REMATCH[2]%.git}"
  fi
fi

if [[ -z "$REPO" ]]; then
  echo "BRANCH_RULES_SKIP no github.com origin" >&2
  exit 0
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "BRANCH_RULES_SKIP gh not installed" >&2
  exit 0
fi

status_rules="$(gh api "repos/$REPO/rules/branches/main" --jq '[.[] | select(.type=="required_status_checks")] | length' 2>/dev/null || echo 0)"
pr_rules="$(gh api "repos/$REPO/rules/branches/main" --jq '[.[] | select(.type=="pull_request")] | length' 2>/dev/null || echo 0)"

if [[ "$status_rules" -eq 0 && "$pr_rules" -eq 0 ]]; then
  echo "BRANCH_RULES_FAIL no active rules on main for $REPO" >&2
  exit 1
fi

if [[ "$status_rules" -eq 0 ]]; then
  echo "BRANCH_RULES_FAIL main missing required_status_checks rule" >&2
  exit 1
fi

if [[ "$pr_rules" -eq 0 ]]; then
  echo "BRANCH_RULES_FAIL main missing pull_request rule" >&2
  exit 1
fi

echo "BRANCH_RULES_OK {\"repo\":\"$REPO\",\"branch\":\"main\"}"
