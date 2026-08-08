#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export THEMIS_REVIEW_MARKER="${THEMIS_REVIEW_MARKER:-<!-- dev-agent-cursor-review -->}"
export THEMIS_FOLLOWUP_DISPOSE_MARKER="${THEMIS_FOLLOWUP_DISPOSE_MARKER:-<!-- dev-agent-review-followups-disposed -->}"
export THEMIS_FOLLOWUP_SECTIONS="${THEMIS_FOLLOWUP_SECTIONS:-Suggestions,High priority issues,Risks}"
THEMIS="$(bash "$ROOT/scripts/ensure_themis_agent.sh")"
exec bash "$THEMIS/scripts/file_review_followups.sh" "$@"
