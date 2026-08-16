#!/usr/bin/env bash
# Exit 0 if project has ≥1 open PR/MR; exit 1 if none; exit 2 on probe error.
# Usage: bash scripts/project_has_open_mrs.sh <slug>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SLUG="${1:?slug}"
export DEV_AGENT_SLUG="$SLUG"
# shellcheck disable=SC1091
source "$ROOT/scripts/source_project_secrets.sh" "$SLUG" 2>/dev/null || true
OUT="$(cd "$ROOT" && npx tsx scripts/project_open_mrs.ts "$SLUG")" || {
  echo "OPEN_MRS_PROBE_ERROR" >&2
  exit 2
}
echo "$OUT"
COUNT="$(
  printf '%s\n' "$OUT" | node -e '
    const fs = require("fs");
    const line = fs.readFileSync(0, "utf8").trim().split("\n").find((l) => l.startsWith("OPEN_MRS "));
    if (!line) process.exit(2);
    const n = JSON.parse(line.slice("OPEN_MRS ".length)).count;
    process.stdout.write(String(n));
  '
)" || exit 2
if [[ "$COUNT" -gt 0 ]]; then
  exit 0
fi
exit 1
