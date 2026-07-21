#!/usr/bin/env bash
# Pick up a dev-factory Jira ticket (transition, assign, estimate, scope).
# Usage: pickup_jira_ticket.sh <slug> <JIRA_KEY> --scope "..." [--points N] [--dry-run]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SLUG="${1:-}"
if [[ -z "$SLUG" ]]; then
  echo "Usage: pickup_jira_ticket.sh <slug> <JIRA_KEY> --scope \"...\" [--points N]" >&2
  exit 2
fi
shift
export DEV_AGENT_SLUG="$SLUG"
# shellcheck disable=SC1091
source "$ROOT/scripts/source_project_secrets.sh" "$SLUG"
exec npx tsx "$ROOT/scripts/pickup_jira_ticket.ts" "$SLUG" "$@"
