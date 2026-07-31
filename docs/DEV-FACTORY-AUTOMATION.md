# Dev factory loop — wiring and automation

## Arm the loop

```bash
DEV_LOOP_INTERVAL_SEC=300 bash scripts/arm_dev_loop.sh <slug>
```

Launch in a background Cursor Shell with `notify_on_output` on watch patterns from
`lib/devFactoryLoopWiring.ts` (see `LOOP_ARMED` JSON output).

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

`.cursor/hooks.json` registers stop + sessionStart hooks that enforce the execute
contract when `.cursor/dev-factory-pending-execute.json` is pending.

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

### Delivery is never silent

`postDevFactoryTickNotify()` returns a structured `TickNotifyOutcome`, and any
non-delivery prints a loud `TICK_NOTIFY_FAILED` line on **stderr** with reason,
HTTP status, and remediation. Reasons: `invalid_webhook_url`, `http_error`,
`exception`.

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
| `checkWebhookUrl()` | Rejects empty / relative / non-https / missing `sig` (truncation) |
| `setup_verify.sh` | Fails on bad quoting **and** on `TICK_NOTIFY_FAILED` |
| `tests/run_tests.sh` | Lints every `projects/*/.secrets/*.env` |

The loop passes the next wake epoch via `DEV_FACTORY_NEXT_WAKE_EPOCH` before each tick
(see `scripts/dev-loop.sh`). Standalone tick runs omit next-wake when env is unset.

Example (project secrets — never commit the real URL):

```bash
# projects/<slug>/.secrets/jira.env
DEV_FACTORY_TEAMS_WEBHOOK_URL=https://....powerplatform.com/.../invoke?api-version=1&sp=...&sig=...
```
