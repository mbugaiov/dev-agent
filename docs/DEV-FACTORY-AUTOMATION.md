# Dev factory loop — wiring and automation

## Kairos wake (portfolio default)

Kairos arms Hephaestus via **`scripts/ensure_hephaestus_agent.sh`** — detached
`cursor-agent` oneshot (same pattern as Argus `ensure_argus.sh`). Requires
`cursor-agent` on PATH and `CURSOR_API_KEY` (env, or load order engine
`.secrets/cursor.env` then `projects/<slug>/.secrets/cursor.env` — per-slug wins).

Bash-only `dev-loop.sh` without an agent oneshot is a **blind arm** (K13) and is
reaped — it must not block the portfolio as `ALREADY_RUNNING`.

## Manual arm (IDE watcher)

```bash
# Default: detached scheduler + Cursor watch attach contract
bash scripts/run_dev_loop.sh <slug>
# SAME TURN — background Shell with notify_on_output:
bash scripts/watch_dev_loop.sh <slug>
# Optional override: DEV_LOOP_INTERVAL_SEC=300 bash scripts/run_dev_loop.sh <slug>
```

Arm detaches the scheduler (`loop.pid` / `loop.out`). **Mandatory same turn for manual arms:** attach
`watch_dev_loop.sh` with `notify_on_output` on execute/PR patterns (see
`LOOP_WATCH_ATTACH_REQUIRED`). Without the watcher, `BACKLOG_WAKE_EXECUTE` is silent.

## Tick output

| Sentinel | Meaning |
|----------|---------|
| `BACKLOG_WAKE_EXECUTE` | Start oldest ticket **now** — drain backlog same session |
| `DEV_FACTORY_IDLE` | No tickets — wait for next tick |

**Execution-only:** backlog ticks never emit a separate inform-only `BACKLOG_WAKE` line.

## Project config

All product-specific values live in `projects/<slug>/project.yaml` + `.secrets/`.
The engine never hardcodes epic keys, git hosts, or app paths.

## Hooks

Cursor only loads **workspace-root** `.cursor/hooks.json`. When this engine lives
in a parent folder (e.g. `<workspace>/dev-agent`), install hooks at the workspace:

- `<workspace>/.cursor/hooks.json` → `.cursor/hooks/dev-factory-drain-stop.sh`
  + `dev-factory-session-start.sh` (cd into `dev-agent/`, run the TS hooks)
  + `dev-factory-after-agent-response.sh` (arms `/summarize` latch after oneshot markers)
- Engine copy: `dev-agent/.cursor/hooks.json` (used if the engine itself is the workspace)

Stop + sessionStart enforce the execute contract when
`dev-agent/.cursor/dev-factory-pending-execute.json` is pending. They **must not**
require `DEV_AGENT_SLUG` — slug comes from the latch, then
`git.ticket_key_pattern` match against `projects/*/project.yaml`.

`stop` only runs when a turn ends. `sessionStart` only runs on a new chat.
Neither replaces `notify_on_output`; they recover when notify is silent.

## Shell watcher policy (no monitor mode)

`notify_on_output` on loop patterns may surface agent turns titled **"Briefly inform the user…"**.
**Always execute** `BACKLOG_WAKE_EXECUTE` in that turn — see `SHELL_WATCHER_AGENT_MUST_EXECUTE`
in `lib/devFactoryExecution.ts`. Status-only summaries are forbidden.

## Tests

```bash
bash tests/run_tests.sh
bash scripts/portability_check.sh      # after git init
bash scripts/projects_isolation_check.sh
npx tsx scripts/validate_execution_only_policy.ts   # execution-only tick guard
npx tsx scripts/lint_secrets_env.ts projects/<slug>/.secrets/jira.env
npm test
```

`validate_execution_only_policy.ts` scans engine source for inform-only `BACKLOG_WAKE` regressions (removed formatter, watcher patterns, arm script, tick emit path).

## Teams tick notifications (optional)

When `DEV_FACTORY_TEAMS_WEBHOOK_URL` is set in `projects/<slug>/.secrets/jira.env`,
each `dev_factory_tick.sh` run POSTs an Adaptive Card summary to Power Automate:

- **Backlog wake** — pick ticket key + summary, backlog count, next loop wake (UTC)
- **Idle** — explicit no-work message + next wake time

Tick stdout (`BACKLOG_WAKE_EXECUTE` / `DEV_FACTORY_IDLE`) is unchanged by notification state.

### Configured delivery is never silent

`postDevFactoryTickNotify()` returns a structured `TickNotifyOutcome`:

| Outcome | Reported? |
|---------|-----------|
| `delivered` | — |
| `not_configured` (variable unset — Teams is optional) | No, quiet by design |
| `invalid_webhook_url` (set but malformed / truncated) | **`TICK_NOTIFY_FAILED`** |
| `http_error` (non-2xx, includes status + body) | **`TICK_NOTIFY_FAILED`** |
| `exception` (network/DNS) | **`TICK_NOTIFY_FAILED`** |

Once a webhook **is** configured, a failure can never pass silently. Use
`shouldReportTickNotifyOutcome()` to make that distinction.

Verify delivery directly instead of waiting for a tick:

```bash
bash scripts/test_tick_notify.sh <slug>          # sends a wake card
bash scripts/test_tick_notify.sh <slug> --idle   # sends an idle card
# TICK_NOTIFY_SMOKE_OK {"slug":"…","status":202} on success
```

**Quote the webhook URL.** Power Automate URLs contain `&`. An unquoted value in
`.secrets/jira.env` is split by the shell, so the variable arrives **empty** and
notifications vanish with no error:

```bash
# WRONG — truncated to empty, fails silently
DEV_FACTORY_TEAMS_WEBHOOK_URL=https://prod-1.westus.logic.azure.com/...?api-version=2016-06-01&sig=abc

# RIGHT
DEV_FACTORY_TEAMS_WEBHOOK_URL="https://prod-1.westus.logic.azure.com/...?api-version=2016-06-01&sig=abc"
```

Guards against this class:

| Guard | Behavior |
|-------|----------|
| `scripts/source_project_secrets.sh` | Parses values without shell eval, so `&` can't truncate; warns `SECRETS_ENV_UNSAFE` |
| `scripts/lint_secrets_env.ts` | Exit 1 on unquoted metacharacter values |
| `checkWebhookUrl()` | Rejects relative / non-https / missing `sig` (truncation); unset → `not_configured` |
| `setup_verify.sh` | Fails on bad quoting **and** on `TICK_NOTIFY_FAILED` (not on an unset webhook) |
| `tests/run_tests.sh` | Lints every `projects/*/.secrets/*.env` |

The loop passes the next wake epoch via `DEV_FACTORY_NEXT_WAKE_EPOCH` before each tick
(see `scripts/dev-loop.sh`). Standalone tick runs omit next-wake when env is unset.

Example (project secrets — never commit the real URL):

```bash
# projects/<slug>/.secrets/jira.env
DEV_FACTORY_TEAMS_WEBHOOK_URL=https://....powerplatform.com/.../invoke?api-version=1&sp=...&sig=...
```
