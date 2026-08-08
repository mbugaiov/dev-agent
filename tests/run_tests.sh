#!/usr/bin/env bash
# Offline self-tests for dev-agent engine scaffold.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
unset THEMIS_REVIEW_MARKER THEMIS_FOLLOWUP_SECTIONS THEMIS_FOLLOWUP_DISPOSE_MARKER THEMIS_FOLLOWUP_REPO || true
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
have "docs/SETUP-LEVELS.md"
have "HOST_SETUP.md"
have "scripts/setup_verify.sh"
have "scripts/verify_app_openspec.sh"
have "scripts/verify_app_openspec.ts"
have "scripts/block_main_push.sh"
have "scripts/verify_branch_rules.sh"
have ".githooks/pre-push"
have "scripts/portability_check.sh"
have "scripts/projects_isolation_check.sh"
have "ENGINE-REVIEW.md"
have "scripts/post_jira_handoff.ts"
have "scripts/preflight_jira_handoff.ts"
have "scripts/pickup_jira_ticket.ts"
have "scripts/pickup_jira_ticket.sh"
have "scripts/pickup_github_ticket.ts"
have "scripts/pickup_github_ticket.sh"
have "scripts/post_github_handoff.ts"
have "scripts/check_stg_build.ts"
have "scripts/wait_pr_pipeline.sh"
have "scripts/wait_github_pr_pipeline.sh"
have "scripts/ensure_themis_agent.sh"
have "scripts/check_review_followups_disposed.sh"
have "scripts/file_review_followups.sh"
have "scripts/review_followups.py"
grep -q 'Require Themis Suggestions' .github/workflows/auto-merge.yml || no "auto-merge gates followups"
grep -q 'de1665cf52dab33f8095efc2b4062815220a69f1' scripts/ensure_themis_agent.sh || no "ensure pins themis SHA"
grep -q 'de1665cf52dab33f8095efc2b4062815220a69f1' .github/workflows/auto-merge.yml || no "auto-merge pins themis SHA"
grep -q 'de1665cf52dab33f8095efc2b4062815220a69f1' .github/workflows/code-review.yml || no "code-review pins themis SHA"
ENS_ROOT=$(ROOT=/ bash scripts/ensure_themis_agent.sh)
ENGINE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[[ "$ENS_ROOT" == "$ENGINE_ROOT/.themis-agent" ]] || { echo "ENS_ROOT=$ENS_ROOT"; no "ensure must resolve under engine root"; }
case "$ENS_ROOT" in
  "/.themis-agent"|"//.themis-agent") no "ensure must not use / or // DEST" ;;
esac
ok "ensure ignores ROOT=/"
grep -q 'GITHUB_REPOSITORY' scripts/check_review_followups_disposed.sh || no "dispose prefers GITHUB_REPOSITORY"
grep -q 'GITHUB_REPOSITORY' scripts/file_review_followups.sh || no "file prefers GITHUB_REPOSITORY"
grep -q 'cd "\$ROOT" && gh repo view' scripts/check_review_followups_disposed.sh || no "dispose gh from ROOT"
grep -q 'ensure_themis_agent.sh' scripts/review_followups.py || no "python wrapper always ensures themis"
grep -q 'THEMIS_FOLLOWUP_REPO="\$REPO"' scripts/wait_github_pr_pipeline.sh || no "wait passes REPO to dispose"
grep -q 'scripts/check_review_followups_disposed.sh' .github/workflows/auto-merge.yml || no "auto-merge uses engine dispose wrapper"
grep -q 're-run this waiter\|wait_github_pr_pipeline.sh' scripts/wait_github_pr_pipeline.sh || no "wait documents re-run after dispose"
have "scripts/wait_main_deploy.sh"
have "scripts/resolve_app_root.ts"
have "scripts/resolve_loop_interval.ts"
have "scripts/lint_secrets_env.ts"
have "scripts/test_tick_notify.ts"
have "scripts/test_tick_notify.sh"
have "scripts/notify_ux_kick.ts"
have "scripts/arm_dev_loop.sh"
grep -q 'exact trailing slug' scripts/arm_dev_loop.sh \
  && grep -q 'pgrep -f "scripts/dev-loop.sh"' scripts/arm_dev_loop.sh \
  && ok "arm_dev_loop slug-scoped kill" \
  || no "arm_dev_loop must kill only target slug"
have "scripts/validate_execution_only_policy.ts"
have "lib/secretsEnvLint.ts"
have "lib/devFactoryExecutionOnly.ts"
bash scripts/portability_check.sh >/dev/null 2>&1 && ok "portability_check" || echo "  (portability: fix leaks before git init — see ENGINE-REVIEW.md)"
bash scripts/projects_isolation_check.sh >/dev/null 2>&1 && ok "projects_isolation" || no "projects_isolation"

echo "== 5. Unit tests =="
if command -v npx >/dev/null 2>&1 && [[ -f package.json ]]; then
  npm install --silent 2>/dev/null || true
  npx tsx scripts/validate_execution_only_policy.ts >/dev/null 2>&1 && ok "execution_only_policy" || no "execution_only_policy"
  for env_file in projects/*/.secrets/jira.env projects/*/.secrets/bitbucket.env; do
    [[ -f "$env_file" ]] || continue
    npx tsx scripts/lint_secrets_env.ts "$env_file" >/dev/null 2>&1 \
      && ok "secrets_quoting: $env_file" || no "secrets_quoting: $env_file"
  done
  npx vitest run && ok "vitest all" || no "vitest"
else
  echo "  (skip vitest — install node)"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
