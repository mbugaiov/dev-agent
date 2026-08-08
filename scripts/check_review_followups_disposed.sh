#!/usr/bin/env bash
# Hephaestus thin wrapper → themis-agent follow-up scripts.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export THEMIS_REVIEW_MARKER="${THEMIS_REVIEW_MARKER:-<!-- dev-agent-cursor-review -->}"
export THEMIS_FOLLOWUP_DISPOSE_MARKER="${THEMIS_FOLLOWUP_DISPOSE_MARKER:-<!-- dev-agent-review-followups-disposed -->}"
export THEMIS_FOLLOWUP_SECTIONS="${THEMIS_FOLLOWUP_SECTIONS:-Suggestions,High priority issues,Risks}"
# Prefer explicit → Actions GITHUB_REPOSITORY → gh from engine ROOT
export THEMIS_FOLLOWUP_REPO="${THEMIS_FOLLOWUP_REPO:-${GITHUB_REPOSITORY:-$(cd "$ROOT" && gh repo view --json nameWithOwner -q .nameWithOwner)}}"
THEMIS="$(bash "$ROOT/scripts/ensure_themis_agent.sh")"
exec bash "$THEMIS/scripts/check_review_followups_disposed.sh" "$@"
