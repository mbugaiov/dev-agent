#!/usr/bin/env bash
# Smoke: K14 stall probe + stop + re-arm (no cursor-agent network required).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
SLUG="${1:-selftest}"
FACTORY="projects/$SLUG/factory"
mkdir -p "$FACTORY"

pass=0
fail=0
ok() { echo "PASS: $1"; pass=$((pass + 1)); }
no() { echo "FAIL: $1"; fail=$((fail + 1)); }

echo "=== K14 process smoke (slug=$SLUG) ==="

# 1) Stall probe — healthy (no pid)
out="$(npx tsx scripts/print_oneshot_stall.ts "$SLUG" 2>/dev/null | tail -1)"
[[ "$out" == ONESHOT_NONE* ]] && ok "stall probe with no oneshot" || no "expected ONESHOT_NONE got $out"

# 2) Stall probe — synthetic stalled (reconnect tail + old heartbeat)
sleep 30 &
fake=$!
echo "$fake" >"$FACTORY/hephaestus-oneshot.pid"
printf '{"slug":"%s","issuedAt":"2020-01-01T00:00:00Z"}\n' "$SLUG" >"$FACTORY/hephaestus-oneshot.claim.json"
printf 'Connection lost, reconnecting to https://agentn.global.api5.cursor.sh\n' >"$FACTORY/hephaestus-oneshot.out"
echo 1 >"$FACTORY/hephaestus-oneshot.heartbeat"
out="$(ONESHOT_STALL_SILENT_SEC=60 ONESHOT_STALL_RECONNECT_GRACE_SEC=30 \
  npx tsx scripts/print_oneshot_stall.ts "$SLUG" 2>/dev/null | tail -1)"
[[ "$out" == ONESHOT_STALLED* ]] && ok "stall probe detects reconnect stall" || no "expected ONESHOT_STALLED got $out"

# 3) stop_dev_loop kills ensure-style wrapper (factory path in cmdline)
kill "$fake" 2>/dev/null || true
rm -f "$FACTORY/hephaestus-oneshot.pid" "$FACTORY/hephaestus-oneshot.out" "$FACTORY/hephaestus-oneshot.heartbeat"
HB="$FACTORY/hephaestus-oneshot.heartbeat"
LOG="$FACTORY/hephaestus-oneshot.out"
printf '{"slug":"%s"}\n' "$SLUG" >"$FACTORY/hephaestus-oneshot.claim.json"
bash -c "export DEV_FACTORY_SLUG=\"${SLUG}\"; export HEPHAESTUS_LOG=${LOG}; export HEPHAESTUS_HEARTBEAT=${HB}; sleep 120" &
wrap=$!
sleep 0.3
runner="$(pgrep -P "$wrap" 2>/dev/null | head -1 || true)"
[[ -n "$runner" ]] && echo "$runner" >"$FACTORY/hephaestus-oneshot.pid" || echo "$wrap" >"$FACTORY/hephaestus-oneshot.pid"
target="$(tr -d '[:space:]' <"$FACTORY/hephaestus-oneshot.pid" || true)"
stop_out="$(bash scripts/stop_dev_loop.sh "$SLUG" 2>&1)"
if kill -0 "$wrap" 2>/dev/null || kill -0 "$target" 2>/dev/null; then
  no "stop_dev_loop must kill wrapper (out=$stop_out)"
else
  ok "stop_dev_loop kills ensure-style wrapper"
fi
kill "$wrap" 2>/dev/null || true
kill "$target" 2>/dev/null || true
[[ ! -f "$FACTORY/hephaestus-oneshot.claim.json" ]] && ok "claim.json cleared on stop" \
  || no "claim.json should be removed on stop"
rm -f "$FACTORY/hephaestus-oneshot.pid" "$HB" "$LOG"

# 4) Cross-tenant guard — sleep pid on wrong slug pid file must not kill
sleep 45 &
wrong=$!
echo "$wrong" >"$FACTORY/hephaestus-oneshot.pid"
stop_out="$(bash scripts/stop_dev_loop.sh "$SLUG" 2>&1)"
if kill -0 "$wrong" 2>/dev/null && echo "$stop_out" | grep -q cmdline-mismatch; then
  ok "stop skips mismatched pid file"
else
  no "must not kill unrelated sleep pid (out=$stop_out)"
fi
kill "$wrong" 2>/dev/null || true
rm -f "$FACTORY/hephaestus-oneshot.pid"

# 5) ensure_hephaestus — skip without cursor-agent is OK for smoke
if ! command -v cursor-agent >/dev/null 2>&1; then
  out="$(bash scripts/ensure_hephaestus_agent.sh "$SLUG" 2>&1 | tail -1)"
  [[ "$out" == *HEPHAESTUS_ONESHOT_SKIP* ]] && ok "ensure skips cleanly without cursor-agent" \
    || no "ensure skip unexpected: $out"
else
  ok "cursor-agent present — live arm skipped in smoke (run ensure manually)"
fi

echo "=== smoke done: $pass passed, $fail failed ==="
[[ "$fail" -eq 0 ]]
