#!/usr/bin/env bash
# Ensure mbugaiov/themis-agent is at .themis-agent (follow-up + isolation scripts).
# Always derives ROOT from this script's location (ignores env ROOT=/ etc.).
# Pins to THEMIS_AGENT_REF; skips network when already ready + at pin.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${THEMIS_AGENT_PATH:-$ROOT/.themis-agent}"
REPO_URL="${THEMIS_AGENT_GIT_URL:-https://github.com/mbugaiov/themis-agent.git}"
# Bump when intentionally upgrading shared follow-up / isolation tooling.
# Keep in sync with ref: in .github/workflows (auto-merge.yml / code-review.yml).
REF="${THEMIS_AGENT_REF:-de1665cf52dab33f8095efc2b4062815220a69f1}"

ready() {
  [[ -f "$DEST/scripts/check_review_followups_disposed.sh" \
    && -f "$DEST/scripts/review_followups.py" \
    && -f "$DEST/scripts/ci_isolation.sh" ]]
}

at_pin() {
  local head
  head="$(git -C "$DEST" rev-parse HEAD 2>/dev/null || true)"
  [[ -n "$head" ]] || return 1
  [[ "$head" == "$REF" || "$head" == "$REF"* ]]
}

checkout_pin() {
  git -C "$DEST" fetch --depth 1 origin "$REF"
  git -C "$DEST" checkout --detach --force FETCH_HEAD
}

if [[ -d "$DEST/.git" ]]; then
  if ready && at_pin; then
    :
  elif checkout_pin && ready && at_pin; then
    :
  else
    echo "ensure_themis_agent: refresh to ${REF:0:12} failed — recloning" >&2
    rm -rf "$DEST"
  fi
fi

if ! ready || ! at_pin; then
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

if ! ready || ! at_pin; then
  echo "ensure_themis_agent: follow-up/isolation scripts missing or not at pin under $DEST" >&2
  exit 1
fi
echo "$DEST"
