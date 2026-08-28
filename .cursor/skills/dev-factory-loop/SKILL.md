---
name: dev-factory-loop
description: Dev factory loop — picks impl-dev tickets from Jira or GitHub Issues, runs OpenSpec → MR → merge → STG → Validate/Testing in the app repo. Separate from qa-agent qa-loop. Use on BACKLOG_WAKE_EXECUTE / DEV_FACTORY_IDLE or when user says run loop / execute loop / arm loop / drain backlog.
---

# Dev factory loop (impl-dev only)

**Not the QA loop.** QA owns Validate/Testing → Done via **qa-agent** skill `qa-loop`.
This skill covers **To Do / In Progress → Validate/Testing** for tickets labelled per
`projects/<slug>/project.yaml` → `dev_factory.pickup_label`.

## Tracker

| `tracker.provider` | Pickup | Handoff |
|--------------------|--------|---------|
| `jira` (default) | `pickup_jira_ticket.sh` | `preflight_jira_handoff.ts` → `post_jira_handoff.ts` |
| `github_issues` | `pickup_github_ticket.sh` | `post_github_handoff.ts` (QA RETURN via issue comments) |

Backlog query: Jira JQL via `buildDevFactoryJql()`, or GitHub Issues with pickup label.
Human exceptions: `projects/<slug>/docs/HUMAN-EXCEPTIONS.md`.

**First-time setup:** follow **`SETUP.md`** through `setup_verify.sh` green before arming.

## Loop mechanics

**Active factory (Cursor / user intent — coequal contract):** when the user message
matches `FACTORY_RUN_INTENT_PHRASES` (`lib/devFactoryExecution.ts`) — e.g. run/execute/arm
loop, drain backlog, active factory — **same turn** arm + watch + tick + drain. See
`.cursor/rules/dev-factory-active.mdc`. Do **not** end the turn listen-only.

**Portfolio dispatcher (Kairos):** Kairos wakes this slug via
`bash scripts/ensure_hephaestus_agent.sh <slug>` — detached **`cursor-agent` oneshot**
(same pattern as Argus `ensure_argus.sh`). The agent drains `impl-dev` and stays until
backlog idle **and** no open PR/MR (`DEV_FACTORY_IDLE`). Requires `cursor-agent` on PATH
and `CURSOR_API_KEY` (env, or load order engine `.secrets/cursor.env` then
`projects/<slug>/.secrets/cursor.env` — per-slug wins). Bash-only `dev-loop.sh`
without an agent oneshot is a **blind arm
(K13)** and is reaped — do not treat it as healthy `ALREADY_RUNNING`. Kairos reaps via
`reap_hephaestus.sh` → `stop_dev_loop.sh` (including `hephaestus-oneshot.pid`). Kairos does
**not** replace Active-factory arming when the user triggered intent phrases.

**After oneshot drain (`DEV_FACTORY_IDLE` / `LOOP_EXIT_IDLE`):** Cursor **stop hook**
auto-submits **`/summarize`** (latch via `afterAgentResponse` on those markers only —
not mid-handoff). Do not skip; do not end on a long status essay instead of summarize.

**Manual single-slug arm** (legacy forever-loop or debug):

1. **Arm:** `bash scripts/run_dev_loop.sh <slug>` (wraps **`arm_dev_loop.sh`**) —
   **detached setsid** (`projects/<slug>/factory/loop.pid` + `loop.out`).
   Slug-scoped; multiple factories can coexist. Foreground debug:
   `DEV_LOOP_FOREGROUND=1 bash scripts/arm_dev_loop.sh <slug>`
2. **Watch (Cursor) — mandatory same turn:** background Shell
   `bash scripts/watch_dev_loop.sh <slug>` with **`notify_on_output`** on
   `^(BACKLOG_WAKE_EXECUTE|MR_SESSION_MERGED_STALE_BRANCH|MR_PR_BACKUP_)`.
   Sentinel `LOOP_WATCH_ATTACH_REQUIRED` means arm is incomplete until this runs.
   Watcher may die later; scheduler keeps ticking — re-attach watch only.
   (`LOOP_HOLD_OPEN_MR*` is scheduler/Kairos-only — not a Cursor notify wake.)
3. **Tick:** `scripts/dev-loop.sh` → `dev_factory_tick.sh <slug>` → **`BACKLOG_WAKE_EXECUTE`** (execution-only) or `DEV_FACTORY_IDLE`
4. **Watch patterns:** `lib/devFactoryLoopWiring.ts` — **`notify_on_output`** required on `^BACKLOG_WAKE_EXECUTE` only (no inform-only wake)
5. **Stop / sessionStart hooks:** workspace-root `.cursor/hooks.json` (not only
   `dev-agent/.cursor/`) — auto-followup if pending execute unconsumed. Hooks
   resolve the engine from the parent workspace and do **not** need `DEV_AGENT_SLUG`.
6. **Policy guard:** `scripts/validate_execution_only_policy.ts` — CI blocks inform-only `BACKLOG_WAKE` regressions
7. **Notify smoke:** `bash scripts/test_tick_notify.sh <slug>` — prove Teams delivery after editing `.secrets/jira.env`

Scheduler-only (no watcher) ticks **silently** — tickets will not execute. Never end a turn after `LOOP_DETACHED` without attaching the watcher.

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

0. Pickup + scope comment (`pickup_jira_ticket.sh` or `pickup_github_ticket.sh`) —
   posts `### Hephaestus started`. Every later seat/sub-agent (Hermes / Athena /
   Argus / Themis / Chronos / Task) must also post `### <Seat> started` on the ticket **and**
   in chat **before** work — `bash scripts/post_agent_started.sh` / rule `dev-agent-start.mdc`
   (all factory projects, not only Pantheon).
0b. **If label `project-bootstrap`:** skill **`dev-pm-bootstrap-subagent`**. Run
   `npx tsx scripts/should_kick_bootstrap.ts <slug> --labels <labels> --ticket KEY`.
   On `BOOTSTRAP_DEMUX_YES` or `BOOTSTRAP_STRIP_YES` (both exit 0): run
   `npx tsx scripts/demux_project_bootstrap.ts <slug> KEY --labels <labels>` —
   strip pickup (`impl-dev`), wake Chronos (`ensure_chronos` / `pm-bootstrap`),
   **do not implement** this parent; continue to the next `impl-dev` ticket.
1. Branch off `app.git.default_branch` in **app repo** (`project.yaml` → `app.repo_path`)
2. OpenSpec spec-first (when enabled) — after BA gate when `ba-spec-first`
2b. **If label `ba-spec-first`:** run `should_kick_ba.ts … --ticket KEY`.
   On `BA_KICK_YES`, wake Hermes (`dev-ba-subagent`) — **do not implement**
   until the tracker has `BA_SPEC_READY` (Hermes self-critique + lint; no human approve).
3. **If label `ux-charter-first`:** run `should_kick_ux.ts … --when before-implement --ticket KEY`.
   On `UX_KICK_YES` (phase charter), wake Athena Mode B (**`dev-ux-subagent`**) — **do not implement UI**
   until the tracker has `UX_CHARTER_READY`. Then implement from the charter.
4. **Stack skills gate:** `bash scripts/verify_stack_skills.sh <slug>` (or `--install`);  
   Read all paths in `projects/<slug>/factory/stack-skills.manifest` before coding stack areas  
   (packs live only in the engine — never copy into the app)
4b. **Client hygiene gate:** `bash scripts/check_app_client_hygiene.sh <slug>` — app must not
   track skill packs / skill URLs / engine skill paths. Obey app `.cursor/rules/factory-*.mdc`
   + `code-review.mdc` (`dev-client-repo-hygiene.mdc`)
5. Implement feature behaviour
6. **UX polish when required** — `should_kick_ux.ts` (default after-implement) → Athena Mode A on the **same branch**
7. `app.gate_command` → `app.mr_push_command`
8. Merge → STG buildId → handoff (`post_jira_handoff.ts` or `post_github_handoff.ts`) → Validate/Testing
8b. **On `QA_KICK_YES`:** handoff **hard-kicks** Argus (`QA_WAKE_EXECUTE` + qa/dev pending latches).
   Wake Argus now (`dev-qa-subagent`) — do **not** rely on `arm_qa_loop` alone; then
   `npx tsx scripts/ack_argus_kick.ts`
9. Re-query backlog → next ticket or IDLE

## QA RETURN

Before handoff to Validate/Testing:

```bash
# Jira
npx tsx scripts/preflight_jira_handoff.ts <slug> <KEY>
# GitHub Issues — baked into post_github_handoff.ts (same QA RETURN comment gate)
npx tsx scripts/post_github_handoff.ts <slug> <KEY> --pr URL --stg-build SHA --main SHA
```

If blocked: fix, merge, **new** handoff — never drift-triage over qa-agent work.
See `lib/jiraCommentGate.ts` (shared comment protocol).

## Out of scope

- QA retest, Done transitions, STG sign-off — **qa-agent** only
- Standing Athena daily loop — UX is on-demand via Hephaestus kick or human charter
