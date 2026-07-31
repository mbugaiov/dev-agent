#!/usr/bin/env bash
# Smoke-test dev factory tick notification delivery.
# Usage: bash scripts/test_tick_notify.sh <slug> [--idle]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SLUG="${1:-${DEV_AGENT_SLUG:-}}"
if [[ -z "$SLUG" ]]; then
  echo "Usage: test_tick_notify.sh <slug> [--idle]" >&2
  exit 2
fi
shift || true
cd "$ROOT"
export DEV_AGENT_SLUG="$SLUG"
# shellcheck disable=SC1091
source "$ROOT/scripts/source_project_secrets.sh" "$SLUG"
exec npx tsx "$ROOT/scripts/test_tick_notify.ts" "$SLUG" "$@"
