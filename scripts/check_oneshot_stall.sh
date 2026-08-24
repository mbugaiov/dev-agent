#!/usr/bin/env bash
# K14: probe Hephaestus oneshot stall liveness for slug.
# Usage: bash scripts/check_oneshot_stall.sh <slug>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SLUG="${1:?slug}"
cd "$ROOT"
exec npx tsx scripts/print_oneshot_stall.ts "$SLUG"
