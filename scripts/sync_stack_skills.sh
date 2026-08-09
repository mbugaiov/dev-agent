#!/usr/bin/env bash
# Install marketplace / stack skills into the **dev-agent engine** based on
# projects/<slug>/project.yaml → stack.*. Always pulls from upstream skill repos
# (fresh), never commits packs into git (.agents/ is gitignored).
#
# Usage:
#   bash scripts/sync_stack_skills.sh <slug>           # install for project stack
#   bash scripts/sync_stack_skills.sh <slug> --dry-run # print planned installs
#   bash scripts/sync_stack_skills.sh --list-packs     # show keyword → pack map
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DRY=0
LIST=0
SLUG=""

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    --list-packs) LIST=1 ;;
    -h|--help)
      sed -n '2,12p' "$0" | tr -d '#'
      exit 0
      ;;
    *)
      if [[ -z "$SLUG" && "$arg" != --* ]]; then SLUG="$arg"; fi
      ;;
  esac
done

AGENTS_SKILLS="$ROOT/.agents/skills"
CURSOR_SKILLS="$ROOT/.cursor/skills"
CACHE="${DOTNET_SKILLS_CACHE:-${TMPDIR:-/tmp}/dotnet-skills-cache}"

list_packs() {
  cat <<'EOF'
Keyword match (case-insensitive on stack.* blob) → install action

  asp.net|c#|.net|dotnet     → github.com/dotnet/skills (plugins: web/test/msbuild/data)
  angular                    → npx skills add analogjs/angular-skills
  ionic                      → npx skills add capawesome-team/skills --skill ionic-angular
                               (+ ionic-app-development, ionic-expert when available)
  sql server|mssql|t-sql     → npx skills add damusix/skills --skill mssql-server
  supabase                   → npx skills add supabase/agent-skills --skill supabase

Playwright / JWT security → prefer qa-agent (not this script).
Product-specific overrides → projects/<slug>/.cursor/skills/ (gitignored).
EOF
}

if [[ "$LIST" -eq 1 ]]; then
  list_packs
  exit 0
fi

if [[ -z "$SLUG" ]]; then
  echo "Usage: bash scripts/sync_stack_skills.sh <slug> [--dry-run]" >&2
  exit 2
fi

YAML="$ROOT/projects/$SLUG/project.yaml"
if [[ ! -f "$YAML" ]]; then
  echo "Missing $YAML" >&2
  exit 1
fi

# Flatten stack: section for keyword matching (no yaml parser required).
STACK_BLOB="$(
  awk '
    /^stack:[[:space:]]*$/ { in_stack=1; next }
    in_stack && /^[a-zA-Z0-9_]+:/ && $0 !~ /^[[:space:]]/ { exit }
    in_stack { print }
  ' "$YAML" | tr '\n' ' '
)"
STACK_LC="$(printf '%s' "$STACK_BLOB" | tr '[:upper:]' '[:lower:]')"

echo "sync_stack_skills: slug=$SLUG"
echo "stack blob: ${STACK_BLOB:0:200}..."

need() {
  local pattern="$1"
  printf '%s' "$STACK_LC" | grep -Eq "$pattern"
}

run() {
  if [[ "$DRY" -eq 1 ]]; then
    echo "DRY: $*"
    return 0
  fi
  echo "+ $*"
  "$@"
}

install_dotnet() {
  local plugins=(dotnet dotnet-aspnetcore dotnet-test dotnet-msbuild dotnet-data)
  if [[ "$DRY" -eq 1 ]]; then
    echo "DRY: vendor https://github.com/dotnet/skills → .agents/skills + .cursor/skills/dotnet-*"
    return 0
  fi
  if [[ ! -d "$CACHE/.git" ]]; then
    rm -rf "$CACHE"
    git clone --depth 1 https://github.com/dotnet/skills.git "$CACHE"
  else
    git -C "$CACHE" pull --ff-only || true
  fi
  mkdir -p "$AGENTS_SKILLS" "$CURSOR_SKILLS"
  for plug in "${plugins[@]}"; do
    local src="$CACHE/plugins/$plug/skills"
    [[ -d "$src" ]] || continue
    find "$src" -mindepth 1 -maxdepth 1 -type d | while read -r skilldir; do
      local name target
      name=$(basename "$skilldir")
      if [[ "$name" == dotnet-* ]]; then target="$name"; else target="dotnet-$name"; fi
      rm -rf "$AGENTS_SKILLS/$target" "$CURSOR_SKILLS/$target"
      cp -R "$skilldir" "$AGENTS_SKILLS/$target"
      cp -R "$skilldir" "$CURSOR_SKILLS/$target"
      echo "  $plug/$name"
    done
  done
}

install_npx_skill() {
  local repo="$1"
  shift
  # Install into engine cwd so packs land under .agents/skills (skills CLI default).
  if [[ "$DRY" -eq 1 ]]; then
    echo "DRY: npx --yes skills add $repo $*"
    return 0
  fi
  # skills CLI may prompt; --yes where supported. Fail soft so one pack does not block others.
  if ! npx --yes skills add "$repo" "$@" 2>/dev/null; then
    echo "WARN: npx skills add $repo $* failed — install manually if needed" >&2
  fi
}

PLANNED=0
if need 'asp\.net|c#|\.net|dotnet'; then
  PLANNED=1
  echo "==> .NET stack"
  install_dotnet
fi
if need 'angular'; then
  PLANNED=1
  echo "==> Angular stack"
  install_npx_skill analogjs/angular-skills
fi
if need 'ionic'; then
  PLANNED=1
  echo "==> Ionic stack"
  install_npx_skill capawesome-team/skills --skill ionic-angular
  install_npx_skill capawesome-team/skills --skill ionic-app-development
  install_npx_skill capawesome-team/skills --skill ionic-expert
fi
if need 'sql server|mssql|t-sql|stored procedure'; then
  PLANNED=1
  echo "==> SQL Server stack"
  install_npx_skill damusix/skills --skill mssql-server
fi
if need 'supabase'; then
  PLANNED=1
  echo "==> Supabase stack"
  install_npx_skill supabase/agent-skills --skill supabase
fi

if [[ "$PLANNED" -eq 0 ]]; then
  echo "No stack skill packs matched for slug=$SLUG (check project.yaml stack:)."
  exit 0
fi

echo "DONE — stack skills installed under $AGENTS_SKILLS (gitignored; re-run anytime for fresher upstream)."
echo "Product overrides (if any): projects/$SLUG/.cursor/skills/ (also gitignored)."
