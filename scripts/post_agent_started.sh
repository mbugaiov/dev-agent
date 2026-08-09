#!/usr/bin/env bash
# Wrapper — see post_agent_started.ts (GitHub Issues/PR or Jira).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
exec npx tsx scripts/post_agent_started.ts "$@"
