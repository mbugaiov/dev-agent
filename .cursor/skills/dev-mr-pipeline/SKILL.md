---
name: dev-mr-pipeline
description: Per-ticket dev delivery pipeline — branch, OpenSpec, local gate, MR push, pipeline wait, merge, STG verify, Jira handoff. App-specific gate commands come from projects/<slug>/project.yaml.
---

# Dev MR pipeline (per ticket)

Generic flow; **app repo** holds product code and CI. Read `projects/<slug>/project.yaml` before each ticket.

## Steps

0. **Jira pickup:** `bash scripts/pickup_jira_ticket.sh <slug> <KEY> --scope "<plan>" --points <n>` — transition, assign, estimate (empty fields only), scope comment. Config: `project.yaml` → `jira.pickup`.
1. **Branch:** `git checkout -B <prefix>/<KEY>-<slug> origin/<default_branch>` in app repo
2. **OpenSpec:** when `app.openspec_enabled` (default) — propose/apply/archive per app repo skills. App must pass `verify_app_openspec.sh` at setup (`SETUP.md` §6).
3. **Implement** feature behaviour on that branch
4. **UX subagent (when required):** read skill **`dev-ux-subagent`**. Run
   `npx tsx scripts/should_kick_ux.ts <slug> --labels <ticket-labels> --surfaces "<primary surfaces>" --diff`.
   If `UX_KICK_YES`, wake Athena via **Task** (`generalPurpose`) on the **same feature branch**
   before the local gate. Do not open a UX pilot branch.
5. **Preflight + gate:** run `app.gate_command` from app repo root
6. **Push MR:** `app.mr_push_command`; arm `wait_pr_pipeline.sh` with notify_on_output
7. **Fix loop** until pipeline green + **app repo** code review clear (CR runs in app CI — not dev-agent)
8. **Merge** (squash per team policy)
9. **STG:** `wait_main_deploy.sh` + `check_stg_build.sh <slug>`
10. **Handoff:** `preflight_jira_handoff.ts` → `post_jira_handoff.ts --transition`
11. **Drain:** re-query backlog; start next ticket if count > 0

## Project overrides

App-specific MR workflow (OpenSpec gates, CI commands) lives in
`projects/<slug>/.cursor/rules/` — not in the engine repo.

## Forbidden

- Direct commits to default branch
- Moving feature tickets to Done
- Validate/Testing while QA RETURN unresolved
- Skipping `dev-ux-subagent` when `needs-ux-pass` / `impl-ux` is on the ticket
