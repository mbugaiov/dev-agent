# Dev Agent — portability (engine vs projects)

The **engine** is everything needed to run the **dev factory loop** on **any** app repo
(Jira-backed backlog → OpenSpec → MR → merge → STG → Validate/Testing handoff). **Project data**
is per-app and may live in a separate repo or monorepo subtree.

Paired with **qa-agent** for the QA side (Validate/Testing → Done). Dev and QA loops **never merge**
— they coordinate through Jira labels, comments, and status transitions.

## What ships in the engine repo

```
dev-agent/
  ARCHITECTURE.md           layer model — engine vs project vs app (this decision doc)
  SETUP.md                  agent runbook — first-time setup (AI-executable)
  HOST_SETUP.md             machine deps, workspace layout
  AGENTS.md                 portable spine (loop + skill index)
  .cursor/
    rules/                  dev-engine, dev-factory-active
    skills/                 dev-factory-loop, dev-phases, dev-mr-pipeline, dev-jira, dev-code-review
    hooks/                  dev-factory drain stop, session start
    hooks.json
  lib/                      pure TypeScript (no app imports)
  scripts/                  slug-parameterized CLI + loop scheduler
  templates/                handoff comment, scope comment, loop-run
  tests/run_tests.sh        offline self-tests
  projects/
    _template/              skeleton copied for every new app factory
```

**Rule:** engine files must not hardcode a project slug, Jira epic key, Bitbucket workspace,
STG host, or app-specific gate commands. Use `projects/<slug>/project.yaml` and per-project
`.secrets/`. Run **`scripts/portability_check.sh`** before every engine PR — see **`ENGINE-REVIEW.md`**.

## What stays per project (not in the engine)

```
projects/<slug>/
  project.yaml              epic, JQL, git host, STG, app.repo_path, gate commands
  project-memory.md         active loop, exclusions, operational notes
  .secrets/                 jira.env, bitbucket.env (gitignored)
  docs/
    DEFINITION-OF-DONE.md   dev handoff gate (machine DoD)
    HUMAN-EXCEPTIONS.md     human vs loop boundaries
  requirements/factory-tickets/   epic manifest, groomed ticket specs
  factory/
    schema.md               ledger event schema (optional)
    runs/*.jsonl            tick audit trail (gitignored by default)
  .cursor/rules/            optional app-specific MR workflow overrides
```

The **application repo** holds product code, OpenSpec specs,
CI scripts, and e2e tests. The dev-agent engine **invokes** gate/MR commands from
`project.yaml` → `app.gate_command` / `app.mr_push_command`.

## Dev factory loop vs QA loop

| Concern | Dev agent (this repo) | QA agent (`qa-agent`) |
|---------|----------------------|------------------------|
| Jira pickup | `impl-dev`, To Do / In Progress | `Validate/Testing`, `impl-qa` |
| Stops at | Validate/Testing handoff | Done (auto-accept when DoD met) |
| Spec workflow | OpenSpec in **app repo** | REQ/SC/TC in **qa project** |
| Returns to dev | Reads **QA RETURN** comments | Posts QA RETURN via `jira_return_in_progress.py` |
| Labels filed | — | `confirmed-defect` + `impl-dev` on bugs |

## Onboarding a new project

```bash
scripts/new_project.sh <slug> <epic-key> "<Display Name>"
# Fill projects/<slug>/.secrets/jira.env + bitbucket.env
# Set projects/<slug>/project.yaml → app.repo_path to your app checkout
bash tests/run_tests.sh
bash scripts/arm_dev_loop.sh <slug>
```

## Workspace layouts

Same options as qa-agent (`PORTABILITY.md` there):

| Layout | When |
|--------|------|
| Sibling dirs: `myapp/` + `dev-agent/` | Default |
| Submodule: `dev-agent/projects/myapp/` | Pin project data |
| Meta-workspace | Sibling `dev-agent/` + app repo in one Cursor root |

## Optional host dependencies

| Dependency | Purpose |
|---|---|
| `~/.cursor/skills/openspec-*` | Spec-first workflow in app repo |
| Jira + Bitbucket creds | Backlog tick, handoff, PR pipeline |
| `tsx`, Node 20+ | TypeScript scripts |
| App repo CI | `gate:mr`, e2e — not vendored in engine |

## Continuous dev loop

- Arm: `bash scripts/arm_dev_loop.sh <slug>` with Cursor `notify_on_output` on watch patterns
- Tick: `scripts/dev-loop.sh` → `dev_factory_tick.sh <slug>` → `BACKLOG_WAKE_EXECUTE`
- Policy: one open MR at a time; drain full backlog per session; idle only on `DEV_FACTORY_IDLE`
- Stop hook: auto-followup if agent ends turn without branching (see `lib/devFactoryExecution.ts`)

See `docs/DEV-FACTORY-AUTOMATION.md` and skill `dev-factory-loop`.
