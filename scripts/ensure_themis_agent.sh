#!/usr/bin/env bash
# Ensure mbugaiov/themis-agent is checked out at .themis-agent (follow-up + isolation scripts).
# Usage: source or bash scripts/ensure_themis_agent.sh
set -euo pipefail
# Do not honor empty ROOT= from the environment (breaks DEST into "//.themis-agent").
if [[ -z "${ROOT:-}" ]]; then
  ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fi
DEST="${THEMIS_AGENT_PATH:-$ROOT/.themis-agent}"
REPO_URL="${THEMIS_AGENT_GIT_URL:-https://github.com/mbugaiov/themis-agent.git}"

if [[ -f "$DEST/scripts/check_review_followups_disposed.sh" ]]; then
  echo "$DEST"
  exit 0
fi

rm -rf "$DEST"
if ! git clone --depth 1 "$REPO_URL" "$DEST"; then
  echo "ensure_themis_agent: git clone failed: $REPO_URL" >&2
  exit 1
fi
echo "$DEST"
