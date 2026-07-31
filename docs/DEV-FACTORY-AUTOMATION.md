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
| `BACKLOG_WAKE_EXECUTE` | Start oldest ticket **now** |
| `BACKLOG_WAKE` | Drain backlog in this session |
| `DEV_FACTORY_IDLE` | No tickets — wait for next tick |

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
npm test
```

## Teams tick notifications (optional)

When `DEV_FACTORY_TEAMS_WEBHOOK_URL` is set in `projects/<slug>/.secrets/jira.env`,
each `dev_factory_tick.sh` run POSTs an Adaptive Card summary to Power Automate:

- **Backlog wake** — pick ticket key + summary, backlog count, next loop wake (UTC)
- **Idle** — explicit no-work message + next wake time

Unset URL skips the POST; tick stdout (`BACKLOG_WAKE` / `DEV_FACTORY_IDLE`) is unchanged.

The loop passes the next wake epoch via `DEV_FACTORY_NEXT_WAKE_EPOCH` before each tick
(see `scripts/dev-loop.sh`). Standalone tick runs omit next-wake when env is unset.

Example (project secrets — never commit the real URL):

```bash
# projects/<slug>/.secrets/jira.env
DEV_FACTORY_TEAMS_WEBHOOK_URL=https://....powerplatform.com/.../invoke?api-version=1&sp=...&sig=...
```
