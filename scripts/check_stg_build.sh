#!/usr/bin/env bash
# Verify STG buildId matches merge commit.
# Usage: check_stg_build.sh <slug> <expected_commit_prefix>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SLUG="${1:-}"
COMMIT="${2:-}"
if [[ -z "$SLUG" || -z "$COMMIT" ]]; then
  echo "Usage: check_stg_build.sh <slug> <expected_commit>" >&2
  exit 2
fi
cd "$ROOT"
export DEV_AGENT_SLUG="$SLUG"
exec npx tsx scripts/check_stg_build.ts "$SLUG" "$COMMIT"
