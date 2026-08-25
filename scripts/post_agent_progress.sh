#!/usr/bin/env bash
# Wrapper — see post_agent_progress.ts (GitHub Issues/PR or Jira).
# Upserts one living ### <Seat> progress comment per seat+ticket.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "${1:-}" != "--repo" && -n "${1:-}" && "${1:0:1}" != "-" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/scripts/source_project_secrets.sh" "$1" 2>/dev/null || true
fi

exec npx tsx scripts/post_agent_progress.ts "$@"
