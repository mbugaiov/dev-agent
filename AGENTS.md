# Hephaestus — Dev engine (`dev-agent`)

**Hephaestus** is the product name for this repository and engine. The agent runs **Jira-backed
dev factory loops**: pick `impl-dev` tickets, implement spec-first in the **app repo**, ship via
MR, verify STG buildId, hand off to **Validate/Testing** for the QA agent. One project = one app
factory; one tick = one backlog drain attempt.

> **Naming map:** Hephaestus (brand) ≡ `dev-agent` repo ≡ factory `agent=dev`. Pantheon siblings
> live elsewhere: Argus (QA) in `qa-agent`, Themis (review) in the app repo — not renamed here.
> Internal paths, skills, and scripts keep the `dev-*` prefix. Presentation: *Hephaestus · Dev*.

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
| Wake Athena UX subagent on the feature branch | `dev-ux-subagent` |
| Wake Hermes BA subagent before implement (`ba-spec-first`) | `dev-ba-subagent` |
| Wake Argus QA after Validate/Testing handoff | `dev-qa-subagent` |
| Jira transitions, handoff comments, QA RETURN gates | `dev-jira` |
| Phase checklist (spec-first, test gate, archive) | `dev-phases` |
| **Engine PR code review** (before merge on dev-agent repo) | `dev-code-review` |

## Skills this engine orchestrates

| Phase | Skill / tool | Location |
|---|---|---|
| Stack packs (.NET/Angular/…) | `sync_stack_skills` / `verify_stack_skills` | **engine** `.agents/skills` + manifest |
| Project overrides | `projects/<slug>/.cursor/skills` | engine project folder (gitignored) |
| Spec-first changes | `openspec-*` skills | **app** `.cursor/skills/openspec-*` (allowed) or host — not our stack packs |
| Local test gate | `project.yaml` → `app.gate_command` | app repo (product scripts only) |
| MR push | `app.mr_push_command` | app repo |

**Never** put skills, skill URLs, or factory rules in customer app repos — `dev-client-repo-hygiene.mdc`.

## The loop (every factory session)

> `<slug>` = project slug (`projects/<slug>/`). Read `project.yaml` + `project-memory.md` first.

```
0. Config     → projects/<slug>/project.yaml + .secrets/
1. Arm        → bash scripts/arm_dev_loop.sh <slug> (notify_on_output on watch patterns)
2. Tick       → dev_factory_tick → **BACKLOG_WAKE_EXECUTE only** (execution-only) or DEV_FACTORY_IDLE
3. Pick       → oldest impl-dev ticket (respect QA follow-on routing)
4. Pickup     → pickup_jira_ticket.sh or pickup_github_ticket.sh → branch; OpenSpec;
                **if ux-charter-first: Athena Mode B until UX_CHARTER_READY**;
                implement; **UX polish if should_kick_ux** (same branch); app gate command
5. Ship       → mr:push → wait_pr_pipeline → merge
6. STG        → wait_main_deploy + check_stg_build (buildId gate).
               GitHub: bot merge via GITHUB_TOKEN does not fire push deploys —
               app CI must workflow_dispatch Deploy STG after bot merge;
               wait_main_deploy may self-dispatch once if the run is missing.
7. Handoff    → preflight → post_*_handoff → Validate/Testing → **on `QA_KICK_YES` + `QA_WAKE_EXECUTE`: wake Argus (`dev-qa-subagent`) + `ack_argus_kick.ts`**
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
- **Spec-first** — OpenSpec change before non-trivial behavior edits. App MUST have OpenSpec installed (`@fission-ai/openspec`, `openspec/specs`, skills) — verified by `verify_app_openspec.sh` in `setup_verify.sh` (see **`SETUP.md` §6**).
- **STG buildId gate** — no Validate/Testing handoff until STG matches merge commit.
- **Per-project isolation** — only `projects/<slug>/.secrets/*` for that slug.
- **Engine purity** — no epic keys, product names, or app paths in engine files; config in `project.yaml`. Review: **`ENGINE-REVIEW.md`** + `scripts/portability_check.sh`.
- **Dual-repo delivery** — engine + app pointer/rule changes merge **both** repos same session (GitHub + Bitbucket); see `dev-engine.mdc`.
- **Execution-only ticks** — backlog ticks emit `BACKLOG_WAKE_EXECUTE` only; enforced by `lib/devFactoryExecutionOnly.ts` + `scripts/validate_execution_only_policy.ts` (runs in `tests/run_tests.sh`).
- **No silent notify** — once a tick webhook is configured, failures print `TICK_NOTIFY_FAILED` (reason + status); an unset webhook stays quiet (optional feature). Secrets values must be quoted; `scripts/lint_secrets_env.ts` enforces it (unquoted `&` truncates a webhook URL to empty).
- **Teams card identity** — Hephaestus / Dev Adaptive Cards use title colour `Accent` (Athena=`Good`, Argus=`Warning`). Keep the three colours distinct.

## Engine delivery (GitHub)

```
git fetch origin && git switch -c <type>/<slug> origin/main
# … edit, bash tests/run_tests.sh, bash scripts/pre_merge_check.sh
git push -u origin HEAD
gh pr create …
# Engine GitHub PR: bash scripts/wait_github_pr_pipeline.sh <PR>
# Suggestions/Risks: fix in PR or bash scripts/file_review_followups.sh <PR> --from-comment
# Auto-merge only after follow-ups disposed (themis-agent FOLLOWUPS).
# If wait fails on followups_undisposed: dispose then re-run wait_github_pr_pipeline.sh
# (REQUIRED checks are listed in that script — add new gates there explicitly).
```

**Forbidden:** `git push origin main`, `git push --force`, merging locally then pushing main.

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
**Never push to `main`** — feature branch + PR only (GitHub ruleset + `.githooks/pre-push`).
Product MR code review runs in the **app repo** — not in dev-agent.
