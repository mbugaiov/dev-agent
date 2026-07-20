#!/usr/bin/env bash
# Create a new per-project dev factory from projects/_template.
# Usage: scripts/new_project.sh <slug> <epic-key> ["Project Name"]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE="$ROOT/projects/_template"

SLUG="${1:-}"
EPIC="${2:-}"
NAME="${3:-$SLUG}"

if [[ -z "$SLUG" || -z "$EPIC" ]]; then
  echo "Usage: scripts/new_project.sh <slug> <epic-key> [\"Project Name\"]" >&2
  exit 1
fi
if [[ ! "$SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "Error: slug must be lowercase letters, digits, and hyphens." >&2
  exit 1
fi

DEST="$ROOT/projects/$SLUG"
if [[ -e "$DEST" ]]; then
  echo "Error: $DEST already exists." >&2
  exit 1
fi

cp -R "$TEMPLATE" "$DEST"
mkdir -p "$DEST/.secrets" "$DEST/factory/runs"
touch "$DEST/factory/runs/.gitkeep"

subst() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  if sed -i '' \
    -e "s|<Project Name>|$NAME|g" \
    -e "s|<slug>|$SLUG|g" \
    -e "s|<EPIC-KEY>|$EPIC|g" \
    -e "s|<App>|$NAME|g" \
    "$f" 2>/dev/null; then
    return 0
  fi
  sed -i \
    -e "s|<Project Name>|$NAME|g" \
    -e "s|<slug>|$SLUG|g" \
    -e "s|<EPIC-KEY>|$EPIC|g" \
    -e "s|<App>|$NAME|g" \
    "$f"
}

for f in \
  "$DEST/project.yaml" \
  "$DEST/project-memory.md" \
  "$DEST/docs/DEFINITION-OF-DONE.md" \
  "$DEST/docs/HUMAN-EXCEPTIONS.md"; do
  subst "$f"
done

# Epic in yaml
if sed -i '' "s|epic_key: \"<EPIC-KEY>\"|epic_key: $EPIC|" "$DEST/project.yaml" 2>/dev/null; then
  :
else
  sed -i "s|epic_key: \"<EPIC-KEY>\"|epic_key: $EPIC|" "$DEST/project.yaml"
fi

echo "Created dev factory project: projects/$SLUG"
echo "  Next: edit project.yaml (app.repo_path, git, stg)"
echo "  Secrets: projects/$SLUG/.secrets/jira.env + bitbucket.env"
