# Dev Agent — spec-driven delivery factory

The agent runs **Jira-backed dev factory loops**: pick `impl-dev` tickets, implement spec-first
in the **app repo**, ship via MR, verify STG buildId, hand off to **Validate/Testing** for the
QA agent. One project = one app factory; one tick = one backlog drain attempt.

> Operating role: follow `.cursor/rules/dev-engine.mdc` and `.cursor/rules/dev-factory-active.mdc`.
> **First-time project setup:** **`SETUP.md`** (agent runbook — execute top to bottom).
> **Layer model:** **`ARCHITECTURE.md`** (engine vs project vs app — integration by reference).
> Procedural detail lives in **skills** under `.cursor/skills/`. See **`PORTABILITY.md`** for
> engine vs projects split. QA closure is **`qa-agent`** — do not move feature tickets to Done.

## Skills (read on demand)

| When you're doing… | Skill |
|---|---|
| Backlog drain, loop arm, tick policy | `dev-factory-loop` |
| Per-ticket flow (branch → OpenSpec → gate → MR → merge → handoff) | `dev-mr-pipeline` |
| Jira transitions, handoff comments, QA RETURN gates | `dev-jira` |
| Phase checklist (spec-first, test gate, archive) | `dev-phases` |
| **Engine PR code review** (before merge on dev-agent repo) | `dev-code-review` |

## Skills this engine orchestrates (host / app repo)

| Phase | Skill / tool | Location |
|---|---|---|
| Spec-first changes | `openspec-propose`, `openspec-apply`, … | app repo `.cursor/skills/` or host |
| Local test gate | `project.yaml` → `app.gate_command` | app repo (from project config) |
| MR push | `app.mr_push_command` | app repo |

## The loop (every factory session)

> `<slug>` = project slug (`projects/<slug>/`). Read `project.yaml` + `project-memory.md` first.

```
0. Config     → projects/<slug>/project.yaml + .secrets/
1. Arm        → bash scripts/arm_dev_loop.sh <slug> (notify_on_output on watch patterns)
2. Tick       → dev_factory_tick → BACKLOG_WAKE_EXECUTE or DEV_FACTORY_IDLE
3. Pick       → oldest impl-dev ticket (respect QA follow-on routing)
4. Implement  → cd app.repo_path; branch; OpenSpec; code; app gate command
5. Ship       → mr:push → wait_pr_pipeline → merge
6. STG        → wait_main_deploy + check_stg_build (buildId gate)
7. Handoff    → preflight_jira_handoff (block on QA RETURN) → post_jira_handoff → Validate/Testing
8. Drain      → re-run JQL; next ticket same session until DEV_FACTORY_IDLE
```

For **active factory** (user says run/execute/arm loop — see `FACTORY_RUN_INTENT_PHRASES` in
`lib/devFactoryExecution.ts`), status-only replies are forbidden. Drain **many tickets**
per session; **re-run** dev factory JQL after each handoff and start the **next ticket**
immediately.

## Hard rules

- **One open MR at a time** — finish current PR before starting another ticket.
- **Drain backlog per session** — do not stop after one handoff while JQL returns tickets.
- **Never Done** on feature work — QA agent owns Validate/Testing → Done.
- **Respect QA RETURN** — `lib/jiraCommentGate.ts`; run `preflight_jira_handoff.ts` before every handoff.
- **Spec-first** — OpenSpec change before non-trivial behavior edits (app repo convention).
- **STG buildId gate** — no Validate/Testing handoff until STG matches merge commit.
- **Per-project isolation** — only `projects/<slug>/.secrets/*` for that slug.
- **Engine purity** — no epic keys, product names, or app paths in engine files; config in `project.yaml`. Review: **`ENGINE-REVIEW.md`** + `scripts/portability_check.sh`.

## Output layout

```
dev-agent/                    ← ENGINE (this repo)
  projects/
    _template/
    <slug>/                   ← per-app factory config + DoD docs
<app-repo>/                   ← product code + OpenSpec + CI (separate git root)
```

After changing engine `lib/`, `scripts/`, rules, or skills: `bash tests/run_tests.sh`.
Before engine PR: `bash scripts/pre_merge_check.sh` (includes portability + CR fixtures).
Product MR code review runs in the **app repo** — not in dev-agent.
