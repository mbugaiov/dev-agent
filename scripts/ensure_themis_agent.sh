#!/usr/bin/env bash
# Ensure mbugaiov/themis-agent is at .themis-agent (follow-up + isolation scripts).
# Always derives ROOT from this script's location (ignores env ROOT=/ etc.).
# Pins to THEMIS_AGENT_REF (default: known-good main SHA) and refreshes on each call.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${THEMIS_AGENT_PATH:-$ROOT/.themis-agent}"
REPO_URL="${THEMIS_AGENT_GIT_URL:-https://github.com/mbugaiov/themis-agent.git}"
# Bump when intentionally upgrading shared follow-up / isolation tooling.
REF="${THEMIS_AGENT_REF:-de1665cf52dab33f8095efc2b4062815220a69f1}"

checkout_pin() {
  git -C "$DEST" fetch --depth 1 origin "$REF"
  git -C "$DEST" checkout --detach --force FETCH_HEAD
}

if [[ -d "$DEST/.git" ]]; then
  if ! checkout_pin 2>/dev/null; then
    echo "ensure_themis_agent: refresh to ${REF:0:12} failed — recloning" >&2
    rm -rf "$DEST"
  fi
fi

if [[ ! -f "$DEST/scripts/check_review_followups_disposed.sh" ]]; then
  rm -rf "$DEST"
  if ! git clone --depth 1 "$REPO_URL" "$DEST"; then
    echo "ensure_themis_agent: git clone failed: $REPO_URL" >&2
    exit 1
  fi
  if ! checkout_pin; then
    echo "ensure_themis_agent: checkout pin $REF failed" >&2
    exit 1
  fi
fi

if [[ ! -f "$DEST/scripts/check_review_followups_disposed.sh" ]]; then
  echo "ensure_themis_agent: follow-up scripts missing under $DEST" >&2
  exit 1
fi
echo "$DEST"
