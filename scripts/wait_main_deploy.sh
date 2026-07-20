#!/usr/bin/env bash
# Poll main-branch STG deploy — delegates to app repo script.
# Usage: wait_main_deploy.sh <slug> [POLL_SEC] [EXPECTED_COMMIT]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SLUG="${1:-}"
if [[ -z "$SLUG" ]]; then
  echo "Usage: wait_main_deploy.sh <slug> [POLL_SEC] [EXPECTED_COMMIT]" >&2
  exit 2
fi
shift
exec bash "$ROOT/scripts/run_app_script.sh" "$SLUG" wait_main_deploy "$@"
