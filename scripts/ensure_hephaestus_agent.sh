#!/usr/bin/env bash
# Ensure an *isolated* Hephaestus oneshot for slug (Kairos wake path).
# Does NOT rely on IDE watch_dev_loop + notify_on_output (those leave blind
# bash schedulers when no Cursor chat is attached).
#
# Prefer: detached cursor-agent CLI oneshot (same pattern as qa-agent ensure_argus).
# Dedup: if projects/<slug>/factory/hephaestus-oneshot.pid is alive, leave it alone.
# Blind bash: if only scripts/dev-loop.sh is up (no agent oneshot), stop it first.
#
# Usage:
#   bash scripts/ensure_hephaestus_agent.sh <slug>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SLUG="${1:-}"

[[ -z "$SLUG" ]] && {
  echo "Usage: ensure_hephaestus_agent.sh <slug>" >&2
  exit 1
}
if [[ ! "$SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "Invalid slug '$SLUG'" >&2
  exit 2
fi

FACTORY="$ROOT/projects/$SLUG/factory"
mkdir -p "$FACTORY"
PID_FILE="$FACTORY/hephaestus-oneshot.pid"
LOG="$FACTORY/hephaestus-oneshot.out"
CLAIM="$FACTORY/hephaestus-oneshot.claim.json"
LOOP_PID_FILE="$FACTORY/loop.pid"
STOP="$ROOT/scripts/stop_dev_loop.sh"

# Do not rewrite PATH before command -v — tests stub cursor-agent via PATH.

if [[ -f "$PID_FILE" ]]; then
  OLD="$(tr -d '[:space:]' <"$PID_FILE" || true)"
  if [[ -n "${OLD:-}" ]] && kill -0 "$OLD" 2>/dev/null; then
    acmd="$(ps -p "$OLD" -o args= 2>/dev/null || true)"
    # Slug-bound only — recycled PID of another tenant must not short-circuit.
    if [[ "$acmd" =~ DEV_FACTORY_SLUG=${SLUG}([^a-z0-9-]|$) ]]; then
      printf 'ALREADY_RUNNING {"slug":"%s","pid":%s,"mode":"cursor-agent-oneshot"}\n' \
        "$SLUG" "$OLD"
      exit 0
    fi
    rm -f "$PID_FILE"
  fi
fi

# Secrets: engine-wide first, then per-slug (per-slug wins).
for envf in \
  "$ROOT/.secrets/cursor.env" \
  "$ROOT/projects/$SLUG/.secrets/cursor.env"
do
  if [[ -f "$envf" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$envf" || true
    set +a
  fi
done

# Blind bash scheduler (no agent oneshot) blocks Kairos forever — reap it.
# Reap even when we will SKIP (exit 3/4): empty slug beats a forever zombie.
blind_bash=0
if [[ -f "$LOOP_PID_FILE" ]]; then
  lp="$(tr -d '[:space:]' <"$LOOP_PID_FILE" || true)"
  if [[ -n "${lp:-}" ]] && kill -0 "$lp" 2>/dev/null; then
    cmd="$(ps -p "$lp" -o args= 2>/dev/null || true)"
    if [[ "$cmd" =~ scripts/dev-loop\.sh[[:space:]]+${SLUG}([[:space:]]|$) ]]; then
      blind_bash=1
    fi
  fi
fi
while read -r pid; do
  [ -z "$pid" ] && continue
  cmd="$(ps -p "$pid" -o args= 2>/dev/null || true)"
  if [[ "$cmd" =~ scripts/dev-loop\.sh[[:space:]]+${SLUG}([[:space:]]|$) ]]; then
    blind_bash=1
  fi
done < <(pgrep -f "scripts/dev-loop.sh" 2>/dev/null || true)

if [[ "$blind_bash" -eq 1 ]]; then
  printf 'HEPHAESTUS_REAP_BLIND {"slug":"%s","reason":"bash-scheduler-without-agent-oneshot"}\n' "$SLUG"
  if [[ -f "$STOP" ]]; then
    bash "$STOP" "$SLUG" >/dev/null 2>&1 || true
  fi
fi

# No apostrophes in PROMPT — nested bash -c quoting hazard (see qa-agent arm_qa_loop).
PROMPT="EXECUTE Hephaestus oneshot for ${SLUG}. Isolated oneshot — not an ambient IDE chat. Set CURSOR_FACTORY_SESSION=1 and DEV_FACTORY_SLUG=${SLUG}. Drain impl-dev backlog (oldest first): pickup → OpenSpec/gates → implement → app gate → MR → wait_pr_pipeline → handoff; stay while open PR/MR remains; exit only when backlog idle AND no open MRs (DEV_FACTORY_IDLE). Skills: dev-factory-loop, dev-mr-pipeline. Forbidden: notify-only / status-only; do not leave a bash-only dev-loop without executing tickets. Prefer direct ticket pickup over silent watch_dev_loop."

if ! command -v cursor-agent >/dev/null 2>&1; then
  printf 'HEPHAESTUS_ONESHOT_SKIP {"slug":"%s","reason":"cursor-agent-missing"}\n' "$SLUG"
  exit 3
fi
# Resolve absolute binary now so detached spawn cannot pick a different PATH
# (e.g. LaunchAgent vs test stub).
CURSOR_AGENT_BIN="$(command -v cursor-agent)"
if [[ -z "${CURSOR_API_KEY:-}" ]]; then
  printf 'HEPHAESTUS_ONESHOT_SKIP {"slug":"%s","reason":"CURSOR_API_KEY-missing"}\n' "$SLUG"
  exit 4
fi

MODEL_ARGS=()
if [[ -n "${HEPHAESTUS_ONESHOT_MODEL:-}" ]]; then
  MODEL_ARGS=(--model "$HEPHAESTUS_ONESHOT_MODEL")
fi
MODEL_ARGS_Q=""
if [[ ${#MODEL_ARGS[@]} -gt 0 ]]; then
  MODEL_ARGS_Q=$(printf ' %q' "${MODEL_ARGS[@]}")
fi
QUOTED_PROMPT=$(printf '%q' "$PROMPT")
QUOTED_BIN=$(printf '%q' "$CURSOR_AGENT_BIN")

: >"$LOG"
printf '{"slug":"%s","issuedAt":"%s","mode":"cursor-agent-oneshot"}\n' \
  "$SLUG" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$CLAIM"

nohup bash -c "
  cd \"$ROOT\"
  export CURSOR_FACTORY_SESSION=1
  export DEV_FACTORY_SLUG=\"$SLUG\"
  ${QUOTED_BIN} --force --api-key \"\$CURSOR_API_KEY\"${MODEL_ARGS_Q} \
    --output-format text -p ${QUOTED_PROMPT} >>\"$LOG\" 2>&1
  rm -f \"$PID_FILE\"
" >/dev/null 2>&1 &
ONESHOT_PID=$!
echo "$ONESHOT_PID" >"$PID_FILE"
disown "$ONESHOT_PID" 2>/dev/null || true

sleep 1.5
if ! kill -0 "$ONESHOT_PID" 2>/dev/null; then
  detail="$(tail -c 240 "$LOG" 2>/dev/null | tr '\n' ' ' | tr -d '\"' || true)"
  printf 'HEPHAESTUS_ONESHOT_FAIL {"slug":"%s","reason":"exited-immediately","detail":"%s","log":"%s"}\n' \
    "$SLUG" "${detail:0:180}" "$LOG"
  rm -f "$PID_FILE"
  exit 5
fi

printf 'HEPHAESTUS_ONESHOT_ARMED {"slug":"%s","pid":%s,"log":"%s","mode":"cursor-agent-oneshot"}\n' \
  "$SLUG" "$ONESHOT_PID" "$LOG"
exit 0
