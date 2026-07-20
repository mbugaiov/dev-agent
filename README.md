# Dev Agent

An agent-driven **dev factory** workspace: Jira `impl-dev` backlog → OpenSpec spec-first implementation
in your app repo → MR → merge → STG buildId verify → **Validate/Testing** handoff for the QA agent.

Mirrors the **qa-agent** portability model: shared **engine** + per-app **`projects/<slug>/`** data.

**Paired with qa-agent** — dev stops at Validate/Testing; QA closes tickets.

## One project = one folder · engine stays generic

The **engine** (`AGENTS.md`, `lib/`, `scripts/`, `.cursor/skills/`, `PORTABILITY.md`) must not
contain product names, Jira keys, or live URLs. Each **app** gets `projects/<slug>/` in a
**separate project repo** (or local gitignored clone). See **`ENGINE-REVIEW.md`**.

## Quickstart (generic)

**AI agents:** follow **`SETUP.md`** end-to-end (includes `setup_verify.sh` gate).

Human summary:

1. **Scaffold a project:**

   ```bash
   scripts/new_project.sh myapp TST-1 "My App"
   ```

2. **Configure** `projects/myapp/project.yaml` (app path, git host, STG) and secrets:

   ```bash
   cp projects/myapp/jira.env.example projects/myapp/.secrets/jira.env
   cp projects/myapp/bitbucket.env.example projects/myapp/.secrets/bitbucket.env
   ```

3. **Verify engine (includes portability gate when git initialized):**

   ```bash
   bash tests/run_tests.sh
   bash scripts/portability_check.sh
   bash scripts/projects_isolation_check.sh
   ```

4. **Arm the loop:**

   ```bash
   DEV_LOOP_INTERVAL_SEC=300 bash scripts/arm_dev_loop.sh myapp
   ```

For **linking a live project**, see **`ENGINE-REVIEW.md`** — project data does not ship in the engine repo.

## Layout

| Path | Purpose |
|---|---|
| `ARCHITECTURE.md` | **Layer model** — engine vs project vs app |
| `SETUP.md` | **Agent runbook** — step-by-step setup through first factory run |
| `HOST_SETUP.md` | Machine deps (Node, npm) |
| `AGENTS.md` | Loop spine + hard rules |
| `PORTABILITY.md` | Engine vs projects; GitHub split |
| `ENGINE-REVIEW.md` | Pre-publish / pre-MR portability review |
| `.cursor/skills/dev-code-review/SKILL.md` | Engine PR code review |
| `EXTRACTION-MAP.md` | Component map — what lives in engine vs project vs app |
| `lib/` | Pure TS: loop, execution, wiring, Jira gates |
| `scripts/` | `dev_factory_tick`, `arm_dev_loop`, handoff, portability checks |
| `projects/_template/` | New project skeleton (only project path tracked in engine git) |
| `tests/run_tests.sh` | Offline engine self-tests |

## Status

**Phase 1 + 1b complete** — core loop, handoff/MR/STG scripts extracted. **43 unit tests** green.

**Phase 2:** `git init`, portability gate on tracked files, GitHub publish.
