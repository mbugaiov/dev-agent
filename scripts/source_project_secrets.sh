#!/usr/bin/env bash
# Source projects/<slug>/.secrets/jira.env and bitbucket.env into the environment.
# Usage: DEV_AGENT_SLUG=<slug> source scripts/source_project_secrets.sh
set -a
SLUG="${DEV_AGENT_SLUG:-${1:-}}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -z "$SLUG" ]]; then
  echo "source_project_secrets: DEV_AGENT_SLUG or slug arg required" >&2
  return 1 2>/dev/null || exit 1
fi
SECRETS="$ROOT/projects/$SLUG/.secrets"
for f in jira.env bitbucket.env; do
  if [[ -f "$SECRETS/$f" ]]; then
    # shellcheck disable=SC1090
    source "$SECRETS/$f"
  fi
done
set +a
