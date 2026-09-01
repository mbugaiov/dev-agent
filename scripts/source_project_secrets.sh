#!/usr/bin/env bash
# Load projects/<slug>/.secrets/jira.env and bitbucket.env into the environment.
#
# Values are assigned via quoted expansion instead of `source`, so unquoted shell
# metacharacters (e.g. `&` in a webhook URL) can no longer truncate an assignment
# into an empty variable — the failure mode behind silent Teams notify delivery.
# Unsafe quoting still warns loudly with SECRETS_ENV_UNSAFE on stderr.
#
# Lint rules mirror lib/secretsEnvLint.ts (unit-tested source of truth).
#
# Usage: source scripts/source_project_secrets.sh <slug>
# Explicit $1 wins — stale DEV_AGENT_SLUG from another factory session must not
# clobber Kairos probe / tick slug (false WORK for wrong product).
SLUG="${1:-${DEV_AGENT_SLUG:-}}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -z "$SLUG" ]]; then
  echo "source_project_secrets: DEV_AGENT_SLUG or slug arg required" >&2
  return 1 2>/dev/null || exit 1
fi

_sps_unsafe_pattern='[&|;<>()`$#[:space:]]'

_sps_load_file() {
  local file="$1"
  local line name value lineno=0
  local -a unsafe=()

  while IFS= read -r line || [[ -n "$line" ]]; do
    lineno=$((lineno + 1))
    line="${line#"${line%%[![:space:]]*}"}"   # ltrim
    [[ -z "$line" || "$line" == \#* ]] && continue
    line="${line#export }"
    [[ "$line" != *=* ]] && continue

    name="${line%%=*}"
    value="${line#*=}"
    [[ "$name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue

    if [[ ${#value} -ge 2 && "$value" == \"*\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ ${#value} -ge 2 && "$value" == \'*\' ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" =~ $_sps_unsafe_pattern ]]; then
      unsafe+=("{\"line\":$lineno,\"name\":\"$name\"}")
    fi

    export "$name=$value"
  done < "$file"

  if [[ ${#unsafe[@]} -gt 0 ]]; then
    local joined
    joined="$(IFS=,; echo "${unsafe[*]}")"
    printf 'SECRETS_ENV_UNSAFE {"file":"%s","issues":[%s],"remediation":"Quote the value: VAR=\\"https://host/path?a=1&b=2\\". Unquoted values are truncated by source and fail silently."}\n' \
      "$file" "$joined" >&2
  fi
}

# testrail.env is optional (automation-as-app forges that uses TestRail from the forge).
for f in jira.env bitbucket.env testrail.env github.env; do
  if [[ -f "$ROOT/projects/$SLUG/.secrets/$f" ]]; then
    _sps_load_file "$ROOT/projects/$SLUG/.secrets/$f"
  fi
done


unset -f _sps_load_file
unset _sps_unsafe_pattern
