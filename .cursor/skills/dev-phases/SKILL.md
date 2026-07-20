---
name: dev-phases
description: Spec-first phase checklist for dev-agent per-ticket work — OpenSpec, local gate, archive. Paths from projects/<slug>/project.yaml app block.
---

# Dev phases (spec-first per ticket)

Execute in the **app repo** (`project.yaml` → `app.repo_path`) unless noted.
Read `projects/<slug>/project.yaml` and `projects/<slug>/docs/DEFINITION-OF-DONE.md` first.

## Phase map

| Phase | Where | Agent action |
|-------|-------|--------------|
| **0. Pick** | dev-agent | `dev_factory_tick.sh` → oldest impl-dev ticket |
| **1. Branch** | app repo | `git fetch origin && git checkout -B <prefix>/<KEY>-<slug> origin/<default_branch>` |
| **2. Spec** | app repo | OpenSpec when `app.openspec_enabled` (see below) |
| **3. Implement** | app repo | Code + unit tests per spec |
| **4. Gate** | app repo | Run `app.gate_command` from app root — must exit 0 |
| **5. MR** | app repo | `app.mr_push_command` → `wait_pr_pipeline.sh <slug> <PR_ID>` |
| **6. Merge** | app repo | Squash merge when pipeline green + review clear |
| **7. STG** | dev-agent | `wait_main_deploy.sh <slug>` then `check_stg_build.sh <slug> <commit>` |
| **8. Handoff** | dev-agent | skill **`dev-jira`** — preflight → post → Validate/Testing |
| **9. Drain** | dev-agent | Re-run tick; next ticket same session if backlog > 0 |

## OpenSpec (when `app.openspec_enabled: true`)

Skills live in **app repo** `.cursor/skills/` (not engine):

| Step | Typical skill |
|------|---------------|
| Propose change | `openspec-propose` |
| Apply / implement | `openspec-apply-change` |
| Sync specs | `openspec-sync-specs` |
| Archive after merge | `openspec-archive-change` |

Specs directory: `app.openspec_specs_dir` (often `openspec/specs`).

**Rule:** non-trivial behavior changes need an OpenSpec change **before** code edits.

## Local gate

```bash
cd "$(npx tsx /path/to/dev-agent/scripts/resolve_app_root.ts <slug>)"
<app.gate_command from project.yaml>
```

Do not hand off if gate fails. Fix, re-run gate, update MR.

## STG verify (phase 7)

```bash
bash scripts/check_stg_build.sh <slug> <merge-commit-prefix>
```

Expect stdout containing `STG_BUILD_OK`. On `STG_BUILD_MISMATCH`, run `wait_main_deploy.sh` and retry.

## Project overrides

App-specific MR workflow (extra gates, OpenSpec policy) may live in:

`projects/<slug>/.cursor/rules/mr-pipeline-workflow.mdc`

Engine skill **`dev-mr-pipeline`** defers to those overrides when present.

## After session

Append notes to `projects/<slug>/project-memory.md` → **Run history** (tickets shipped, blockers).
