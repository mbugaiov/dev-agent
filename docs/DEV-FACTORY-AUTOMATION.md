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

## Tests

```bash
bash tests/run_tests.sh
bash scripts/portability_check.sh      # after git init
bash scripts/projects_isolation_check.sh
```
