# Dev engine — portability review gate

Run this checklist before every **engine** PR or GitHub publish. Live project data belongs only
under `projects/<slug>/` in a **separate repo or local clone** — never in tracked engine files.

**Agent installing dev-agent on an app:** use **`SETUP.md`** (not this doc).

Automated gates mirror qa-agent: `portability_check.sh` + `projects_isolation_check.sh`.

---

## What “project-agnostic engine” means

| Layer | May contain | Must NOT contain |
|-------|-------------|------------------|
| **Engine** | `<slug>`, `<EPIC-KEY>`, `staging.example.com`, fixture `TST-*` in **tests only** | Real Jira keys, git workspace/repo names, STG hosts, app checkout paths, app CI command strings |
| **Template** (`projects/_template/`) | Generic placeholders only | Any real epic, host, or company |
| **Live project** (`projects/<slug>/` local) | All product-specific values | Tracked in engine git |

**Rule:** Run `bash scripts/portability_check.sh` — exit 0 required before merge.

---

## Automated gates (required)

```bash
bash scripts/portability_check.sh
bash scripts/projects_isolation_check.sh
bash tests/run_tests.sh
bash scripts/setup_verify.sh <slug> --scaffold   # after new_project.sh smoke
```

CI (`.github/workflows/ci.yml`) runs the first three on every push/PR.

---

## Forbidden categories (engine)

Scanned paths: `.cursor/`, `lib/`, `scripts/`, `tests/`, `docs/`, root `*.md` (all tracked markdown).

| Category | Why forbidden | Use instead |
|----------|---------------|-------------|
| Live project slug as default | Couples engine to one product | `<slug>` parameter everywhere |
| Real Jira keys (`PROJ-123` live keys) | Leaks backlog | `<EPIC-KEY>`, `TST-1` in tests |
| Company / workspace names | Leaks org | `<workspace>`, `example-corp` |
| Application repo name | Leaks product | `<repo>`, `my-app` |
| Product paths or STG hosts | Leaks infra | `../my-app`, `https://staging.example.com` |
| Machine-specific absolute paths | Breaks clones | Relative paths or env vars |
| App CI commands in engine source | Belongs in project yaml | `project.yaml` → `app.gate_command` |
| Hardcoded loop tick sentinel suffix | Belongs in config | `loop.purpose` from yaml |

**Tests:** fixtures only (`TST-*`, `example-corp`, `staging.example.com`).

---

## Manual review checklist

- [ ] **dev-factory-loop** — JQL from `buildDevFactoryJql()`; points to `SETUP.md` for first install
- [ ] **dev-mr-pipeline** — no product name; defers to `projects/<slug>/.cursor/rules/`
- [ ] **dev-jira** — transition ids from project config / env, not hardcoded per product
- [ ] **dev-code-review** — engine PR gates; app MR CR stays in app repo
- [ ] **dev-phases** — OpenSpec dir from `app.openspec_specs_dir`
- [ ] **lib/** — no default epic, workspace, or app path constants
- [ ] **scripts/arm_dev_loop.sh** — requires `<slug>`; no default slug argument
- [ ] **scripts/dev_factory_tick.ts** — loads yaml per slug; no default Jira site
- [ ] **README / AGENTS.md / SETUP.md** — examples use `myapp` + `TST-1`
- [ ] **EXTRACTION-MAP.md** — generic ownership map only
- [ ] **Only `projects/_template/`** tracked under `projects/`

---

## Phased delivery (generic)

| Phase | Work | Gate |
|-------|------|------|
| **0. Scaffold** | Docs, `_template`, skills | `run_tests.sh` |
| **1. Extract + genericize** | Portable lib + scripts | portability + isolation |
| **2. Engine review** | This checklist; all leaks fixed | all gates green |
| **3. Publish engine** | GitHub — engine + `_template` only | CI green |
| **4. Project repo** | `dev-agent-project-<slug>` private | secrets never committed |
| **5. Link project → engine** | Submodule or sibling clone | `setup_verify.sh` + smoke tick |
| **6. De-embed app** | Remove duplicated factory from app | app MR = product only |

Phase 2 blocks Phase 3.

---

## Linking a project to the engine (Phase 4–5)

Connection is always through **`projects/<slug>/`** — never by embedding product names in engine code.

### Submodule (teams, pinned SHA)

```bash
cd dev-agent
git submodule add git@github.com:<org>/dev-agent-project-<slug>.git projects/<slug>
git submodule update --init
```

Project repo root matches `projects/<slug>/` tree:

```
dev-agent-project-<slug>/     ← git root
  project.yaml
  project-memory.md
  docs/
  .secrets/                   ← gitignored locally
  .cursor/rules/              ← optional MR overrides
```

### Sibling clone (local dev)

```
workspace/
  dev-agent/
  dev-agent-project-<slug>/   → contents at dev-agent/projects/<slug>/
  my-app/                     ← app.repo_path target
```

`project.yaml`:

```yaml
app:
  repo_path: ../my-app    # relative to dev-agent root
```

Open Cursor on `dev-agent/` or the parent workspace.

### Plain clone into gitignored path

```bash
cd dev-agent/projects
git clone git@github.com:<org>/dev-agent-project-<slug>.git <slug>
```

Solo dev; engine repo does not pin project SHA.

### Agent verification after link

```bash
bash scripts/setup_verify.sh <slug>
bash scripts/dev_factory_tick.sh <slug>
```

Full steps: **`SETUP.md`** §0–§10.

---

## QA pairing

Use the **same `<slug>`** in dev-agent and qa-agent project folders. Dev: impl-dev → Validate/Testing. QA: Validate/Testing → Done. Jira is the bus.

---

## Comparison to qa-agent

| Concern | qa-agent | dev-agent |
|---------|----------|-----------|
| Engine repo | Generic skills + scripts | Generic loop + MR handoff |
| Project repo | `qa-agent-project-<slug>` | `dev-agent-project-<slug>` |
| App repo | Product code only | Product code only |
| Isolation | `projects_isolation_check.sh` | Same |
| Portability | `portability_check.sh` | Same patterns |
| Agent setup doc | `SETUP.md` | `SETUP.md` |

---

## Related docs

| Doc | When |
|-----|------|
| **`SETUP.md`** | Agent installs dev-agent on a project |
| **`ARCHITECTURE.md`** | Layer model |
| **`EXTRACTION-MAP.md`** | What file lives in which layer |
| **`PORTABILITY.md`** | Repo split details |
