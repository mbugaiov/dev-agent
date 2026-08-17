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
have "scripts/project_has_open_mrs.sh"
have "scripts/project_open_mrs.ts"
have ".cursor/skills/dev-phases/SKILL.md"
have ".cursor/rules/dev-engine.mdc"
have ".cursor/rules/dev-stack-skills.mdc"
have "scripts/sync_stack_skills.sh"
have "scripts/verify_stack_skills.sh"
have "docs/STACK-SKILLS.md"
have "scripts/post_agent_started.sh"
have "scripts/post_agent_started.ts"
have ".cursor/rules/dev-agent-start.mdc"
AGENT_START_OUT=$(AGENT_START_DRY_RUN=1 bash scripts/post_agent_started.sh --repo example/dev-agent pr:1 Hephaestus "pickup" "smoke" 2>&1 || true)
grep -q '### Hephaestus started' <<<"$AGENT_START_OUT" \
  && ok "post_agent_started dry-run banner" \
  || no "post_agent_started must print ### Hephaestus started (got: $AGENT_START_OUT)"
grep -q 'github.com/dotnet/skills' docs/STACK-SKILLS.md \
  && grep -q 'sync_stack_skills.sh' docs/STACK-SKILLS.md \
  && ok "STACK-SKILLS catalog has URLs + sync commands" \
  || no "docs/STACK-SKILLS.md must list upstream URLs and sync commands"
have "scripts/check_app_client_hygiene.sh"
have ".cursor/rules/dev-client-repo-hygiene.mdc"
# Smoke: clean+openspec OK; tracked stack skill FAIL
_hs="$(mktemp -d)"
git -C "$_hs" init -q
git -C "$_hs" config user.email "t@example.com"
git -C "$_hs" config user.name "t"
mkdir -p "$_hs/.cursor/skills/openspec-propose" "$_hs/docs"
echo "# o" >"$_hs/.cursor/skills/openspec-propose/SKILL.md"
echo "# std" >"$_hs/docs/CODE_STANDARDS.md"
git -C "$_hs" add -A && git -C "$_hs" commit -q -m init
mkdir -p "$_hs/.cursor/rules"
echo "# gate" >"$_hs/.cursor/rules/factory-ba-ux.mdc"
echo "# cr" >"$_hs/.cursor/rules/code-review.mdc"
git -C "$_hs" add -A && git -C "$_hs" commit -q -m rules
if bash scripts/check_app_client_hygiene.sh --app "$_hs" | grep -q CLIENT_HYGIENE_OK; then
  ok "hygiene OK for openspec + product process rules"
else
  no "hygiene should OK openspec + factory-*.mdc / code-review.mdc"
fi
mkdir -p "$_hs/.cursor/skills/dotnet-webapi"
echo "# leak" >"$_hs/.cursor/skills/dotnet-webapi/SKILL.md"
git -C "$_hs" add -A && git -C "$_hs" commit -q -m leak
if bash scripts/check_app_client_hygiene.sh --app "$_hs" >/dev/null 2>&1; then
  no "hygiene should FAIL on tracked stack skill"
else
  ok "hygiene FAIL on tracked stack skill"
fi
# skill-wiring rule name must fail even if prefixed with factory-
mkdir -p "$_hs/.cursor/rules"
echo "# bad" >"$_hs/.cursor/rules/factory-skills.mdc"
git -C "$_hs" rm -qr --cached .cursor/skills/dotnet-webapi >/dev/null 2>&1 || true
rm -rf "$_hs/.cursor/skills/dotnet-webapi"
git -C "$_hs" add -A && git -C "$_hs" commit -q -m skill-rule
if bash scripts/check_app_client_hygiene.sh --app "$_hs" >/dev/null 2>&1; then
  no "hygiene should FAIL on factory-skills.mdc"
else
  ok "hygiene FAIL on factory-skills.mdc"
fi
rm -rf "$_hs"
# Smoke: stack keyword match — host *.net must not imply .NET; _template refused
_ss="$(mktemp -d)"
mkdir -p "$_ss/projects/stack-host/factory" "$_ss/scripts"
cp scripts/verify_stack_skills.sh "$_ss/scripts/"
cat >"$_ss/projects/stack-host/project.yaml" <<'YAML'
slug: stack-host
stack:
  hosting: azurewebsites.net cdn.example.net
YAML
if ! (cd "$_ss" && bash scripts/verify_stack_skills.sh stack-host 2>&1 | grep -q '"packs":0'); then
  no "host-only *.net stack must match zero marketplace packs"
else
  ok "host-only *.net does not pull .NET packs"
fi
if bash scripts/verify_stack_skills.sh _template >/dev/null 2>&1; then
  no "verify_stack_skills must refuse _template"
else
  ok "verify_stack_skills refuses _template"
fi
rm -rf "$_ss"

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
grep -q '7170f1be9a0e8b87717e683e716c6b4207098cc6' scripts/ensure_themis_agent.sh || no "ensure pins themis SHA"
grep -q '7170f1be9a0e8b87717e683e716c6b4207098cc6' .github/workflows/auto-merge.yml || no "auto-merge pins themis SHA"
grep -q '7170f1be9a0e8b87717e683e716c6b4207098cc6' .github/workflows/code-review.yml || no "code-review pins themis SHA"
ENS_ROOT=$(ROOT=/ bash scripts/ensure_themis_agent.sh)
ENGINE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIN_SHA=7170f1be9a0e8b87717e683e716c6b4207098cc6
ENS_HEAD=$(git -C "$ENS_ROOT" rev-parse HEAD 2>/dev/null || true)
if [[ "$ENS_ROOT" == "$ENGINE_ROOT/.themis-agent" \
  && "$ENS_ROOT" != "/.themis-agent" \
  && "$ENS_ROOT" != "//.themis-agent" \
  && "$ENS_HEAD" == "$PIN_SHA" ]]; then
  ok "ensure ignores ROOT=/ and checks out pin"
else
  echo "ENS_ROOT=$ENS_ROOT ENS_HEAD=$ENS_HEAD"; no "ensure must resolve under engine root at pin"
fi
grep -q 'GITHUB_REPOSITORY' scripts/check_review_followups_disposed.sh || no "dispose prefers GITHUB_REPOSITORY"
grep -q 'GITHUB_REPOSITORY' scripts/file_review_followups.sh || no "file prefers GITHUB_REPOSITORY"
grep -q 'cd "\$ROOT" && gh repo view' scripts/check_review_followups_disposed.sh || no "dispose gh from ROOT"
grep -q 'ensure_themis_agent.sh' scripts/review_followups.py || no "python wrapper always ensures themis"
grep -q 'THEMIS_FOLLOWUP_REPO="\$REPO"' scripts/wait_github_pr_pipeline.sh || no "wait passes REPO to dispose"
grep -q 'scripts/check_review_followups_disposed.sh' .github/workflows/auto-merge.yml || no "auto-merge uses engine dispose wrapper"
grep -q 're-run this waiter\|wait_github_pr_pipeline.sh' scripts/wait_github_pr_pipeline.sh || no "wait documents re-run after dispose"
have "scripts/wait_main_deploy.sh"
# GHA STG apps: document the GITHUB_TOKEN push-suppress footgun.
grep -q 'GITHUB_TOKEN' .cursor/skills/dev-mr-pipeline/SKILL.md \
  && grep -q 'workflow_dispatch' .cursor/skills/dev-mr-pipeline/SKILL.md \
  || no "dev-mr-pipeline missing GITHUB_TOKEN / workflow_dispatch STG note"
have "scripts/resolve_app_root.ts"
have "scripts/resolve_loop_interval.ts"
have "scripts/lint_secrets_env.ts"
have "scripts/test_tick_notify.ts"
have "scripts/test_tick_notify.sh"
have "scripts/notify_ux_kick.ts"
have "scripts/arm_dev_loop.sh"
have "scripts/run_dev_loop.sh"
have "scripts/watch_dev_loop.sh"
grep -q 'stop_dev_loop.sh' scripts/arm_dev_loop.sh \
  && grep -q 'setsid' scripts/arm_dev_loop.sh \
  && grep -q 'loop.pid' scripts/arm_dev_loop.sh \
  && grep -q 'LOOP_WATCH_ATTACH_REQUIRED' scripts/arm_dev_loop.sh \
  && ok "arm_dev_loop stop-then-setsid detach + watch attach contract" \
  || no "arm_dev_loop must stop prior slug, detach via setsid, and require watcher"
grep -q 'watch_dev_loop.sh' scripts/run_dev_loop.sh \
  && grep -q 'LOOP_WATCH_ATTACH_REQUIRED' scripts/run_dev_loop.sh \
  && ok "run_dev_loop requires Cursor watcher" \
  || no "run_dev_loop.sh must require watch_dev_loop attach"
grep -q 'tail -n 200' scripts/watch_dev_loop.sh \
  && grep -q 'grep -E "\$WATCH_PATTERN"' scripts/watch_dev_loop.sh \
  && grep -q 'tail -n 0 -F' scripts/watch_dev_loop.sh \
  && grep -q 'LOOP_WATCH_EXIT' scripts/watch_dev_loop.sh \
  && grep -q 'scheduler_alive' scripts/watch_dev_loop.sh \
  && grep -q 'watch.pid' scripts/watch_dev_loop.sh \
  && ok "watch_dev_loop replays wakes, follows log, exits when scheduler gone" \
  || no "watch_dev_loop must replay, tail -F, and exit on scheduler death"
have "scripts/stop_dev_loop.sh"
grep -q 'watch_dev_loop' scripts/stop_dev_loop.sh \
  && grep -q 'LOOP_STOPPED' scripts/stop_dev_loop.sh \
  && grep -q 'kill_tree' scripts/stop_dev_loop.sh \
  && ok "stop_dev_loop kills scheduler + watchers (children first)" \
  || no "stop_dev_loop.sh must reap scheduler and watchers with kill_tree"

grep -q 'stop_dev_loop.sh' scripts/arm_dev_loop.sh \
  && ok "arm_dev_loop clears prior loop+watcher via stop_dev_loop" \
  || no "arm_dev_loop must call stop_dev_loop before re-arm"

have "lib/devFactoryHookRuntime.ts"
have "scripts/dev_factory_stop_hook.ts"
have "scripts/dev_factory_session_start_hook.ts"
grep -q 'resolveDevFactoryEngineRoot' scripts/dev_factory_stop_hook.ts \
  && ! grep -q 'if (!slug) {' scripts/dev_factory_stop_hook.ts \
  && ok "stop hook does not no-op without DEV_AGENT_SLUG" \
  || no "stop hook must resolve engine/slug without env"
ENGINE_HOOKS="$ROOT/.cursor/hooks.json"
if [[ -f "$ENGINE_HOOKS" ]] && grep -q 'dev-factory-drain-stop' "$ENGINE_HOOKS"; then
  ok "engine .cursor/hooks.json registers drain stop hook"
else
  no "engine .cursor/hooks.json must register dev-factory-drain-stop"
fi
WS_HOOKS="$ROOT/../.cursor/hooks.json"
if [[ -f "$WS_HOOKS" ]]; then
  if grep -q 'dev-factory-drain-stop' "$WS_HOOKS"; then
    ok "workspace-root hooks.json registers drain stop hook"
  else
    echo "  (warn: parent workspace hooks.json missing drain stop — optional host install)"
  fi
fi
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
