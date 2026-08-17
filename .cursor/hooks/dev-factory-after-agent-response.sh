#!/usr/bin/env bash
# Engine-local afterAgentResponse wrapper.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
exec npx tsx scripts/dev_factory_after_agent_response_hook.ts
