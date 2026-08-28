---
name: dev-mr-pipeline
description: Per-ticket dev delivery pipeline — branch, OpenSpec, local gate, MR push, pipeline wait, merge, STG verify, tracker handoff (Jira or GitHub Issues). App-specific gate commands come from projects/<slug>/project.yaml.
---

# Dev MR pipeline (per ticket)

Generic flow; **app repo** holds product code and CI. Read `projects/<slug>/project.yaml` before each ticket.

## Steps

0. **Agent start (mandatory on every seat switch):** before work, chat + tracker
   `### <Seat> started` — helper `bash scripts/post_agent_started.sh <slug> <N|pr:N> <Seat> "<Mode>" "<Doing>"`
   (rule `dev-agent-start.mdc`). Pickup scripts post Hephaestus; Hermes/Athena/Argus/Themis
   must post their own banner as soon as they take the ticket or PR.
0c. **Mid-flight progress (mandatory while oneshot is mid-ticket):** keep the ticket
   from looking idle. Living `### <Seat> progress` via
   `bash scripts/post_agent_progress.sh <slug> <KEY|N> Hephaestus <milestone> "<Detail>"`.
   Milestones: `mr_opened` | `pipeline_waiting` | `pipeline_failed` | `pipeline_retry` |
   `pipeline_green` | `stg_verify` | `handoff`.
   Pickup writes `projects/<slug>/factory/progress-ticket.key`; `wait_pr_pipeline.sh <slug>`
   auto-posts waiting/failed/green when the latch exists. Engine
   `wait_github_pr_pipeline.sh` needs `DEV_PROGRESS_TICKET` (+ `DEV_PROGRESS_SLUG` when
   the GitHub repo name ≠ factory slug). Still post explicitly on MR open / retry /
   STG / handoff. Dedup skips identical status+detail (no poll spam).
0b. **Pickup** (from `tracker.provider`):
   - **jira:** `bash scripts/pickup_jira_ticket.sh <slug> <KEY> --scope "<plan>" --points <n>` — transition, assign, estimate, scope comment (`jira.pickup`).
   - **github_issues:** `bash scripts/pickup_github_ticket.sh <slug> <KEY> --scope "<plan>"` — ensure pickup label, scope comment (no story points).
0d. **Bootstrap demux (when `project-bootstrap`):** skill **`dev-pm-bootstrap-subagent`**.
   `npx tsx scripts/should_kick_bootstrap.ts <slug> --labels <labels> --ticket <KEY>`.
   If `BOOTSTRAP_DEMUX_YES` or `BOOTSTRAP_STRIP_YES`:
   `npx tsx scripts/demux_project_bootstrap.ts <slug> <KEY> --labels <labels>` —
   strip `impl-dev`, wake Chronos (`pm-agent` `ensure_chronos.sh` / `pm-bootstrap`),
   **stop this ticket** (no OpenSpec/implement on the parent). Continue backlog drain.
1. **Branch:** `git checkout -B <prefix>/<KEY>-<slug> origin/<default_branch>` in app repo
2. **OpenSpec:** when `app.openspec_enabled` (default) — propose/apply/archive per app repo skills. App must pass `verify_app_openspec.sh` at setup (`SETUP.md` §6). Shell/propose may precede charter **after** BA gate when `ba-spec-first`.
2b. **BA spec (when `ba-spec-first`):** skill **`dev-ba-subagent`**. Run
   `npx tsx scripts/should_kick_ba.ts <slug> --labels <labels> --ticket <KEY>`.
   If `BA_KICK_YES`: wake Hermes (`ba-agent` / `ba-loop`) — **block implement** until
   comment `BA_SPEC_READY`. No human approval — Hermes self-critique + lint is the gate.
   Then continue OpenSpec from published change artifacts.
3. **UX charter (when `ux-charter-first`):** skill **`dev-ux-subagent`**. Run
   `npx tsx scripts/should_kick_ux.ts <slug> --labels <labels> --surfaces "<surfaces>" --when before-implement --ticket <KEY>`.
   If phase `charter` / `UX_KICK_YES`: notify `--mode charter`, wake Athena Mode B, **block UI implement**
   until comment `UX_CHARTER_READY`. Then implement from that charter.
3b. **Stack skills (MUST before implement):**  
    `bash scripts/verify_stack_skills.sh <slug>`  
    On fail: `bash scripts/verify_stack_skills.sh <slug> --install`.  
    Then **Read every** `SKILL.md` listed in `projects/<slug>/factory/stack-skills.manifest`  
    and apply them for stack work (.NET / Angular / Ionic / MSSQL / Supabase).  
    Do not implement those areas without Reading the matched skills. Rule: `dev-stack-skills.mdc`.  
    Skills stay in the engine — never vendor packs or skill URLs into the app.
3c. **Client hygiene (MUST):** `bash scripts/check_app_client_hygiene.sh <slug>`  
    Fail if the app tracks skill packs, skill URLs/docs, or engine skill paths.  
    **Allowed in app:** product process rules (`.cursor/rules/factory-*.mdc`, `code-review.mdc`),
    `docs/CODE_STANDARDS.md`, `openspec-*` skills. Obey those rules while implementing.  
    Rule: `dev-client-repo-hygiene.mdc` (all factory projects).
4. **Implement** feature behaviour on that branch
5. **UX polish (when required):** `npx tsx scripts/should_kick_ux.ts <slug> --labels <labels> --surfaces "<surfaces>" --diff`
   (default after-implement). If `UX_KICK_YES`, wake Athena Mode A on the **same feature branch**
   before the local gate. Do not open a UX pilot branch.
6. **Preflight + gate:** run `app.gate_command` from app repo root
7. **Push MR:** `app.mr_push_command`
7b. **Wait pipeline (oneshot-critical — hard contract):**
    Do **not** `Await` / `notify_on_output` on `PIPELINE_*` / `PR_PIPELINE_*` regex
    (cursor-agent has missed `PR_PIPELINE_FAILED` while the waiter already exited).
    Use engine chunk loop only:

    ```bash
    # from dev-agent root; block_until_ms >= max-sec + 30 (e.g. 120000)
    while true; do
      bash scripts/follow_pr_pipeline_chunk.sh "$SLUG" "$PR" --max-sec 75 --poll 15
      ec=$?
      [[ $ec -eq 0 ]] && break   # PR_PIPELINE_GREEN → merge
      [[ $ec -eq 1 ]] && break   # PR_PIPELINE_FAILED → fix Themis / push / loop again
      [[ $ec -eq 3 ]] && continue  # PR_PIPELINE_PENDING → re-invoke
      break
    done
    ```

    Writes `projects/<slug>/factory/pr-pipeline.result.json`. Kairos K14 reaps
    oneshots that stay silent after a **failed** latch (`pr_pipeline_failed_unattended`).
    Prefer this over raw app `wait_pr_pipeline.sh` + Await. Engine
    `bash scripts/wait_pr_pipeline.sh <slug> <PR>` still OK if you poll its
    **process exit** the same way (chunk preferred).
8. **Fix loop** until pipeline green + **app repo** code review clear (CR runs in app CI — not dev-agent)
9. **Merge** (squash per team policy)
10. **STG:** `wait_main_deploy.sh` + `check_stg_build.sh <slug>`
    - **GitHub Actions footgun:** merges performed with `GITHUB_TOKEN` (app
      `auto-merge` job / `gh pr merge` in Actions) **do not** trigger `push`
      workflows. If the app deploys STG on `push` to `main`, CI **must**
      `workflow_dispatch` Deploy STG after bot merge (see that app’s deploy
      docs / `projects/<slug>` overrides). `wait_main_deploy` may also
      self-dispatch once when no run exists for HEAD — do **not** hand off
      on a stale STG `buildId`.
11. **Handoff:**
    - **jira:** `preflight_jira_handoff.ts` → `post_jira_handoff.ts --transition`
    - **github_issues:** `npx tsx scripts/post_github_handoff.ts <slug> <KEY> --pr URL --stg-build SHA --main SHA`
      **Forbidden in PR body:** `Closes #N` / `Fixes #N` before Argus PASS — merge would
      auto-close the issue and drop it out of `validate-testing`. Use `Related: #N`.
11b. **Argus kick (mandatory):** handoff prints `QA_KICK_YES` + `QA_WAKE_EXECUTE`,
     writes qa/dev pending latches → skill **`dev-qa-subagent`** (Task Argus) →
     `npx tsx scripts/ack_argus_kick.ts`
    (Cursor Task into `qa-agent`, `BACKLOG_WAKE_EXECUTE` / drain `qa_scope`). Do **not** wait
    for `arm_qa_loop` timer — same pattern as Hermes/Athena kicks.
12. **Drain:** re-query backlog; start next ticket if count > 0

## Project overrides

App-specific MR workflow (OpenSpec gates, CI commands) lives in
`projects/<slug>/.cursor/rules/` — not in the engine repo.

## Forbidden

- Direct commits to default branch
- Moving feature tickets to Done
- Validate/Testing while QA RETURN unresolved
- Skipping BA when `ba-spec-first` is set and `BA_SPEC_READY` is missing
- Implementing on a `ba-spec-first` ticket before `BA_SPEC_READY`
- Skipping charter when `ux-charter-first` is set and `UX_CHARTER_READY` is missing
- Implementing UI on a `ux-charter-first` ticket before `UX_CHARTER_READY`
- Skipping polish `dev-ux-subagent` when `needs-ux-pass` / `impl-ux` is on the ticket
- Waiting for human BA sign-off (Hermes lint + skeptical review is the gate)
- Implementing a `project-bootstrap` parent instead of running `demux_project_bootstrap.ts`
- Ending handoff without waking Argus (`dev-qa-subagent`) when `QA_KICK_YES` is printed
- Waiting on PR via Await/notify regex alone (`PIPELINE_*` / `PR_PIPELINE_*`) — use
  `follow_pr_pipeline_chunk.sh` exit codes (0/1/3) instead
