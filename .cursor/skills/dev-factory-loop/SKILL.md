---
name: dev-factory-loop
description: Dev factory loop — picks impl-dev tickets from Jira, runs OpenSpec → MR → merge → STG → Validate/Testing in the app repo. Separate from qa-agent qa-loop. Use on BACKLOG_WAKE_EXECUTE / DEV_FACTORY_IDLE or when user says run loop / execute loop / arm loop / drain backlog.
---

# Dev factory loop (impl-dev only)

**Not the QA loop.** QA owns Validate/Testing → Done via **qa-agent** skill `qa-loop`.
This skill covers **To Do / In Progress → Validate/Testing** for tickets labelled per
`projects/<slug>/project.yaml` → `dev_factory.pickup_label`.

## JQL

Built at runtime: `buildDevFactoryJql()` in `lib/projectConfig.ts` from project config.
Human exceptions: `projects/<slug>/docs/HUMAN-EXCEPTIONS.md`.

**First-time setup:** follow **`SETUP.md`** through `setup_verify.sh` green before arming.

## Loop mechanics

**Active factory:** User phrases in `FACTORY_RUN_INTENT_PHRASES` (`lib/devFactoryExecution.ts`)
→ arm + tick + drain in **same turn**. See `.cursor/rules/dev-factory-active.mdc`.

1. **Arm:** `bash scripts/arm_dev_loop.sh <slug>`
2. **Tick:** `scripts/dev-loop.sh` → `dev_factory_tick.sh <slug>` → **`BACKLOG_WAKE_EXECUTE`** (execution-only) or `DEV_FACTORY_IDLE`
3. **Watch patterns:** `lib/devFactoryLoopWiring.ts` — **`notify_on_output`** required on `^BACKLOG_WAKE_EXECUTE` only (no inform-only wake)
4. **Stop hook:** `.cursor/hooks.json` — auto-followup if pending execute unconsumed
5. **Policy guard:** `scripts/validate_execution_only_policy.ts` — CI blocks inform-only `BACKLOG_WAKE` regressions
6. **Notify smoke:** `bash scripts/test_tick_notify.sh <slug>` — prove Teams delivery after editing `.secrets/jira.env`

A plain background loop ticks **silently** without watchers.

## Tick policy (execution-only)

| Signal | Action |
|--------|--------|
| `BACKLOG_WAKE_EXECUTE` | Start oldest ticket **now** — branch + OpenSpec + implement; drain queue same session |
| `DEV_FACTORY_IDLE` | Wait for next tick |

There is **no** separate `BACKLOG_WAKE` inform line — every backlog tick is an execute contract.
Status-only replies on execute wakes are forbidden. Do not stop after one ticket — drain until `DEV_FACTORY_IDLE`.
Policy: one open MR at a time; many tickets per tick when backlog exists.

## Per-ticket flow

Follow skill **`dev-mr-pipeline`** (project overrides in `projects/<slug>/` if present):

0. In Progress + scope comment
1. Branch off `app.git.default_branch` in **app repo** (`project.yaml` → `app.repo_path`)
2. OpenSpec spec-first (when enabled)
3. `app.gate_command` → `app.mr_push_command`
4. Merge → STG buildId → `preflight_jira_handoff.ts` → `post_jira_handoff.ts` → Validate/Testing
5. Re-run JQL → next ticket

## QA RETURN

Before any Validate/Testing transition:

```bash
npx tsx scripts/preflight_jira_handoff.ts <slug> <KEY>
```

If blocked: fix, merge, **new** handoff — never drift-triage over qa-agent work.
See `lib/jiraCommentGate.ts`.

## Out of scope

- QA retest, Done transitions, STG sign-off — **qa-agent** only
