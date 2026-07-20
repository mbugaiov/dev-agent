#!/usr/bin/env bash
# Offline self-tests for dev-agent engine scaffold.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ✓ $1"; }
no()  { FAIL=$((FAIL+1)); echo "  ✗ $1"; }
have(){ [[ -e "$1" ]] && ok "exists: $1" || no "missing: $1"; }

echo "== 1. Engine spine =="
for f in AGENTS.md ARCHITECTURE.md PORTABILITY.md EXTRACTION-MAP.md README.md; do
  have "$f"
done

echo "== 2. new_project.sh scaffolds =="
SLUG="selftest"
rm -rf "projects/$SLUG"
./scripts/new_project.sh "$SLUG" "TST-1" "Self Test" >/dev/null 2>&1 || no "new_project.sh"
have "projects/$SLUG/project.yaml"
have "projects/$SLUG/docs/DEFINITION-OF-DONE.md"
grep -q "TST-1" "projects/$SLUG/project.yaml" && ok "epic_key substituted" || no "epic_key"
rm -rf "projects/$SLUG"

echo "== 3. Skills and rules =="
have ".cursor/skills/dev-factory-loop/SKILL.md"
have ".cursor/skills/dev-mr-pipeline/SKILL.md"
have ".cursor/skills/dev-jira/SKILL.md"
have ".cursor/skills/dev-code-review/SKILL.md"
have ".cursor/rules/code-review.mdc"
have "scripts/pre_merge_check.sh"
have "scripts/check_review_gate.sh"
have ".cursor/skills/dev-phases/SKILL.md"
have ".cursor/rules/dev-engine.mdc"

echo "== 4. Portability scripts =="
have "SETUP.md"
have "HOST_SETUP.md"
have "scripts/setup_verify.sh"
have "scripts/portability_check.sh"
have "scripts/projects_isolation_check.sh"
have "ENGINE-REVIEW.md"
have "scripts/post_jira_handoff.ts"
have "scripts/preflight_jira_handoff.ts"
have "scripts/check_stg_build.ts"
have "scripts/wait_pr_pipeline.sh"
have "scripts/wait_main_deploy.sh"
have "scripts/resolve_app_root.ts"
bash scripts/portability_check.sh >/dev/null 2>&1 && ok "portability_check" || echo "  (portability: fix leaks before git init — see ENGINE-REVIEW.md)"
bash scripts/projects_isolation_check.sh >/dev/null 2>&1 && ok "projects_isolation" || no "projects_isolation"

echo "== 5. Unit tests =="
if command -v npx >/dev/null 2>&1 && [[ -f package.json ]]; then
  npm install --silent 2>/dev/null || true
  npx vitest run && ok "vitest all" || no "vitest"
else
  echo "  (skip vitest — install node)"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
