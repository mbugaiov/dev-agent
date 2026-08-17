#!/usr/bin/env bash
# Cursor afterAgentResponse — arm /summarize latch after oneshot drain markers.
# Engine-tree: <engine>/.cursor/hooks → ../..
# Workspace-root: <workspace>/.cursor/hooks → ./dev-agent or $DEV_FACTORY_ENGINE_ROOT
set -euo pipefail
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
resolve_engine_root() {
  if [[ -n "${DEV_FACTORY_ENGINE_ROOT:-}" && -f "$DEV_FACTORY_ENGINE_ROOT/scripts/dev_factory_after_agent_response_hook.ts" ]]; then
    printf '%s\n' "$DEV_FACTORY_ENGINE_ROOT"
    return 0
  fi
  if [[ -f "$HOOK_DIR/../../scripts/dev_factory_after_agent_response_hook.ts" ]]; then
    cd "$HOOK_DIR/../.." && pwd
    return 0
  fi
  if [[ -f "$HOOK_DIR/../../dev-agent/scripts/dev_factory_after_agent_response_hook.ts" ]]; then
    cd "$HOOK_DIR/../../dev-agent" && pwd
    return 0
  fi
  return 1
}
ROOT="$(resolve_engine_root)" || {
  echo "dev-factory-after-agent-response: engine root not found (set DEV_FACTORY_ENGINE_ROOT)" >&2
  echo '{}'
  exit 0
}
cd "$ROOT"
exec npx tsx scripts/dev_factory_after_agent_response_hook.ts
