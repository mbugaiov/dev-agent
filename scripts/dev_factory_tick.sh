#!/usr/bin/env bash
# Query dev factory Jira backlog and emit BACKLOG_WAKE / DEV_FACTORY_IDLE.
# Usage: bash scripts/dev_factory_tick.sh <slug>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SLUG="${1:-${DEV_AGENT_SLUG:-}}"
if [[ -z "$SLUG" ]]; then
  echo "Usage: dev_factory_tick.sh <slug>" >&2
  exit 1
fi
cd "$ROOT"
export DEV_AGENT_SLUG="$SLUG"
# shellcheck disable=SC1091
source "$ROOT/scripts/source_project_secrets.sh" "$SLUG" || true
exec npx tsx scripts/dev_factory_tick.ts "$SLUG"
