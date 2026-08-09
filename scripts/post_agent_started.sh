#!/usr/bin/env bash
# Post ### <Seat> started on a GitHub issue or PR (and print the same for chat).
# Usage:
#   bash scripts/post_agent_started.sh <slug> <issue-number> <Seat> "<Mode>" "<Doing>"
#   bash scripts/post_agent_started.sh <slug> pr:<pr-number> <Seat> "<Mode>" "<Doing>"
#   bash scripts/post_agent_started.sh --repo owner/repo pr:<N> <Seat> "<Mode>" "<Doing>"
#   bash scripts/post_agent_started.sh --repo owner/repo <issue-N> <Seat> "<Mode>" "<Doing>"
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OWNER=""
REPO=""
SLUG=""
TARGET=""
SEAT=""
MODE=""
DOING=""

if [[ "${1:-}" == "--repo" ]]; then
  IFS=/ read -r OWNER REPO <<<"${2:-}"
  TARGET="${3:-}"
  SEAT="${4:-}"
  MODE="${5:-}"
  DOING="${6:-}"
  SLUG="${REPO:-engine}"
else
  SLUG="${1:-}"
  TARGET="${2:-}"
  SEAT="${3:-}"
  MODE="${4:-}"
  DOING="${5:-}"
fi

if [[ -z "$TARGET" || -z "$SEAT" || -z "$MODE" || -z "$DOING" ]]; then
  echo "Usage: $0 <slug> <issue-number|pr:N> <Seat> \"<Mode>\" \"<Doing>\"" >&2
  echo "   or: $0 --repo owner/repo <issue-number|pr:N> <Seat> \"<Mode>\" \"<Doing>\"" >&2
  exit 2
fi

if [[ -z "$OWNER" || -z "$REPO" ]]; then
  if [[ -z "$SLUG" ]]; then
    echo "AGENT_START_FAIL missing slug or --repo" >&2
    exit 1
  fi
  YAML="$ROOT/projects/$SLUG/project.yaml"
  if [[ ! -f "$YAML" ]]; then
    echo "AGENT_START_FAIL missing $YAML (use --repo owner/repo for engine PRs)" >&2
    exit 1
  fi
  OWNER="$(awk '/^[[:space:]]*workspace:/{print $2; exit}' "$YAML" | tr -d '"')"
  REPO="$(awk '/^[[:space:]]*repo:/{print $2; exit}' "$YAML" | tr -d '"')"
fi

if [[ -z "$OWNER" || -z "$REPO" ]]; then
  echo "AGENT_START_FAIL cannot resolve owner/repo" >&2
  exit 1
fi

if [[ "$TARGET" == pr:* ]]; then
  NUM="${TARGET#pr:}"
  BODY_TICKET="**PR:** ${OWNER}/${REPO}#${NUM}"
  GH_CMD=(gh pr comment "$NUM" -R "${OWNER}/${REPO}" --body-file -)
else
  NUM="$TARGET"
  BODY_TICKET="**Ticket:** ${SLUG}#${NUM}"
  GH_CMD=(gh issue comment "$NUM" -R "${OWNER}/${REPO}" --body-file -)
fi

BODY="$(cat <<EOF
### ${SEAT} started

${BODY_TICKET}
**Mode:** ${MODE}
**Doing:** ${DOING}

\`post_agent_started · $(date -u +%Y-%m-%dT%H:%M:%SZ)\`
EOF
)"

echo "$BODY"
echo "-----"

if [[ "${AGENT_START_DRY_RUN:-0}" == "1" ]]; then
  echo "AGENT_START_DRY_RUN ok"
  exit 0
fi

printf '%s\n' "$BODY" | "${GH_CMD[@]}"
echo "AGENT_START_OK {\"repo\":\"${OWNER}/${REPO}\",\"target\":\"$TARGET\",\"seat\":\"$SEAT\"}"
