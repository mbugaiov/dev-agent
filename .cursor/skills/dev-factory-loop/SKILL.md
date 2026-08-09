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

**Active factory:** User phrases in `FACTORY_RUN_INTENT_PHRASES` (`lib/devFactoryExecution.ts`)
→ arm + tick + drain in **same turn**. See `.cursor/rules/dev-factory-active.mdc`.

1. **Arm:** `bash scripts/arm_dev_loop.sh <slug>` — **detached** by default: scheduler in a new
   session (`start_new_session`) → `projects/<slug>/factory/loop.{pid,out}`, then `exec`
   **`watch_dev_loop.sh`** so the Cursor Shell is only the log tailer. Slug-scoped; multiple
   factories coexist. Use `--foreground` only for debug (scheduler dies if Cursor aborts the Shell).
2. **Tick:** detached `dev-loop.sh` → `dev_factory_tick.sh <slug>` → **`BACKLOG_WAKE_EXECUTE`**
   (execution-only) or `DEV_FACTORY_IDLE` (**log-only** — do not `notify_on_output` IDLE)
3. **Watch patterns:** `AGENT_NOTIFY_WATCH_PATTERN` in `lib/devFactoryLoopWiring.ts` —
   **`notify_on_output`** on `^(BACKLOG_WAKE_EXECUTE|MR_SESSION_MERGED_STALE_BRANCH|MR_PR_BACKUP_)`
   only (no `LOOP_ARMED` / `DEV_FACTORY_IDLE` — those cause status-only “Briefly inform…” turns)
4. **Watcher abort:** If Cursor aborts the watcher Shell, re-run `arm_dev_loop.sh` (idempotent).
   Check `loop.pid` — the detached scheduler keeps ticking; do not assume the factory died.
5. **Stop hook:** `.cursor/hooks.json` — auto-followup if pending execute unconsumed
6. **Policy guard:** `scripts/validate_execution_only_policy.ts` — CI blocks inform-only `BACKLOG_WAKE` regressions
7. **Notify smoke:** `bash scripts/test_tick_notify.sh <slug>` — prove Teams delivery after editing `.secrets/jira.env`

A detached scheduler without a watcher still ticks **silently** (log + optional Teams) but will not wake the agent.

## Tick policy (execution-only)

| Signal | Action |
|--------|--------|
| `BACKLOG_WAKE_EXECUTE` | Start oldest ticket **now** — branch + OpenSpec + implement; drain queue same session |
| `DEV_FACTORY_IDLE` | Log-only — wait for next tick; do **not** answer with a status-only “Briefly inform” turn |

There is **no** separate `BACKLOG_WAKE` inform line — every backlog tick is an execute contract.
Status-only replies on execute wakes are forbidden. Do not stop after one ticket — drain until `DEV_FACTORY_IDLE`.
Policy: one open MR at a time; many tickets per tick when backlog exists.

## Per-ticket flow

Follow skill **`dev-mr-pipeline`** (project overrides in `projects/<slug>/` if present):

0. Pickup + scope comment (`pickup_jira_ticket.sh` or `pickup_github_ticket.sh`) —
   posts `### Hephaestus started`. Every later seat/sub-agent (Hermes / Athena /
   Argus / Task) must also post `### <Seat> started` on the ticket **and** in chat
   before work (Pantheon `FACTORY.md` → Agent start).
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
   track skills, skill URLs, factory rules, or engine skill paths (`dev-client-repo-hygiene.mdc`)
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
