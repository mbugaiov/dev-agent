#!/usr/bin/env bash
# Post ### <Seat> started on a GitHub issue or PR (and print the same for chat).
# Usage:
#   bash scripts/post_agent_started.sh <slug> <issue-number> <Seat> "<Mode>" "<Doing>"
#   bash scripts/post_agent_started.sh <slug> pr:<pr-number> <Seat> "<Mode>" "<Doing>"
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SLUG="${1:-}"
TARGET="${2:-}"
SEAT="${3:-}"
MODE="${4:-}"
DOING="${5:-}"

if [[ -z "$SLUG" || -z "$TARGET" || -z "$SEAT" || -z "$MODE" || -z "$DOING" ]]; then
  echo "Usage: $0 <slug> <issue-number|pr:N> <Seat> \"<Mode>\" \"<Doing>\"" >&2
  exit 2
fi

YAML="$ROOT/projects/$SLUG/project.yaml"
if [[ ! -f "$YAML" ]]; then
  echo "AGENT_START_FAIL missing $YAML" >&2
  exit 1
fi

OWNER="$(awk -F'"' '/^[[:space:]]*workspace:/{print $2; exit}' "$YAML" 2>/dev/null || true)"
REPO="$(awk -F'"' '/^[[:space:]]*repo:/{print $2; exit}' "$YAML" 2>/dev/null || true)"
if [[ -z "$OWNER" ]]; then
  OWNER="$(awk '/^[[:space:]]*workspace:/{print $2; exit}' "$YAML" | tr -d '"')"
fi
if [[ -z "$REPO" ]]; then
  REPO="$(awk '/^[[:space:]]*repo:/{print $2; exit}' "$YAML" | tr -d '"')"
fi
if [[ -z "$OWNER" || -z "$REPO" ]]; then
  echo "AGENT_START_FAIL cannot resolve git.workspace/repo from $YAML" >&2
  exit 1
fi

TICKET_LABEL="${SLUG}"
BODY_TICKET=""
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

# Always print for Cursor chat (first thing agents should show)
echo "$BODY"
echo "-----"

if [[ "${AGENT_START_DRY_RUN:-0}" == "1" ]]; then
  echo "AGENT_START_DRY_RUN ok"
  exit 0
fi

printf '%s\n' "$BODY" | "${GH_CMD[@]}"
echo "AGENT_START_OK {\"slug\":\"$SLUG\",\"target\":\"$TARGET\",\"seat\":\"$SEAT\"}"
