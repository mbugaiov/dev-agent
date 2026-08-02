---
name: dev-mr-pipeline
description: Per-ticket dev delivery pipeline — branch, OpenSpec, local gate, MR push, pipeline wait, merge, STG verify, tracker handoff (Jira or GitHub Issues). App-specific gate commands come from projects/<slug>/project.yaml.
---

# Dev MR pipeline (per ticket)

Generic flow; **app repo** holds product code and CI. Read `projects/<slug>/project.yaml` before each ticket.

## Steps

0. **Pickup** (from `tracker.provider`):
   - **jira:** `bash scripts/pickup_jira_ticket.sh <slug> <KEY> --scope "<plan>" --points <n>` — transition, assign, estimate, scope comment (`jira.pickup`).
   - **github_issues:** `bash scripts/pickup_github_ticket.sh <slug> <KEY> --scope "<plan>"` — ensure pickup label, scope comment (no story points).
1. **Branch:** `git checkout -B <prefix>/<KEY>-<slug> origin/<default_branch>` in app repo
2. **OpenSpec:** when `app.openspec_enabled` (default) — propose/apply/archive per app repo skills. App must pass `verify_app_openspec.sh` at setup (`SETUP.md` §6). Shell/propose may precede charter.
3. **UX charter (when `ux-charter-first`):** skill **`dev-ux-subagent`**. Run
   `npx tsx scripts/should_kick_ux.ts <slug> --labels <labels> --surfaces "<surfaces>" --when before-implement --ticket <KEY>`.
   If phase `charter` / `UX_KICK_YES`: notify `--mode charter`, wake Athena Mode B, **block UI implement**
   until comment `UX_CHARTER_READY`. Then implement from that charter.
4. **Implement** feature behaviour on that branch
5. **UX polish (when required):** `npx tsx scripts/should_kick_ux.ts <slug> --labels <labels> --surfaces "<surfaces>" --diff`
   (default after-implement). If `UX_KICK_YES`, wake Athena Mode A on the **same feature branch**
   before the local gate. Do not open a UX pilot branch.
6. **Preflight + gate:** run `app.gate_command` from app repo root
7. **Push MR:** `app.mr_push_command`; arm `wait_pr_pipeline.sh` with notify_on_output
8. **Fix loop** until pipeline green + **app repo** code review clear (CR runs in app CI — not dev-agent)
9. **Merge** (squash per team policy)
10. **STG:** `wait_main_deploy.sh` + `check_stg_build.sh <slug>`
11. **Handoff:**
    - **jira:** `preflight_jira_handoff.ts` → `post_jira_handoff.ts --transition`
    - **github_issues:** `npx tsx scripts/post_github_handoff.ts <slug> <KEY> --pr URL --stg-build SHA --main SHA`
12. **Drain:** re-query backlog; start next ticket if count > 0

## Project overrides

App-specific MR workflow (OpenSpec gates, CI commands) lives in
`projects/<slug>/.cursor/rules/` — not in the engine repo.

## Forbidden

- Direct commits to default branch
- Moving feature tickets to Done
- Validate/Testing while QA RETURN unresolved
- Skipping charter when `ux-charter-first` is set and `UX_CHARTER_READY` is missing
- Implementing UI on a `ux-charter-first` ticket before `UX_CHARTER_READY`
- Skipping polish `dev-ux-subagent` when `needs-ux-pass` / `impl-ux` is on the ticket
