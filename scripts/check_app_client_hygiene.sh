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

if [[ -d .git ]] || [[ -f .git ]]; then
  :
else
  echo "CLIENT_HYGIENE_SKIP {\"slug\":\"$SLUG\",\"reason\":\"app is not a git checkout\"}"
  exit 0
fi

# Tracked skill packs
if git ls-files '.cursor/skills/**' '.agents/**' 2>/dev/null | grep -q .; then
  fail "tracked .cursor/skills or .agents in app — move to engine"
fi

# Skill / factory docs (portable globs)
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  fail "tracked skill/factory doc: $f"
done < <(git ls-files \
  'docs/SKILLS.md' 'docs/SKILLS-*.md' 'docs/**/SKILLS*.md' \
  'docs/**/*SKILLS*.md' \
  'scripts/sync_*skills*' 'scripts/sync_*_skills*' \
  2>/dev/null || true)

# Also catch common install/runbook names under docs/
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  base="$(basename "$f")"
  case "$base" in
    SKILLS.md|SKILLS-INSTALL.md|*SKILLS*.md)
      fail "tracked skill doc: $f"
      ;;
  esac
done < <(git ls-files 'docs/**/*.md' 2>/dev/null || true)

# .cursor/rules — allow only product CR pointer; ban factory / skill wiring
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  base="$(basename "$f")"
  case "$base" in
    code-review.mdc)
      # allowed — must not leak skill/engine paths (content scan below)
      ;;
    factory-*.mdc|*skill*.mdc|*skills*.mdc)
      fail "tracked factory/skill rule in app: $f — move to projects/<slug>/.cursor/rules"
      ;;
    *)
      fail "tracked app .cursor/rules/$base — keep factory rules in engine; product standards in docs/CODE_STANDARDS.md (optional code-review.mdc only)"
      ;;
  esac
done < <(git ls-files '.cursor/rules/**' 2>/dev/null || true)

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
