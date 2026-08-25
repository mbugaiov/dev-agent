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
grep -q 'upsertGithubAgentStarted' scripts/pickup_github_ticket.ts \
  && grep -q 'upsertJiraAgentStarted' scripts/pickup_jira_ticket.ts \
  && grep -q 'upsertGithubAgentStarted' scripts/post_agent_started.ts \
  && ok "pickup + post_agent_started use stacked upsert" \
  || no "banners must upsert via agentStartedTracker (not a fresh gh issue comment each start)"
grep -q 'jiraNewestCommentsPath' lib/agentStartedTracker.ts \
  && grep -q 'jiraCommentCountPath' lib/agentStartedTracker.ts \
  && ok "Jira banner lookup uses recency window (not first 50 oldest)" \
  || no "upsertJiraAgentStarted must fetch newest comments via jiraNewestCommentsPath"
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
grep -q '236d9de61677af77c8540ec792e2d834f20c6f55' scripts/ensure_themis_agent.sh || no "ensure pins themis SHA"
grep -q '236d9de61677af77c8540ec792e2d834f20c6f55' .github/workflows/auto-merge.yml || no "auto-merge pins themis SHA"
grep -q '236d9de61677af77c8540ec792e2d834f20c6f55' .github/workflows/code-review.yml || no "code-review pins themis SHA"
ENS_ROOT=$(ROOT=/ bash scripts/ensure_themis_agent.sh)
ENGINE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIN_SHA=236d9de61677af77c8540ec792e2d834f20c6f55
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

have "scripts/ensure_hephaestus_agent.sh"
have "scripts/lib/kill_tree.sh"
have "scripts/lib/oneshot_mutex.sh"
have "scripts/check_oneshot_stall.sh"
have "lib/oneshotStall.ts"
grep -q 'hephaestus_oneshot_runner' scripts/ensure_hephaestus_agent.sh \
  && grep -q 'HEPHAESTUS_ONESHOT_STALLED' scripts/ensure_hephaestus_agent.sh \
  && grep -q 'STALL_RECOVERY' scripts/ensure_hephaestus_agent.sh \
  && ok "ensure_hephaestus_agent K14 stall recovery wiring" \
  || no "ensure must wire K14 stall recovery"
grep -q 'cursor-agent' scripts/ensure_hephaestus_agent.sh \
  && grep -q 'HEPHAESTUS_ONESHOT_ARMED' scripts/ensure_hephaestus_agent.sh \
  && grep -q 'HEPHAESTUS_REAP_BLIND' scripts/ensure_hephaestus_agent.sh \
  && grep -q 'CURSOR_FACTORY_SESSION=1' scripts/ensure_hephaestus_agent.sh \
  && grep -q 'DEV_FACTORY_SLUG' scripts/ensure_hephaestus_agent.sh \
  && grep -q 'scripts/lib/kill_tree.sh' scripts/ensure_hephaestus_agent.sh \
  && grep -q 'oneshot_mutex.sh' scripts/ensure_hephaestus_agent.sh \
  && grep -q 'oneshot_lock_acquire' scripts/ensure_hephaestus_agent.sh \
  && grep -q 'GITHUB_HANDOFF_SKIP' scripts/post_github_handoff.ts \
  && grep -q 'JIRA_HANDOFF_SKIP' scripts/post_jira_handoff.ts \
  && grep -q 'scripts/lib/kill_tree.sh' scripts/stop_dev_loop.sh \
  && ! grep -q -- '--api-key' scripts/ensure_hephaestus_agent.sh \
  && ok "ensure_hephaestus_agent is cursor-agent oneshot (K13)" \
  || no "ensure_hephaestus_agent must arm cursor-agent oneshot and reap blind bash"
grep -q 'ensureArgusOneshot' lib/qaHandoffKickBridge.ts \
  && grep -q 'ARGUS_KICK_ACK_OK' scripts/post_github_handoff.ts \
  && grep -q 'ARGUS_KICK_ACK_OK' scripts/post_jira_handoff.ts \
  && grep -q 'consumePendingArgusKickState' scripts/post_github_handoff.ts \
  && ok "handoff fires ensure_argus oneshot + auto-ack latch" \
  || no "handoff must call ensureArgusOneshot and ack pending on ARMED"
# usage / slug / skip matrix (mirror ensure_argus)
OUT=$(bash scripts/ensure_hephaestus_agent.sh 2>&1); EC=$?
[[ "$EC" -eq 1 ]] && echo "$OUT" | grep -qi Usage \
  && ok "ensure_hephaestus_agent usage exit 1" \
  || no "ensure_hephaestus_agent should exit 1 on missing args (ec=$EC)"
OUT=$(bash scripts/ensure_hephaestus_agent.sh "Bad_Slug" 2>&1); EC=$?
[[ "$EC" -eq 2 ]] && echo "$OUT" | grep -qi Invalid \
  && ok "ensure_hephaestus_agent invalid slug exit 2" \
  || no "ensure_hephaestus_agent should exit 2 on bad slug (ec=$EC)"
OUT=$(env -u CURSOR_API_KEY PATH="/usr/bin:/bin" bash scripts/ensure_hephaestus_agent.sh "$SLUG" 2>&1); EC=$?
[[ "$EC" -eq 3 ]] && echo "$OUT" | grep -q cursor-agent-missing \
  && ok "ensure_hephaestus_agent skips when cursor-agent missing" \
  || no "ensure_hephaestus_agent should exit 3 without cursor-agent (ec=$EC: $OUT)"
EA_STUB=$(mktemp -d)
printf '%s\n' '#!/bin/bash' 'sleep 60' >"$EA_STUB/cursor-agent"
chmod +x "$EA_STUB/cursor-agent"
rm -f "projects/$SLUG/factory/hephaestus-oneshot.pid"
# Hide local cursor.env so ambient/engine secrets cannot satisfy the key check
# (CI has no .secrets; developer worktrees often do after pantheon key copy).
_hide_cursor_secrets() {
  _CURSOR_SECRET_HIDES=()
  local f
  for f in .secrets/cursor.env "projects/$SLUG/.secrets/cursor.env"; do
    if [[ -f "$f" ]]; then
      mv "$f" "${f}.__test_hide"
      _CURSOR_SECRET_HIDES+=("$f")
    fi
  done
}
_restore_cursor_secrets() {
  local f
  for f in "${_CURSOR_SECRET_HIDES[@]:-}"; do
    [[ -f "${f}.__test_hide" ]] && mv "${f}.__test_hide" "$f"
  done
  _CURSOR_SECRET_HIDES=()
}
_hide_cursor_secrets
OUT=$(env -u CURSOR_API_KEY PATH="$EA_STUB:/usr/bin:/bin" bash scripts/ensure_hephaestus_agent.sh "$SLUG" 2>&1); EC=$?
_restore_cursor_secrets
[[ "$EC" -eq 4 ]] && echo "$OUT" | grep -q CURSOR_API_KEY-missing \
  && ok "ensure_hephaestus_agent skips when CURSOR_API_KEY missing" \
  || no "ensure_hephaestus_agent should exit 4 without API key (ec=$EC: $OUT)"
# REAP_BLIND before SKIP when API key missing (exit 4) — blind bash must not block portfolio
perl -e "\$0 = \"bash scripts/dev-loop.sh ${SLUG}\"; sleep 45" &
BLIND_SKIP_PID=$!
echo "$BLIND_SKIP_PID" > "projects/$SLUG/factory/loop.pid"
sleep 0.3
_hide_cursor_secrets
OUT=$(env -u CURSOR_API_KEY PATH="$EA_STUB:/usr/bin:/bin" bash scripts/ensure_hephaestus_agent.sh "$SLUG" 2>&1); EC=$?
_restore_cursor_secrets
echo "$OUT" | grep -q HEPHAESTUS_REAP_BLIND   && echo "$OUT" | grep -q CURSOR_API_KEY-missing && [[ "$EC" -eq 4 ]]   && ! kill -0 "$BLIND_SKIP_PID" 2>/dev/null   && ok "ensure reaps blind bash then SKIP exit 4 without API key"   || no "ensure must REAP_BLIND then exit 4 without key (ec=$EC blind=$BLIND_SKIP_PID out=$OUT)"
kill "$BLIND_SKIP_PID" 2>/dev/null || true
rm -f "projects/$SLUG/factory/loop.pid"
_ea_kill() {
  local pf="projects/$SLUG/factory/hephaestus-oneshot.pid"
  local pid cmd
  if [[ -f "$pf" ]]; then
    pid="$(tr -d '[:space:]' <"$pf" || true)"
    if [[ -n "$pid" ]]; then
      pkill -9 -P "$pid" 2>/dev/null || true
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$pf"
  fi
  while read -r pid; do
    [[ -z "$pid" ]] && continue
    cmd="$(ps -p "$pid" -o args= 2>/dev/null || true)"
    [[ "$cmd" == *ensure_hephaestus_agent.sh* ]] && continue
    if [[ "$cmd" =~ DEV_FACTORY_SLUG=${SLUG}([^a-z0-9-]|$) ]] \
      || [[ "$cmd" =~ Hephaestus\ oneshot\ for\ ${SLUG}([^a-z0-9-]|$) ]]; then
      pkill -9 -P "$pid" 2>/dev/null || true
      kill -9 "$pid" 2>/dev/null || true
    fi
  done < <(pgrep -f "oneshot for ${SLUG}|DEV_FACTORY_SLUG=${SLUG}" 2>/dev/null || true)
  rm -rf "projects/$SLUG/factory/oneshot.lock"
  sleep 0.15
}
_ea_kill
# Stub asserts CURSOR_API_KEY is inherited into the child (not argv --api-key).
ENV_STUB=$(mktemp -d)
printf '%s\n' '#!/bin/bash' \
  'MARKER="$(cd "$(dirname "$0")" && pwd)/key_ok"' \
  'if [[ -z "${CURSOR_API_KEY:-}" ]]; then echo missing >"$MARKER.fail"; exit 42; fi' \
  'echo "ok len=${#CURSOR_API_KEY}" >"$MARKER"' \
  'sleep 60' >"$ENV_STUB/cursor-agent"
chmod +x "$ENV_STUB/cursor-agent"
rm -f "projects/$SLUG/factory/hephaestus-oneshot.pid"
OUT=$(PATH="$ENV_STUB:/usr/bin:/bin" CURSOR_API_KEY=test-key-not-real \
  bash scripts/ensure_hephaestus_agent.sh "$SLUG" 2>&1); EC=$?
sleep 0.4
[[ -f "$ENV_STUB/key_ok" ]] \
  && echo "$OUT" | grep -q HEPHAESTUS_ONESHOT_ARMED && [[ "$EC" -eq 0 ]] \
  && ok "ensure inherits CURSOR_API_KEY into child env" \
  || no "ensure must inherit CURSOR_API_KEY (ec=$EC out=$OUT marker=$(ls -la "$ENV_STUB" 2>/dev/null))"
# Key must not appear on the oneshot child's argv (env inheritance only).
if [[ -f "projects/$SLUG/factory/hephaestus-oneshot.pid" ]]; then
  AP=$(tr -d '[:space:]' <"projects/$SLUG/factory/hephaestus-oneshot.pid")
  ARGS=$(ps -p "$AP" -o args= 2>/dev/null || true)
  if [[ "$ARGS" != *test-key-not-real* ]] && [[ "$ARGS" != *--api-key* ]]; then
    ok "ensure does not put CURSOR_API_KEY on child argv"
  else
    no "ensure leaked API key onto argv (pid=$AP args=$ARGS)"
  fi
else
  no "ensure missing oneshot pid for argv leak check"
fi
_ea_kill
rm -rf "$ENV_STUB"

OUT=$(PATH="$EA_STUB:/usr/bin:/bin" CURSOR_API_KEY=test-key-not-real \
  bash scripts/ensure_hephaestus_agent.sh "$SLUG" 2>&1); EC=$?
echo "$OUT" | grep -q HEPHAESTUS_ONESHOT_ARMED && [[ "$EC" -eq 0 ]] \
  && ok "ensure_hephaestus_agent arms oneshot" \
  || no "ensure_hephaestus_agent should arm (ec=$EC: $OUT)"
OUT2=$(PATH="$EA_STUB:/usr/bin:/bin" CURSOR_API_KEY=test-key-not-real \
  bash scripts/ensure_hephaestus_agent.sh "$SLUG" 2>&1); EC2=$?
echo "$OUT2" | grep -q ALREADY_RUNNING && [[ "$EC2" -eq 0 ]] \
  && ok "ensure_hephaestus_agent ALREADY_RUNNING on live pid" \
  || no "ensure_hephaestus_agent should short-circuit live pid (ec=$EC2: $OUT2)"
# Parallel ensure: mutex → exactly one ARMED
_ea_kill
mkdir -p "projects/$SLUG/factory"
PAR_OUT=$(
  PATH="$EA_STUB:/usr/bin:/bin" CURSOR_API_KEY=test-key-not-real \
    bash scripts/ensure_hephaestus_agent.sh "$SLUG" &
  PATH="$EA_STUB:/usr/bin:/bin" CURSOR_API_KEY=test-key-not-real \
    bash scripts/ensure_hephaestus_agent.sh "$SLUG" &
  wait
)
PAR_ARMED=$(printf '%s\n' "$PAR_OUT" | grep -c HEPHAESTUS_ONESHOT_ARMED || true)
PAR_ALREADY=$(printf '%s\n' "$PAR_OUT" | grep -c ALREADY_RUNNING || true)
[[ "$PAR_ARMED" -eq 1 ]] && [[ "$PAR_ALREADY" -ge 1 ]] \
  && ok "parallel ensure_hephaestus: one ARMED, rest ALREADY_RUNNING" \
  || no "parallel ensure must arm once (armed=$PAR_ARMED already=$PAR_ALREADY out=$PAR_OUT)"
perl -e "\$0 = \"bash scripts/dev-loop.sh ${SLUG}\"; sleep 45" &
BLIND_AR_PID=$!
echo "$BLIND_AR_PID" > "projects/$SLUG/factory/loop.pid"
sleep 0.3
OUT3=$(PATH="$EA_STUB:/usr/bin:/bin" CURSOR_API_KEY=test-key-not-real \
  bash scripts/ensure_hephaestus_agent.sh "$SLUG" 2>&1); EC3=$?
AGENT_STILL=0
[[ -f "projects/$SLUG/factory/hephaestus-oneshot.pid" ]] && \
  AP=$(tr -d '[:space:]' <"projects/$SLUG/factory/hephaestus-oneshot.pid") && \
  kill -0 "$AP" 2>/dev/null && AGENT_STILL=1 || true
echo "$OUT3" | grep -q HEPHAESTUS_REAP_BLIND \
  && echo "$OUT3" | grep -q ALREADY_RUNNING && [[ "$EC3" -eq 0 ]] \
  && ! kill -0 "$BLIND_AR_PID" 2>/dev/null \
  && [[ "$AGENT_STILL" -eq 1 ]] \
  && ok "ensure ALREADY_RUNNING still reaps coexisting blind bash" \
  || no "ALREADY_RUNNING path must REAP_BLIND and keep agent (ec=$EC3 blind=$BLIND_AR_PID agentAlive=$AGENT_STILL out=$OUT3)"
kill "$BLIND_AR_PID" 2>/dev/null || true
rm -f "projects/$SLUG/factory/loop.pid"
_ea_kill

# Negative: recycled PID without slug-bound cmdline must NOT ALREADY_RUNNING
# (clears pid file and continues — arm or skip). Cross-tenant PID-reuse gate.
(
  sleep 45 &
  STALE=$!
  echo "$STALE" > "projects/$SLUG/factory/hephaestus-oneshot.pid"
  sleep 0.2
  OUT=$(PATH="$EA_STUB:/usr/bin:/bin" CURSOR_API_KEY=test-key-not-real \
    bash scripts/ensure_hephaestus_agent.sh "$SLUG" 2>&1); EC=$?
  if ! echo "$OUT" | grep -q ALREADY_RUNNING \
    && echo "$OUT" | grep -qE 'HEPHAESTUS_ONESHOT_ARMED|HEPHAESTUS_ONESHOT_SKIP' \
    && [[ "$EC" -eq 0 || "$EC" -eq 3 || "$EC" -eq 4 ]]; then
    ok "ensure rejects mismatched oneshot pid (no ALREADY_RUNNING)"
  else
    no "ensure must not ALREADY_RUNNING on unbound pid (ec=$EC out=$OUT)"
  fi
  kill "$STALE" 2>/dev/null || true
  wait "$STALE" 2>/dev/null || true
  _ea_kill
)
# Prefix collision: DEV_FACTORY_SLUG=<slug>-other must not short-circuit
(
  perl -e "\$0 = \"cursor-agent DEV_FACTORY_SLUG=${SLUG}-other\"; sleep 45" &
  PREF=$!
  echo "$PREF" > "projects/$SLUG/factory/hephaestus-oneshot.pid"
  sleep 0.2
  OUT=$(PATH="$EA_STUB:/usr/bin:/bin" CURSOR_API_KEY=test-key-not-real \
    bash scripts/ensure_hephaestus_agent.sh "$SLUG" 2>&1); EC=$?
  if ! echo "$OUT" | grep -q ALREADY_RUNNING \
    && echo "$OUT" | grep -qE 'HEPHAESTUS_ONESHOT_ARMED|HEPHAESTUS_ONESHOT_SKIP'; then
    ok "ensure rejects DEV_FACTORY_SLUG prefix collision"
  else
    no "ensure must not ALREADY_RUNNING on slug-prefix collision (ec=$EC out=$OUT)"
  fi
  kill "$PREF" 2>/dev/null || true
  wait "$PREF" 2>/dev/null || true
  _ea_kill
)

FAIL_STUB=$(mktemp -d)
printf '%s\n' '#!/bin/bash' 'exit 0' >"$FAIL_STUB/cursor-agent"
chmod +x "$FAIL_STUB/cursor-agent"
rm -f "projects/$SLUG/factory/hephaestus-oneshot.pid"
OUT=$(PATH="$FAIL_STUB:/usr/bin:/bin" CURSOR_API_KEY=test-key-not-real \
  bash scripts/ensure_hephaestus_agent.sh "$SLUG" 2>&1); EC=$?
echo "$OUT" | grep -q HEPHAESTUS_ONESHOT_FAIL && [[ "$EC" -eq 5 ]]   && ! echo "$OUT" | grep -q '"detail":'   && ok "ensure_hephaestus_agent FAIL when agent exits immediately" \
  || no "ensure_hephaestus_agent should exit 5 on immediate agent exit (ec=$EC: $OUT)"
rm -rf "$FAIL_STUB"
_ea_kill

# Behavioral: blind bash reap then arm (not grep-only).
# macOS: `bash -c '… # comment'` drops the comment from `ps`; set $0 via perl.
mkdir -p "projects/$SLUG/factory"
perl -e "\$0 = \"bash scripts/dev-loop.sh ${SLUG}\"; sleep 45" &
BLIND_PID=$!
echo "$BLIND_PID" > "projects/$SLUG/factory/loop.pid"
sleep 0.3
OUT=$(PATH="$EA_STUB:/usr/bin:/bin" CURSOR_API_KEY=test-key-not-real \
  bash scripts/ensure_hephaestus_agent.sh "$SLUG" 2>&1); EC=$?
echo "$OUT" | grep -q HEPHAESTUS_REAP_BLIND \
  && echo "$OUT" | grep -q HEPHAESTUS_ONESHOT_ARMED && [[ "$EC" -eq 0 ]] \
  && ! kill -0 "$BLIND_PID" 2>/dev/null \
  && ok "ensure reaps live blind bash then arms oneshot" \
  || no "ensure must emit REAP_BLIND, stop bash, arm (ec=$EC blind=$BLIND_PID out=$OUT)"
kill "$BLIND_PID" 2>/dev/null || true
rm -f "projects/$SLUG/factory/loop.pid"
_ea_kill
rm -rf "$EA_STUB"

# Behavioral: stop_dev_loop kills matching agent oneshot (macOS: perl \$0 for ps title).
perl -e "\$0 = \"cursor-agent --force DEV_FACTORY_SLUG=${SLUG}\"; sleep 45" &
AGENT_PID=$!
echo "$AGENT_PID" > "projects/$SLUG/factory/hephaestus-oneshot.pid"
sleep 0.2
STOP_OUT=$(bash scripts/stop_dev_loop.sh "$SLUG" 2>&1)
echo "$STOP_OUT" | grep -q '"agentKilled":1' \
  && ! kill -0 "$AGENT_PID" 2>/dev/null \
  && ok "stop_dev_loop kills live hephaestus-oneshot (agentKilled:1)" \
  || no "stop must kill agent oneshot (pid=$AGENT_PID out=$STOP_OUT)"
kill "$AGENT_PID" 2>/dev/null || true
rm -f "projects/$SLUG/factory/hephaestus-oneshot.pid"

# Orphan slug-bound agent (no hephaestus-oneshot.pid) — pgrep scan must kill
perl -e "\$0 = \"cursor-agent --force DEV_FACTORY_SLUG=${SLUG}\"; sleep 45" &
ORPHAN_AGENT_PID=$!
sleep 0.2
rm -f "projects/$SLUG/factory/hephaestus-oneshot.pid"
STOP_OUT=$(bash scripts/stop_dev_loop.sh "$SLUG" 2>&1)
echo "$STOP_OUT" | grep -q '"agentKilled":1'   && ! kill -0 "$ORPHAN_AGENT_PID" 2>/dev/null   && ok "stop_dev_loop kills orphan slug-bound agent (no pid file)"   || no "stop must pgrep-kill orphan agent (pid=$ORPHAN_AGENT_PID out=$STOP_OUT)"
kill "$ORPHAN_AGENT_PID" 2>/dev/null || true

# Negative: mismatched agent pid file must not be killed
sleep 45 &
MISMATCH_PID=$!
echo "$MISMATCH_PID" > "projects/$SLUG/factory/hephaestus-oneshot.pid"
STOP_OUT=$(bash scripts/stop_dev_loop.sh "$SLUG" 2>&1)
if kill -0 "$MISMATCH_PID" 2>/dev/null && echo "$STOP_OUT" | grep -q cmdline-mismatch; then
  ok "stop_dev_loop skips mismatched agent pid"
else
  no "stop must not kill mismatched agent pid (pid=$MISMATCH_PID out=$STOP_OUT)"
fi
kill "$MISMATCH_PID" 2>/dev/null || true
rm -f "projects/$SLUG/factory/hephaestus-oneshot.pid"

# Negative: bare cursor-agent / slug-prefix collision must not kill
perl -e '$0 = "cursor-agent --force"; sleep 45' &
BARE_PID=$!
echo "$BARE_PID" > "projects/$SLUG/factory/hephaestus-oneshot.pid"
STOP_OUT=$(bash scripts/stop_dev_loop.sh "$SLUG" 2>&1)
if kill -0 "$BARE_PID" 2>/dev/null && echo "$STOP_OUT" | grep -q cmdline-mismatch; then
  ok "stop skips bare cursor-agent without DEV_FACTORY_SLUG"
else
  no "stop must not kill bare cursor-agent (pid=$BARE_PID out=$STOP_OUT)"
fi
kill "$BARE_PID" 2>/dev/null || true
rm -f "projects/$SLUG/factory/hephaestus-oneshot.pid"
perl -e "\$0 = \"cursor-agent DEV_FACTORY_SLUG=${SLUG}-other\"; sleep 45" &
PREF_PID=$!
echo "$PREF_PID" > "projects/$SLUG/factory/hephaestus-oneshot.pid"
STOP_OUT=$(bash scripts/stop_dev_loop.sh "$SLUG" 2>&1)
if kill -0 "$PREF_PID" 2>/dev/null && echo "$STOP_OUT" | grep -q cmdline-mismatch; then
  ok "stop skips DEV_FACTORY_SLUG prefix collision"
else
  no "stop must not kill slug-prefix collision (pid=$PREF_PID out=$STOP_OUT)"
fi
kill "$PREF_PID" 2>/dev/null || true
rm -f "projects/$SLUG/factory/hephaestus-oneshot.pid"

# Negative orphan: live DEV_FACTORY_SLUG=<slug>-other with *no* pid file must
# survive stop (pgrep prefilter must not kill prefix neighbors).
perl -e "\$0 = \"cursor-agent DEV_FACTORY_SLUG=${SLUG}-other\"; sleep 45" &
ORPHAN_PREF_PID=$!
sleep 0.2
rm -f "projects/$SLUG/factory/hephaestus-oneshot.pid"
STOP_OUT=$(bash scripts/stop_dev_loop.sh "$SLUG" 2>&1)
if kill -0 "$ORPHAN_PREF_PID" 2>/dev/null \
  && ! echo "$STOP_OUT" | grep -q '"agentKilled":1'; then
  ok "stop leaves orphan DEV_FACTORY_SLUG=<slug>-other (no pid file)"
else
  no "stop must not kill orphan slug-prefix neighbor (pid=$ORPHAN_PREF_PID out=$STOP_OUT)"
fi
kill "$ORPHAN_PREF_PID" 2>/dev/null || true

# K14 wrapper: stop must kill ensure-style bash -c tree (factory path in cmdline)
HB="projects/$SLUG/factory/hephaestus-oneshot.heartbeat"
LOG="projects/$SLUG/factory/hephaestus-oneshot.out"
CLAIM="projects/$SLUG/factory/hephaestus-oneshot.claim.json"
printf '{"slug":"%s","issuedAt":"2026-08-24T00:00:00Z","mode":"cursor-agent-oneshot"}\n' "$SLUG" >"$CLAIM"
bash -c "export DEV_FACTORY_SLUG=\"${SLUG}\"; export HEPHAESTUS_LOG=${LOG}; export HEPHAESTUS_HEARTBEAT=${HB}; bash scripts/lib/hephaestus_oneshot_runner.sh sleep 120" &
WRAP_CHILD=$!
sleep 0.3
# Linux often stores runner pid, not outer bash -c (cmdline lacks DEV_FACTORY_SLUG).
RUNNER_PID="$(pgrep -P "$WRAP_CHILD" 2>/dev/null | head -1 || true)"
[[ -n "$RUNNER_PID" ]] && echo "$RUNNER_PID" > "projects/$SLUG/factory/hephaestus-oneshot.pid" \
  || echo "$WRAP_CHILD" > "projects/$SLUG/factory/hephaestus-oneshot.pid"
TARGET_PID="$(tr -d '[:space:]' <"projects/$SLUG/factory/hephaestus-oneshot.pid" || true)"
WRAP_STOP=$(bash scripts/stop_dev_loop.sh "$SLUG" 2>&1)
if kill -0 "$WRAP_CHILD" 2>/dev/null || kill -0 "$TARGET_PID" 2>/dev/null; then
  no "stop must kill hephaestus_oneshot_runner (wrap=$WRAP_CHILD runner=$TARGET_PID out=$WRAP_STOP)"
else
  ok "stop kills hephaestus_oneshot_runner wrapper"
fi
kill "$WRAP_CHILD" 2>/dev/null || true
kill "$TARGET_PID" 2>/dev/null || true
rm -f "projects/$SLUG/factory/hephaestus-oneshot.pid" "$HB" "$LOG" "$CLAIM"

STALL_DIR="projects/$SLUG/factory"
sleep 30 &
STALL_LIVE=$!
echo "$STALL_LIVE" > "$STALL_DIR/hephaestus-oneshot.pid"
printf '{"issuedAt":"2020-01-01T00:00:00Z","mode":"cursor-agent-oneshot"}\n' > "$STALL_DIR/hephaestus-oneshot.claim.json"
printf 'Connection lost, reconnecting to https://agent.example.cursor.sh\n' > "$STALL_DIR/hephaestus-oneshot.out"
date -u -r 1 +%s > "$STALL_DIR/hephaestus-oneshot.heartbeat" 2>/dev/null || echo 1 > "$STALL_DIR/hephaestus-oneshot.heartbeat"
STALL_PROBE=$(ONESHOT_STALL_SILENT_SEC=60 ONESHOT_STALL_RECONNECT_GRACE_SEC=30 \
  npx tsx scripts/print_oneshot_stall.ts "$SLUG" 2>&1 | tail -1)
kill "$STALL_LIVE" 2>/dev/null || true
rm -f "$STALL_DIR/hephaestus-oneshot.pid" "$STALL_DIR/hephaestus-oneshot.claim.json" \
  "$STALL_DIR/hephaestus-oneshot.out" "$STALL_DIR/hephaestus-oneshot.heartbeat"
echo "$STALL_PROBE" | grep -q ONESHOT_STALLED \
  && ok "print_oneshot_stall flags reconnect stall" \
  || no "print_oneshot_stall must detect stall (got $STALL_PROBE)"

# Runner must capture agent stdout without pipe+read (empty-log hang root cause).
RUNNER_CAP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/heph-runner-cap.XXXXXX")"
RUNNER_LOG="$RUNNER_CAP_DIR/out"
RUNNER_HB="$RUNNER_CAP_DIR/hb"
HEPHAESTUS_LOG="$RUNNER_LOG" HEPHAESTUS_HEARTBEAT="$RUNNER_HB" HEPHAESTUS_HEARTBEAT_POLL_SEC=1 \
  bash scripts/lib/hephaestus_oneshot_runner.sh bash -c 'echo CAPTURE_OK; sleep 0.2' \
  && grep -q CAPTURE_OK "$RUNNER_LOG" \
  && [[ -s "$RUNNER_HB" ]] \
  && ok "hephaestus_oneshot_runner captures stdout (no pipe-read)" \
  || no "runner must write agent stdout to log (log=$(wc -c <"$RUNNER_LOG" 2>/dev/null || echo 0))"
# Guard: runner must not use while-read on agent stdout.
! grep -E '2>&1[[:space:]]*\|[[:space:]]*while' scripts/lib/hephaestus_oneshot_runner.sh \
  && ok "runner forbids pipe|while read heartbeat" \
  || no "runner must not pipe agent into while read"
rm -rf "$RUNNER_CAP_DIR"

# Empty-log stall (pipe hang signature) — issuedAt recent enough to avoid max_wall
: > "$STALL_DIR/hephaestus-oneshot.out"
sleep 30 &
STALL_EMPTY=$!
echo "$STALL_EMPTY" > "$STALL_DIR/hephaestus-oneshot.pid"
ISSUED_AT="$(date -u -v-700S +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '700 seconds ago' +%Y-%m-%dT%H:%M:%SZ)"
printf '{"issuedAt":"%s","mode":"cursor-agent-oneshot"}\n' "$ISSUED_AT" > "$STALL_DIR/hephaestus-oneshot.claim.json"
date -u +%s > "$STALL_DIR/hephaestus-oneshot.heartbeat"
EMPTY_PROBE=$(ONESHOT_STALL_NO_OUTPUT_SEC=600 ONESHOT_STALL_MAX_WALL_SEC=14400 \
  npx tsx scripts/print_oneshot_stall.ts "$SLUG" 2>&1 | tail -1)
kill "$STALL_EMPTY" 2>/dev/null || true
rm -f "$STALL_DIR/hephaestus-oneshot.pid" "$STALL_DIR/hephaestus-oneshot.claim.json" \
  "$STALL_DIR/hephaestus-oneshot.out" "$STALL_DIR/hephaestus-oneshot.heartbeat"
echo "$EMPTY_PROBE" | grep -q '"reason":"no_output"' \
  && ok "print_oneshot_stall flags no_output stall" \
  || no "print_oneshot_stall must detect no_output (got $EMPTY_PROBE)"

have "scripts/smoke_k14_process.sh" \
  && ok "smoke_k14_process.sh present for manual K14 smoke" \
  || no "missing scripts/smoke_k14_process.sh"

grep -q 'agentKilled' scripts/stop_dev_loop.sh \
  && grep -q 'hephaestus-oneshot.pid' scripts/stop_dev_loop.sh \
  && ok "stop_dev_loop reaps hephaestus-oneshot.pid" \
  || no "stop_dev_loop must kill agent oneshot pid"


grep -q 'watch_dev_loop' scripts/stop_dev_loop.sh \
  && grep -q 'LOOP_STOPPED' scripts/stop_dev_loop.sh \
  && grep -q 'kill_tree' scripts/stop_dev_loop.sh \
  && grep -q 'dev-loop.sh' scripts/stop_dev_loop.sh \
  && ok "stop_dev_loop kills scheduler + watchers (children first)" \
  || no "stop_dev_loop.sh must reap scheduler and watchers with kill_tree"

# Negative: stale loop.pid whose cmdline is not this slug's scheduler must not be killed.
pidguard_mismatched_loop_pid() {
  local PID_SLUG="pidguard-selftest"
  local STALE_PID=""
  cleanup() {
    [[ -n "${STALE_PID:-}" ]] && kill "$STALE_PID" 2>/dev/null || true
    rm -rf "projects/$PID_SLUG"
  }
  trap cleanup RETURN
  rm -rf "projects/$PID_SLUG"
  mkdir -p "projects/$PID_SLUG/factory"
  sleep 60 &
  STALE_PID=$!
  echo "$STALE_PID" > "projects/$PID_SLUG/factory/loop.pid"
  bash scripts/stop_dev_loop.sh "$PID_SLUG" >/dev/null 2>&1 || true
  if kill -0 "$STALE_PID" 2>/dev/null; then
    ok "stop_dev_loop does not kill mismatched loop.pid"
  else
    STALE_PID=""
    no "stop_dev_loop must not kill pid-file process that is not dev-loop.sh <slug>"
  fi
}
pidguard_mismatched_loop_pid
python3 - <<'PY' && ok "pid-file block requires ps cmdline match before kill_tree" || no "pid-file block missing ps-before-kill_tree"
from pathlib import Path
t = Path("scripts/stop_dev_loop.sh").read_text()
idx = t.find("Scheduler via pid file")
chunk = t[idx : idx + 700]
assert "ps -p" in chunk and "kill_tree" in chunk
assert chunk.find("ps -p") < chunk.find("kill_tree")
PY

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
if [[ -f "$ENGINE_HOOKS" ]] && grep -q 'dev-factory-drain-stop' "$ENGINE_HOOKS" \
  && grep -q 'afterAgentResponse' "$ENGINE_HOOKS" \
  && grep -q 'dev-factory-after-agent-response' "$ENGINE_HOOKS"; then
  ok "engine .cursor/hooks.json registers drain stop + afterAgentResponse summarize arm"
else
  no "engine .cursor/hooks.json must register drain stop + afterAgentResponse"
fi
have "scripts/dev_factory_after_agent_response_hook.ts"
have "lib/summarizePending.ts"
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


# Themis central review-rules wiring — exercise builder at pin
WF=.github/workflows/code-review.yml
grep -q build_review_prompt.sh "$WF" && ok "workflow cites build_review_prompt" || no "workflow missing build_review_prompt"
grep -q 'repository: mbugaiov/themis-agent' "$WF" && ok "workflow checkouts themis-agent" || no "workflow missing themis checkout"
PIN=$(grep -Eo '[0-9a-f]{40}' scripts/ensure_themis_agent.sh | head -1)
grep -q "$PIN" "$WF" && ok "isolation/ensure pin present in workflow" || no "workflow missing themis pin"
# Review checkout must float (WIRING); isolation may pin.
python3 - <<'PY2' "$WF" && ok "review checkout floats (no ref)" || no "review checkout must float without ref"
import sys, re
from pathlib import Path
text = Path(sys.argv[1]).read_text()
m = re.search(r"name: review \(Themis\)(.*?)name: isolation \(Themis\)", text, re.S)
chunk = m.group(1) if m else ""
idx = chunk.find("repository: mbugaiov/themis-agent")
window = chunk[idx:idx+220] if idx >= 0 else ""
raise SystemExit(0 if idx >= 0 and not re.search(r"(?m)^\s*ref:\s*", window) else 1)
PY2
grep -q build_review_prompt.sh scripts/run_code_review.sh && ok "run_code_review uses builder" || no "run_code_review missing builder"
THEMIS_TMP=$(mktemp -d)
git clone --depth 1 https://github.com/mbugaiov/themis-agent.git "$THEMIS_TMP/themis" >/dev/null 2>&1
git -C "$THEMIS_TMP/themis" fetch --depth 1 origin "$PIN" >/dev/null 2>&1
git -C "$THEMIS_TMP/themis" checkout --detach FETCH_HEAD >/dev/null 2>&1
PROMPT_OUT=$(bash "$THEMIS_TMP/themis/scripts/build_review_prompt.sh" \
  --pr 1 --base origin/main --label selftest \
  --local-rule .cursor/rules/code-review.mdc \
  --themis-root "$THEMIS_TMP/themis")
echo "$PROMPT_OUT" | grep -q 'review-rules/10-tests-must-have' \
  && ok "build_review_prompt inlines shared pack at pin" \
  || no "build_review_prompt selftest failed"
rm -rf "$THEMIS_TMP"

echo ""
echo "Results: $PASS passed, $FAIL failed"

[[ "$FAIL" -eq 0 ]]
