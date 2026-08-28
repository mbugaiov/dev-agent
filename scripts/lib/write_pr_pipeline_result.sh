#!/usr/bin/env bash
# Write projects/<slug>/factory/pr-pipeline.result.json (Kairos missed-wake stall).
# Usage: write_pr_pipeline_result.sh <slug> <pr> <repo> <failed|green> [reason]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SLUG="${1:?slug}"
PR="${2:?pr}"
REPO="${3:?repo}"
OUTCOME="${4:?failed|green}"
REASON="${5:-}"
FACTORY="$ROOT/projects/$SLUG/factory"
mkdir -p "$FACTORY"
AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
if [[ -n "$REASON" ]]; then
  printf '{"pr":%s,"repo":"%s","outcome":"%s","at":"%s","reason":"%s"}\n' \
    "$PR" "$REPO" "$OUTCOME" "$AT" "$REASON" >"$FACTORY/pr-pipeline.result.json"
else
  printf '{"pr":%s,"repo":"%s","outcome":"%s","at":"%s"}\n' \
    "$PR" "$REPO" "$OUTCOME" "$AT" >"$FACTORY/pr-pipeline.result.json"
fi
