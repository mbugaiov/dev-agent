#!/usr/bin/env bash
# Ensure mbugaiov/themis-agent is checked out at .themis-agent (follow-up + isolation scripts).
# Usage: source or bash scripts/ensure_themis_agent.sh
set -euo pipefail
ROOT="${ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
DEST="${THEMIS_AGENT_PATH:-$ROOT/.themis-agent}"
REPO_URL="${THEMIS_AGENT_GIT_URL:-https://github.com/mbugaiov/themis-agent.git}"

if [[ -f "$DEST/scripts/check_review_followups_disposed.sh" ]]; then
  echo "$DEST"
  exit 0
fi

rm -rf "$DEST"
git clone --depth 1 "$REPO_URL" "$DEST" >/dev/null 2>&1
echo "$DEST"
