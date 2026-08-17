#!/usr/bin/env bash
# Arm the dev factory loop — supported entry point.
# Usage: bash scripts/arm_dev_loop.sh <slug>
# Prefer: bash scripts/run_dev_loop.sh <slug> (same detach + explicit watch-attach contract)
#
# Default: detach scheduler into a new session (survives Cursor Shell exit)
#   → projects/<slug>/factory/loop.{pid,out}
# THEN (mandatory same turn): bash scripts/watch_dev_loop.sh <slug> + notify_on_output
# Foreground (debug): DEV_LOOP_FOREGROUND=1 bash scripts/arm_dev_loop.sh <slug>
#
# Slug-scoped: arming one factory does NOT kill another slug's loop.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SLUG="${1:-${DEV_AGENT_SLUG:-}}"
if [[ -z "$SLUG" ]]; then
  echo "Usage: arm_dev_loop.sh <slug>" >&2
  exit 1
fi
if [[ ! "$SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "Invalid slug '$SLUG' — expected ^[a-z0-9][a-z0-9-]*$" >&2
  exit 2
fi

PR_BACKUP="${DEV_PR_BACKUP_SEC:-300}"
FACTORY_DIR="$ROOT/projects/$SLUG/factory"
LOG="$FACTORY_DIR/loop.out"
PID_FILE="$FACTORY_DIR/loop.pid"
mkdir -p "$FACTORY_DIR"

# Clean prior scheduler + Cursor watchers for this slug only (other factories coexist).
bash "$ROOT/scripts/stop_dev_loop.sh" "$SLUG" >/dev/null || true
sleep 0.2

cd "$ROOT"
export DEV_AGENT_SLUG="$SLUG"
# shellcheck disable=SC1091
source "$ROOT/scripts/source_project_secrets.sh" "$SLUG" || true

if [[ -n "${DEV_LOOP_INTERVAL_SEC:-}" ]]; then
  INTERVAL="$DEV_LOOP_INTERVAL_SEC"
else
  INTERVAL="$(npx tsx scripts/resolve_loop_interval.ts "$SLUG")"
fi

npx tsx scripts/print_loop_armed.ts "$SLUG" "$INTERVAL"

WATCH_PATTERN='^(BACKLOG_WAKE_EXECUTE|MR_SESSION_MERGED_STALE_BRANCH|MR_PR_BACKUP_)'
printf 'LOOP_ARM_AGENT_INSTRUCTIONS Scheduler detaches into a new session (default). For Cursor wakes: bash scripts/watch_dev_loop.sh %s with notify_on_output on %s. On BACKLOG_WAKE_EXECUTE: start oldest ticket NOW — no status-only replies; drain backlog until DEV_FACTORY_IDLE. If the watcher Shell is aborted, re-attach watch_dev_loop.sh (scheduler keeps ticking — verify projects/%s/factory/loop.pid).\n' \
  "$SLUG" "$WATCH_PATTERN" "$SLUG"

export DEV_LOOP_INTERVAL_SEC="$INTERVAL"
export DEV_PR_BACKUP_SEC="$PR_BACKUP"
export DEV_LOOP_ARMED=1
export DEV_AGENT_SLUG="$SLUG"

if [[ "${DEV_LOOP_FOREGROUND:-0}" == "1" ]]; then
  printf 'LOOP_FOREGROUND {"slug":"%s","intervalSec":%s}\n' "$SLUG" "$INTERVAL"
  exec bash scripts/dev-loop.sh "$SLUG"
fi

# Default run: double-fork + setsid so Cursor process-group teardown cannot kill the scheduler.
# Plain `nohup … &` is not enough when the parent Shell is an agent terminal.
: >"$LOG"
{
  npx tsx scripts/print_loop_armed.ts "$SLUG" "$INTERVAL"
} >>"$LOG" 2>&1

SCHED_PID="$(
  python3 - "$ROOT" "$SLUG" "$LOG" "$PID_FILE" <<'PY'
import os
import sys
import time

root, slug, log_path, pid_path = sys.argv[1:5]
script = os.path.join(root, "scripts", "dev-loop.sh")

# Parent of first fork waits for pid file, then exits (arm continues).
if os.fork() != 0:
    for _ in range(50):
        try:
            with open(pid_path, encoding="utf-8") as f:
                pid = f.read().strip()
            if pid and os.path.exists(f"/proc/{pid}"):
                print(pid)
                raise SystemExit(0)
            # macOS: /proc may be absent — check via kill(pid, 0)
            if pid:
                try:
                    os.kill(int(pid), 0)
                    print(pid)
                    raise SystemExit(0)
                except ProcessLookupError:
                    pass
                except PermissionError:
                    print(pid)
                    raise SystemExit(0)
        except FileNotFoundError:
            pass
        time.sleep(0.1)
    raise SystemExit("detach: timed out waiting for loop.pid")

os.setsid()
if os.fork() != 0:
    os._exit(0)

os.chdir(root)
with open("/dev/null", "r", encoding="utf-8") as sin, open(
    log_path, "a", encoding="utf-8"
) as sout:
    os.dup2(sin.fileno(), 0)
    os.dup2(sout.fileno(), 1)
    os.dup2(sout.fileno(), 2)

with open(pid_path, "w", encoding="utf-8") as f:
    f.write(str(os.getpid()))
    f.flush()
    os.fsync(f.fileno())

os.environ["DEV_LOOP_ARMED"] = "1"
os.execvp("bash", ["bash", script, slug])
PY
)"

sleep 0.5
if [[ -z "${SCHED_PID:-}" ]] || ! kill -0 "$SCHED_PID" 2>/dev/null; then
  printf 'LOOP_DETACH_FAILED {"slug":"%s","log":"%s"}\n' "$SLUG" "$LOG" >&2
  tail -n 40 "$LOG" >&2 || true
  exit 1
fi

# Ensure pid file matches (daemon writes it; keep in sync if python printed it).
echo "$SCHED_PID" >"$PID_FILE"

printf 'LOOP_DETACHED {"slug":"%s","pid":%s,"intervalSec":%s,"log":"%s","pidFile":"%s","session":"setsid"}\n' \
  "$SLUG" "$SCHED_PID" "$INTERVAL" "$LOG" "$PID_FILE"

# Cursor cannot notify on a detached process — watcher is mandatory for execute wakes.
printf 'LOOP_WATCH_ATTACH_REQUIRED {"slug":"%s","mustSameTurn":true,"command":"bash scripts/watch_dev_loop.sh %s","notifyPattern":"%s","blockUntilMs":0,"reason":"Without watch_dev_loop + notify_on_output, BACKLOG_WAKE_EXECUTE stays silent in loop.out and tickets will not execute"}\n' \
  "$SLUG" "$SLUG" "$WATCH_PATTERN"
printf 'LOOP_ARM_INCOMPLETE_WITHOUT_WATCHER Arm alone is not enough. SAME TURN: background Shell → bash scripts/watch_dev_loop.sh %s with notify_on_output on %s.\n' \
  "$SLUG" "$WATCH_PATTERN"
exit 0
