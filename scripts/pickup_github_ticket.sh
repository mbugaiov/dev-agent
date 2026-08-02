#!/usr/bin/env bash
# Pick up a GitHub Issues factory ticket (ensure pickup label, scope comment).
# Usage: pickup_github_ticket.sh <slug> <issue#> --scope "..." [--dry-run]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SLUG="${1:-}"
if [[ -z "$SLUG" ]]; then
  echo "Usage: pickup_github_ticket.sh <slug> <issue#> --scope \"...\"" >&2
  exit 2
fi
shift
export DEV_AGENT_SLUG="$SLUG"
exec npx tsx "$ROOT/scripts/pickup_github_ticket.ts" "$SLUG" "$@"
