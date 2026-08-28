#!/usr/bin/env bash
# Bounded PR pipeline poll for Hephaestus oneshot (hard wait — no Await regex).
#
# Exit:
#   0 = PR_PIPELINE_GREEN
#   1 = PR_PIPELINE_FAILED
#   3 = PR_PIPELINE_PENDING — agent MUST re-invoke this script (same args)
#
# Usage:
#   bash scripts/follow_pr_pipeline_chunk.sh <slug> <PR> [--max-sec 75] [--poll 15]
#
# Agent loop (mandatory for cursor-agent oneshot):
#   while true; do
#     bash scripts/follow_pr_pipeline_chunk.sh "$SLUG" "$PR"; ec=$?
#     [[ $ec -eq 0 ]] && break   # green → merge
#     [[ $ec -eq 1 ]] && break   # failed → fix Themis / push
#     [[ $ec -eq 3 ]] && continue
#     break
#   done
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
exec npx tsx scripts/follow_pr_pipeline_chunk.ts "$@"
