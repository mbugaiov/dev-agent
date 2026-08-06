#!/usr/bin/env bash
# Cloud factory wake — tick then optionally spawn Cursor cloud Hephaestus.
# Usage:
#   bash scripts/cloud_factory_wake.sh <slug> [--dry-run]
# Env:
#   CURSOR_API_KEY   required unless --dry-run / CLOUD_FACTORY_DRY_RUN=1
#   GITHUB_TOKEN|GH_TOKEN  recommended for private GitHub Issues tick
#   CLOUD_FACTORY_DRY_RUN=1  plan only (no Agent.prompt)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SLUG="${1:-${DEV_AGENT_SLUG:-}}"
if [[ -z "$SLUG" ]]; then
  echo "Usage: cloud_factory_wake.sh <slug> [--dry-run]" >&2
  exit 1
fi
shift || true
EXTRA=()
for arg in "$@"; do
  EXTRA+=("$arg")
done
cd "$ROOT"
export DEV_AGENT_SLUG="$SLUG"
# shellcheck disable=SC1091
source "$ROOT/scripts/source_project_secrets.sh" "$SLUG" || true
exec npx tsx scripts/cloud_factory_wake.ts "$SLUG" "${EXTRA[@]}"
