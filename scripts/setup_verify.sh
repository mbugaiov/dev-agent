#!/usr/bin/env bash
# Agent setup gate — run after SETUP.md configuration steps.
# Usage: bash scripts/setup_verify.sh <slug> [--skip-jira] [--skip-stg]
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
SLUG="${1:-}"
SKIP_JIRA=0
SKIP_STG=0
SCAFFOLD_ONLY=0
SKIP_BB=0
for arg in "${@:2}"; do
  case "$arg" in
    --skip-jira) SKIP_JIRA=1 ;;
    --skip-stg) SKIP_STG=1 ;;
    --skip-bitbucket) SKIP_BB=1 ;;
    --scaffold) SCAFFOLD_ONLY=1; SKIP_JIRA=1; SKIP_STG=1; SKIP_BB=1 ;;
  esac
done

FAIL=0

check_ok() {
  echo "SETUP_CHECK_OK $1"
}

check_fail() {
  echo "SETUP_FAIL {\"check\":\"$1\",\"reason\":\"$2\"}"
  FAIL=1
}

if [[ -z "$SLUG" ]]; then
  check_fail "args" "Usage: setup_verify.sh <slug> [--skip-jira] [--skip-stg]"
  exit 1
fi

PROJECT="$ROOT/projects/$SLUG"
YAML="$PROJECT/project.yaml"

if [[ ! -f "$YAML" ]]; then
  check_fail "project.yaml" "missing at projects/$SLUG/project.yaml — run new_project.sh or clone project repo"
else
  check_ok "project.yaml"
fi

if [[ -f "$YAML" ]]; then
  if ! grep -qE "^slug:[[:space:]]*\"?${SLUG}\"?[[:space:]]*$" "$YAML" 2>/dev/null; then
    check_fail "project.yaml.slug" "slug in yaml must match argument $SLUG"
  else
    check_ok "project.yaml.slug"
  fi
  if [[ "$SCAFFOLD_ONLY" -eq 0 ]]; then
    if grep -qE '<(EPIC-KEY|workspace|repo|Project Name)>' "$YAML" 2>/dev/null; then
      check_fail "project.yaml.placeholders" "unfilled template placeholders — edit project.yaml (§4)"
    else
      check_ok "project.yaml.placeholders"
    fi
  fi
fi

if [[ ! -f "$PROJECT/project-memory.md" ]]; then
  check_fail "project-memory.md" "missing — copy from template or run new_project.sh"
else
  check_ok "project-memory.md"
fi

for doc in docs/DEFINITION-OF-DONE.md docs/HUMAN-EXCEPTIONS.md; do
  if [[ ! -f "$PROJECT/$doc" ]]; then
    check_fail "$doc" "missing at projects/$SLUG/$doc"
  else
    check_ok "$doc"
  fi
done

if ! command -v npx >/dev/null 2>&1; then
  check_fail "node" "npx not found — install Node 20+ (HOST_SETUP.md)"
else
  check_ok "node"
fi

if [[ "$SCAFFOLD_ONLY" -eq 1 ]]; then
  if [[ "$FAIL" -eq 0 ]]; then
    echo "SETUP_SCAFFOLD_OK {\"slug\":\"$SLUG\"}"
    exit 0
  fi
  echo "SETUP_SCAFFOLD_INCOMPLETE {\"slug\":\"$SLUG\"}"
  exit 1
fi

APP=""
if [[ -f "$YAML" ]]; then
  if APP="$(npx tsx scripts/resolve_app_root.ts "$SLUG" 2>/dev/null)"; then
    if [[ -d "$APP" ]]; then
      check_ok "app.repo_path"
    else
      check_fail "app.repo_path" "directory does not exist: $APP"
    fi
  else
    check_fail "app.repo_path" "resolve_app_root.ts failed — check project.yaml app.repo_path"
  fi
fi

if [[ -n "$APP" && -d "$APP" ]]; then
  for script_key in wait_pr_pipeline wait_main_deploy; do
    rel="$(npx tsx scripts/resolve_app_script.ts "$SLUG" "$script_key" 2>/dev/null || true)"
    if [[ -z "$rel" ]]; then
      check_fail "app.$script_key" "could not resolve script path"
    elif [[ ! -f "$APP/$rel" ]]; then
      check_fail "app.$script_key" "missing $APP/$rel — add script or override in project.yaml"
    else
      check_ok "app.$script_key"
    fi
  done

  if [[ -f "$YAML" ]]; then
    gate_cmd="$(grep 'gate_command:' "$YAML" | head -1 | sed 's/.*gate_command:[[:space:]]*//' | tr -d '"')"
    if [[ -z "$gate_cmd" || "$gate_cmd" == *"<"* ]]; then
      check_fail "app.gate_command" "unset in project.yaml"
    else
      check_ok "app.gate_command"
    fi
  fi
fi

JIRA_ENV="$PROJECT/.secrets/jira.env"
BB_ENV="$PROJECT/.secrets/bitbucket.env"

if [[ "$SKIP_JIRA" -eq 0 ]]; then
  if [[ ! -f "$JIRA_ENV" ]]; then
    check_fail "jira.env" "missing — cp projects/$SLUG/jira.env.example projects/$SLUG/.secrets/jira.env"
  else
    for key in JIRA_BASE_URL JIRA_EMAIL JIRA_API_TOKEN; do
      if ! grep -qE "^${key}=.+" "$JIRA_ENV" 2>/dev/null; then
        check_fail "jira.env.$key" "empty or missing in .secrets/jira.env"
      else
        check_ok "jira.env.$key"
      fi
    done
  fi
else
  check_ok "jira.skipped"
fi

if [[ -f "$YAML" ]] && grep -q 'provider: bitbucket' "$YAML" 2>/dev/null && [[ "$SKIP_BB" -eq 0 ]]; then
  if [[ ! -f "$BB_ENV" ]]; then
    check_fail "bitbucket.env" "missing — cp bitbucket.env.example to .secrets/bitbucket.env"
  else
    for key in BITBUCKET_USERNAME BITBUCKET_TOKEN BITBUCKET_WORKSPACE; do
      if ! grep -qE "^${key}=.+" "$BB_ENV" 2>/dev/null; then
        check_fail "bitbucket.env.$key" "empty or missing"
      else
        check_ok "bitbucket.env.$key"
      fi
    done
  fi
fi

if [[ "$SKIP_STG" -eq 0 && -f "$YAML" ]]; then
  stg_url="$(grep 'base_url:' "$YAML" | head -1 | sed 's/.*base_url:[[:space:]]*//' | tr -d '"')"
  if [[ -z "$stg_url" || "$stg_url" == *"example.com"* ]]; then
    check_fail "stg.base_url" "set real STG URL in project.yaml"
  else
    check_ok "stg.base_url"
  fi
fi

if [[ "$SKIP_JIRA" -eq 0 && -f "$JIRA_ENV" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/scripts/source_project_secrets.sh" "$SLUG" 2>/dev/null || true
  if tick_out="$(bash scripts/dev_factory_tick.sh "$SLUG" 2>&1)"; then
    if echo "$tick_out" | grep -qE '^(BACKLOG_WAKE|BACKLOG_WAKE_EXECUTE|DEV_FACTORY_IDLE|JIRA_TICK_)'; then
      check_ok "dev_factory_tick"
    else
      check_fail "dev_factory_tick" "unexpected output: ${tick_out:0:200}"
    fi
  else
    if echo "$tick_out" | grep -qi 'JIRA\|401\|403\|auth'; then
      check_fail "dev_factory_tick" "Jira auth failed — fix .secrets/jira.env"
    else
      check_fail "dev_factory_tick" "${tick_out:0:300}"
    fi
  fi
fi

if [[ "$FAIL" -eq 0 ]]; then
  echo "SETUP_OK {\"slug\":\"$SLUG\",\"engine\":\"$ROOT\"}"
  exit 0
fi
echo "SETUP_INCOMPLETE {\"slug\":\"$SLUG\",\"failed_checks\":true}"
exit 1
