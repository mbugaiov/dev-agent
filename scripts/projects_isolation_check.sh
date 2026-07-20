#!/usr/bin/env bash
# Projects isolation gate: the engine repo must never track live project data.
#
# Only projects/_template/ belongs in git. Per-app folders (projects/<slug>/) live in
# separate repos, submodules, or local clones — see PORTABILITY.md + ENGINE-REVIEW.md.
#
# Usage: scripts/projects_isolation_check.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
FAIL=0

is_engine_repo() {
  [[ -d "$ROOT/.git" ]] || [[ -f "$ROOT/.git" ]]
}

if is_engine_repo; then
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    case "$f" in
      projects/_template/*) ;;
      *)
        echo "project leak (tracked in git): $f"
        FAIL=1
        ;;
    esac
  done < <(git ls-files 'projects/' 2>/dev/null || true)
fi

if ! grep -qE '^projects/\*' .gitignore; then
  echo "gitignore gap: missing 'projects/*' rule"
  FAIL=1
fi
if ! grep -q '!projects/_template/' .gitignore; then
  echo "gitignore gap: missing '!projects/_template/' exception"
  FAIL=1
fi

LIVE_PROBES=(
  projects/myapp/project.yaml
  projects/myapp/.secrets/jira.env
  projects/acme/project.yaml
)
for probe in "${LIVE_PROBES[@]}"; do
  if is_engine_repo; then
    if git check-ignore -q "$probe" 2>/dev/null; then
      :
    else
      echo "gitignore gap: $probe is not ignored"
      FAIL=1
    fi
  else
    # Pre-git: verify .gitignore rules textually
    grep -qE '^projects/\*' .gitignore && grep -q '!projects/_template/' .gitignore || FAIL=1
    break
  fi
done

if [[ "$FAIL" -eq 0 ]]; then
  echo "projects isolation: OK (only projects/_template/ tracked; live slugs gitignored)"
fi
exit "$FAIL"
