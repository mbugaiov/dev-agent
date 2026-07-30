#!/usr/bin/env bash
# Reject direct git push to main — engine changes merge via PR only.
# Used by .githooks/pre-push; also callable from agent preflight.
set -euo pipefail

PROTECTED="${DEV_AGENT_PROTECTED_BRANCH:-main}"

block=0
while read -r _local_ref _local_sha remote_ref _remote_sha; do
  case "$remote_ref" in
    refs/heads/"$PROTECTED")
      block=1
      ;;
  esac
done

if [[ "$block" -eq 1 ]]; then
  echo "MAIN_PUSH_FORBIDDEN Direct push to '$PROTECTED' is not allowed." >&2
  echo "  Branch off main → push feature branch → open PR → CI + code review → auto-merge." >&2
  echo "  See AGENTS.md and .cursor/rules/dev-engine.mdc" >&2
  exit 1
fi

exit 0
