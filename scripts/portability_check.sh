#!/usr/bin/env bash
# Portability gate: tracked engine files must not hardcode a live project slug or product.
#
# Usage: scripts/portability_check.sh
# Exit 0 = clean. Exit 1 = forbidden pattern in tracked files.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Patterns that belong in dev-agent-project-* repos, not the engine.
FORBIDDEN='(\blrm\b|RQ-[0-9]+|sol-ark|solark|qa_lab_resource_management|lab-test-booking|lab-rm\.|64\.225\.|/Users/max/Downloads|AGENT_LOOP_TICK_lrm|npm run gate:mr)'

PATHS=(
  .cursor
  lib
  scripts
  templates
  tests
  docs
  AGENTS.md
  ARCHITECTURE.md
  SETUP.md
  HOST_SETUP.md
  PORTABILITY.md
  ENGINE-REVIEW.md
  EXTRACTION-MAP.md
  README.md
)

FAIL=0

scan_file() {
  local f="$1"
  [[ -z "$f" ]] && continue
  [[ "$f" == "scripts/portability_check.sh" ]] && continue
  while IFS= read -r line; do
    echo "$line" | grep -qE 'e\.g\. `<slug>`|e\.g\. <slug>|<EPIC-KEY>|<workspace>|<repo>' && continue
    echo "portability leak: $line"
    FAIL=1
  done < <(grep -nE "$FORBIDDEN" "$f" 2>/dev/null || true)
}

if git rev-parse --git-dir >/dev/null 2>&1; then
  while IFS= read -r f; do
    scan_file "$f"
  done < <(git ls-files "${PATHS[@]}" 2>/dev/null || true)
else
  # Pre-git: scan paths on disk
  for base in "${PATHS[@]}"; do
    if [[ -f "$base" ]]; then
      scan_file "$base"
    elif [[ -d "$base" ]]; then
      while IFS= read -r f; do
        scan_file "$f"
      done < <(find "$base" -type f 2>/dev/null || true)
    fi
  done
fi

if [[ "$FAIL" -eq 0 ]]; then
  echo "portability: OK (no project-specific leaks in engine files)"
fi
exit "$FAIL"
