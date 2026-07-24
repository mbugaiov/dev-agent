#!/usr/bin/env bash
# OpenSpec app readiness — used by setup_verify.sh when app.openspec_enabled.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec npx tsx "$ROOT/scripts/verify_app_openspec.ts" "$@"
