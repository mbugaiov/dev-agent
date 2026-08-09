#!/usr/bin/env bash
# Fail if the app repo contains agent-skill / factory leakage (client-facing hygiene).
# Usage: bash scripts/check_app_client_hygiene.sh <slug>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SLUG="${1:-}"
if [[ -z "$SLUG" ]]; then
  echo "Usage: $0 <slug>" >&2
  exit 2
fi

APP="$(npx tsx "$ROOT/scripts/resolve_app_root.ts" "$SLUG" 2>/dev/null || true)"
if [[ -z "$APP" || ! -d "$APP" ]]; then
  echo "CLIENT_HYGIENE_SKIP {\"slug\":\"$SLUG\",\"reason\":\"app root unresolved\"}"
  exit 0
fi

FAIL=0
fail() {
  echo "CLIENT_HYGIENE_FAIL $1" >&2
  FAIL=1
}

cd "$APP"

# Tracked-only checks when git available
tracked() {
  if [[ -d .git ]] || [[ -f .git ]]; then
    git ls-files "$@" 2>/dev/null || true
  else
    # fallback: filesystem
    find "$@" -type f 2>/dev/null || true
  fi
}

if [[ -n "$(tracked '.cursor/skills' '.agents/skills' 2>/dev/null | head -1)" ]] \
  || [[ -d .cursor/skills && -n "$(find .cursor/skills -type f 2>/dev/null | head -1)" && -n "$(git ls-files '.cursor/skills/**' 2>/dev/null | head -1)" ]]; then
  if git ls-files '.cursor/skills/**' '.agents/**' 2>/dev/null | grep -q .; then
    fail "tracked .cursor/skills or .agents in app — move to engine"
  fi
fi

while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  fail "tracked skill/factory doc: $f"
done < <(git ls-files \
  'docs/SKILLS.md' 'docs/SKILLS-INSTALL.md' 'docs/runbooks/DOTNET-SKILLS.md' \
  'docs/AGENT-PREP.md' 'docs/PRE-START-STATUS.md' \
  'scripts/sync_dotnet_skills.sh' 'scripts/sync_stack_skills.sh' \
  '.cursor/rules/**' \
  2>/dev/null || true)

# Content leaks in tracked markdown / rules / AGENTS
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  if git grep -n -E \
    'sync_stack_skills|skills\.sh/|analogjs/angular-skills|github\.com/dotnet/skills|dev-agent/\.agents|dev-agent/\.cursor/skills|bash \.\./dev-agent/scripts/sync' \
    -- "$f" >/dev/null 2>&1; then
    fail "skill/engine path leak in $f"
  fi
done < <(git ls-files 'AGENTS.md' 'docs/**/*.md' '.cursor/rules/**' 'README.md' 2>/dev/null || true)

if [[ "$FAIL" -ne 0 ]]; then
  echo "CLIENT_HYGIENE_FAIL {\"slug\":\"$SLUG\",\"app\":\"$APP\"}" >&2
  exit 1
fi

echo "CLIENT_HYGIENE_OK {\"slug\":\"$SLUG\",\"app\":\"$APP\"}"
exit 0
