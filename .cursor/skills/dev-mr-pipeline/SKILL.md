---
name: dev-mr-pipeline
description: Per-ticket dev delivery pipeline — branch, OpenSpec, local gate, MR push, pipeline wait, merge, STG verify, Jira handoff. App-specific gate commands come from projects/<slug>/project.yaml.
---

# Dev MR pipeline (per ticket)

Generic flow; **app repo** holds product code and CI. Read `projects/<slug>/project.yaml` before each ticket.

## Steps

0. **Jira:** transition To Do → In Progress; assign; story points; scope comment
1. **Branch:** `git checkout -B <prefix>/<KEY>-<slug> origin/<default_branch>` in app repo
2. **OpenSpec:** when `app.openspec_enabled` — propose/apply/archive per app repo skills
3. **Preflight + gate:** run `app.gate_command` from app repo root
4. **Push MR:** `app.mr_push_command`; arm `wait_pr_pipeline.sh` with notify_on_output
5. **Fix loop** until pipeline green + **app repo** code review clear (CR runs in app CI — not dev-agent)
6. **Merge** (squash per team policy)
7. **STG:** `wait_main_deploy.sh` + `check_stg_build.sh <slug>`
8. **Handoff:** `preflight_jira_handoff.ts` → `post_jira_handoff.ts --transition`
9. **Drain:** re-query backlog; start next ticket if count > 0

## Project overrides

App-specific MR workflow (OpenSpec gates, CI commands) lives in
`projects/<slug>/.cursor/rules/` — not in the engine repo.

## Forbidden

- Direct commits to default branch
- Moving feature tickets to Done
- Validate/Testing while QA RETURN unresolved
