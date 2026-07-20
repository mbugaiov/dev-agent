#!/usr/bin/env bash
# Delegate to an app-repo script (MR pipeline, deploy wait, etc.).
# Usage: run_app_script.sh <slug> <script-key|relative-path> [args...]
#   script-key: wait_pr_pipeline | wait_main_deploy | resolve_pr
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SLUG="${1:-}"
SCRIPT_ARG="${2:-}"
if [[ -z "$SLUG" || -z "$SCRIPT_ARG" ]]; then
  echo "Usage: run_app_script.sh <slug> <script-key-or-path> [args...]" >&2
  exit 2
fi
shift 2
export DEV_AGENT_SLUG="$SLUG"
# shellcheck disable=SC1091
source "$ROOT/scripts/source_project_secrets.sh" "$SLUG" || true
APP="$(npx tsx "$ROOT/scripts/resolve_app_root.ts" "$SLUG")"
case "$SCRIPT_ARG" in
  wait_pr_pipeline|wait_main_deploy|resolve_pr)
    SCRIPT="$(npx tsx "$ROOT/scripts/resolve_app_script.ts" "$SLUG" "$SCRIPT_ARG")"
    ;;
  *)
    SCRIPT="$SCRIPT_ARG"
    ;;
esac
TARGET="$APP/$SCRIPT"
if [[ ! -f "$TARGET" ]]; then
  echo "APP_SCRIPT_MISSING {\"slug\":\"$SLUG\",\"path\":\"$TARGET\"}" >&2
  exit 1
fi
cd "$APP"
exec bash "$TARGET" "$@"
