#!/usr/bin/env bash
# Run headless Cursor code review on branch diff; write review.md and enforce gate.
#
# Usage:
#   scripts/run_code_review.sh [base-branch]
#   BASE=main scripts/run_code_review.sh
#
# Requires: cursor-agent on PATH, CURSOR_API_KEY in env.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
BASE="${1:-${BASE:-main}}"

if ! command -v cursor-agent >/dev/null 2>&1; then
  echo "ERROR: cursor-agent not on PATH — install Cursor CLI (see HOST_SETUP.md)" >&2
  exit 1
fi

if [[ -z "${CURSOR_API_KEY:-}" ]]; then
  echo "ERROR: CURSOR_API_KEY not set" >&2
  exit 1
fi

git fetch origin "$BASE" --quiet 2>/dev/null || true

THEMIS_ROOT="${THEMIS_AGENT_PATH:-$ROOT/.themis-agent}"
if [[ ! -x "$THEMIS_ROOT/scripts/build_review_prompt.sh" ]]; then
  THEMIS_ROOT="$(bash "$ROOT/scripts/ensure_themis_agent.sh")"
fi
PROMPT="$(bash "$THEMIS_ROOT/scripts/build_review_prompt.sh" \
  --pr "${PR:-0}" \
  --base "origin/${BASE}" \
  --label dev-agent \
  --local-rule .cursor/rules/code-review.mdc \
  --agents AGENTS.md \
  --themis-root "$THEMIS_ROOT")"

echo "Running cursor-agent review (base=origin/${BASE})..."
if cursor-agent --force --api-key "$CURSOR_API_KEY" --output-format text -p "$PROMPT" > review.md; then
  :
else
  echo "cursor-agent exited non-zero — see review.md if partial"
fi

if [[ ! -s review.md ]]; then
  echo "Cursor review produced no output (see build log above)." > review.md
fi

cat review.md
echo ""
bash scripts/check_review_gate.sh review.md
