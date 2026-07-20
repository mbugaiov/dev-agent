# Dev Agent — setup (AI agent runbook)

**Audience:** Cursor Agent (or equivalent). Execute this document **top to bottom**.
Humans only intervene for **secret values** (API tokens) when files under `.secrets/` are missing or empty.

> **Spine after setup:** `AGENTS.md` (runtime loop) · skills under `.cursor/skills/` · per-ticket flow in `dev-mr-pipeline`.

---

## Agent contract

| Variable | Meaning |
|----------|---------|
| `ENGINE_ROOT` | Absolute path to the `dev-agent/` repo |
| `SLUG` | Project slug (`projects/<SLUG>/`) — lowercase letters, digits, hyphens |
| `EPIC_KEY` | Jira epic key for dev factory backlog (e.g. `TST-1`) |
| `APP_ROOT` | Resolved app checkout — `npx tsx scripts/resolve_app_root.ts <SLUG>` |

**Rules for agents**

1. Run every **Verify** block; proceed only on pass (exit 0 or expected sentinel lines).
2. On **SETUP_FAIL**, fix the cited check and re-run `bash scripts/setup_verify.sh <SLUG>`.
3. **Never commit** `projects/<SLUG>/.secrets/*` or live credentials.
4. After setup, read `projects/<SLUG>/project-memory.md` at the **start of every factory session**.
5. Dev factory stops at **Validate/Testing** — qa-agent owns Done.

**Example slug in docs:** `myapp` (valid for `new_project.sh`).

---

## 0. Agent entry — detect starting state

Run from `ENGINE_ROOT`:

```bash
cd "$ENGINE_ROOT"   # dev-agent repo root
pwd
```

**Branch A — project folder already exists** (submodule, clone, or local `projects/<SLUG>/`):

```bash
test -f "projects/<SLUG>/project.yaml" && echo "PROJECT_EXISTS"
```

→ Skip **§3 Create project**. Continue at **§4 Configure project.yaml**.

**Branch B — greenfield project:**

→ Continue at **§3 Create project**.

**Branch C — migrate from embedded in-app dev-factory:**

App repo currently contains duplicated loop scripts, factory `lib/`, or factory skills.

1. Clone or sibling `dev-agent/` next to the app.
2. Follow **§3–§9** (scaffold or attach project repo).
3. Move product-specific config into `projects/<SLUG>/project.yaml` and DoD docs.
4. Remove duplicated engine files from the app; add thin pointer in app `AGENTS.md` (see **`EXTRACTION-MAP.md`** § “Agent: install”).
5. Run `bash scripts/setup_verify.sh <SLUG>` → `SETUP_OK`.

**Branch D — user said “set up dev-agent for \<Name\>” without slug:**

1. Derive `SLUG` from app name (lowercase, hyphens, no underscores).
2. Ask human **once** for `EPIC_KEY` if not in chat context.
3. If still ambiguous, use Branch B with `scripts/new_project.sh`.

---

## 1. Host prerequisites

Execute **`HOST_SETUP.md`** checks (agent-runnable):

```bash
node -v          # expect v20+
npm -v
cd "$ENGINE_ROOT"
npm install
bash tests/run_tests.sh
```

| Result | Action |
|--------|--------|
| exit 0 | Continue |
| exit non-zero | Fix Node/npm or engine tests before project setup |

---

## 2. Open the correct Cursor workspace

| Layout | Agent workspace root |
|--------|----------------------|
| **Recommended** | `dev-agent/` |
| App + engine siblings | Parent containing `dev-agent/` and app repo |
| App-primary workspace | App repo — **still** run engine scripts via absolute `ENGINE_ROOT` paths |

**Agent MUST** confirm engine rules are visible:

```bash
test -f "$ENGINE_ROOT/.cursor/rules/dev-engine.mdc" && echo "ENGINE_RULES_OK"
```

Optional MCP (Jira in chat): Settings → MCP → **user-atlassian** connected.
Not required if using REST scripts with `.secrets/jira.env`.

---

## 3. Create project (Branch B only)

```bash
cd "$ENGINE_ROOT"
bash scripts/new_project.sh <SLUG> <EPIC_KEY> "<Display Name>"
```

**Verify**

```bash
bash scripts/setup_verify.sh <SLUG> --scaffold
```

Expect: `SETUP_SCAFFOLD_OK` exit 0.

→ Continue **§4** (agent must fill `git.workspace`, `git.repo`, `app.repo_path`, STG, gate commands before full verify).

**Agent MUST** copy secret templates (fill values in §5):

```bash
cp "projects/<SLUG>/jira.env.example" "projects/<SLUG>/.secrets/jira.env"
cp "projects/<SLUG>/bitbucket.env.example" "projects/<SLUG>/.secrets/bitbucket.env"
```

---

## 4. Configure `project.yaml`

Edit `projects/<SLUG>/project.yaml`. Replace **all** angle-bracket placeholders.

### 4a. Agent checklist (required fields)

| Key | Agent sets to |
|-----|----------------|
| `dev_factory.epic_key` | `<EPIC_KEY>` |
| `dev_factory.excluded_issue_keys` | On-hold Jira keys (or `[]`) |
| `git.workspace` / `git.repo` | Bitbucket/GitHub workspace + repo name |
| `git.ticket_key_pattern` | Regex matching keys (e.g. `PROJ-\\d+`) |
| `stg.base_url` | Live staging base URL (no trailing path) |
| `app.repo_path` | Relative from `ENGINE_ROOT` or absolute path to app checkout |
| `app.gate_command` | App CI gate command (from project config, runs in app repo) |
| `app.mr_push_command` | App MR push script/command |
| `loop.purpose` | `<SLUG>dev` (used in loop tick sentinel) |
| `jira.transitions.validate_testing` | Jira transition id to Validate/Testing |

**Discover Validate/Testing transition id** (agent):

```bash
# After jira.env is filled (§5):
source scripts/source_project_secrets.sh <SLUG>
curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  "$JIRA_BASE_URL/rest/api/3/issue/<SAMPLE-KEY>/transitions" | \
  head -c 2000
# Pick transition id where "to" name matches handoff_status (Validate/Testing)
```

Or use MCP `user-atlassian` → `getTransitionsForJiraIssue`.

**Verify app path resolves**

```bash
APP_ROOT="$(npx tsx scripts/resolve_app_root.ts <SLUG>)"
test -d "$APP_ROOT" && echo "APP_ROOT_OK $APP_ROOT"
```

---

## 5. Secrets — Jira and Bitbucket

### 5a. Jira (required for factory loop)

Human provides API token once; agent writes file:

`projects/<SLUG>/.secrets/jira.env`:

```bash
JIRA_BASE_URL=https://<site>.atlassian.net
JIRA_EMAIL=<account-email>
JIRA_API_TOKEN=<token>
JIRA_PROJECT_KEY=<KEY>
```

**Verify auth** (agent):

```bash
cd "$ENGINE_ROOT"
source scripts/source_project_secrets.sh <SLUG>
curl -s -o /dev/null -w "%{http_code}" -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  "$JIRA_BASE_URL/rest/api/3/myself"
# expect 200
```

### 5b. Bitbucket (when `git.provider: bitbucket`)

`projects/<SLUG>/.secrets/bitbucket.env`:

```bash
BITBUCKET_USERNAME=<email>
BITBUCKET_TOKEN=<api-token>
BITBUCKET_WORKSPACE=<workspace>
```

Used by app-repo `wait_pr_pipeline.sh` / merge scripts (sourced via engine delegation).

---

## 6. App repo prerequisites

All paths relative to **`APP_ROOT`**.

**Agent MUST verify** delegated scripts exist:

```bash
APP_ROOT="$(npx tsx "$ENGINE_ROOT/scripts/resolve_app_root.ts" <SLUG>)"
for s in wait_pr_pipeline wait_main_deploy; do
  rel="$(npx tsx "$ENGINE_ROOT/scripts/resolve_app_script.ts" <SLUG> "$s")"
  test -f "$APP_ROOT/$rel" && echo "OK $s" || echo "MISSING $s $APP_ROOT/$rel"
done
```

| Missing | Agent action |
|---------|----------------|
| `wait_pr_pipeline.sh` | Copy from a reference app or implement per team CI docs |
| `wait_main_deploy.sh` | Same |
| `gate_command` fails | Fix app deps; do not skip gate in factory |

**OpenSpec** (when `app.openspec_enabled: true`):

```bash
test -d "$APP_ROOT/.cursor/skills/openspec-propose" && echo "OPENSPEC_SKILLS_OK" || \
  echo "WARN openspec skills missing in app repo — spec-first phases degraded"
```

Optional project override: `projects/<SLUG>/.cursor/rules/mr-pipeline-workflow.mdc`

---

## 7. `project-memory.md` — agent session memory

**Agent MUST** fill before first factory run (`projects/<SLUG>/project-memory.md`):

```markdown
## App profile
- **App root:** <absolute or relative path>
- **Gate:** <gate_command from project.yaml>
- **OpenSpec:** enabled | disabled
- **STG:** <stg.base_url>

## Active loop
- **Slug:** `<SLUG>`
- **Purpose:** `<SLUG>dev`
- **Interval:** 300s — `DEV_LOOP_INTERVAL_SEC` or `bash scripts/arm_dev_loop.sh <SLUG>`
- **Arm:** `bash scripts/arm_dev_loop.sh <SLUG>`

## Human exceptions
See `docs/HUMAN-EXCEPTIONS.md` and `dev_factory.excluded_issue_keys`.

## Run history
<!-- Agent appends after each session -->
```

---

## 8. Human exceptions doc

**Agent MUST** review `projects/<SLUG>/docs/HUMAN-EXCEPTIONS.md`:

- Confirm `excluded_issue_keys` in yaml matches on-hold tickets.
- Confirm label exclusions align with qa-agent (`impl-qa`, `human-required`, …).

No edit required if defaults match project policy.

---

## 9. Setup verification gate

**Agent MUST** run (full check):

```bash
cd "$ENGINE_ROOT"
chmod +x scripts/setup_verify.sh
bash scripts/setup_verify.sh <SLUG>
```

**Pass criteria:** last line is `SETUP_OK {"slug":"...","engine":"..."}` exit 0.

**Partial setup** (no Jira yet — local engine dev only):

```bash
bash scripts/setup_verify.sh <SLUG> --skip-jira --skip-stg
```

On failure: read each `SETUP_FAIL {"check":"...","reason":"..."}` line, fix, re-run until green.

**Optional engine health:**

```bash
bash scripts/portability_check.sh
bash scripts/projects_isolation_check.sh
```

---

## 10. First factory session (agent execution)

After **§9 SETUP_OK**, the agent can run the dev factory.

### 10a. Read config (every session)

1. `projects/<SLUG>/project.yaml`
2. `projects/<SLUG>/project-memory.md`
3. `projects/<SLUG>/docs/DEFINITION-OF-DONE.md`
4. Skill **`dev-factory-loop`**

### 10b. Tick backlog

```bash
cd "$ENGINE_ROOT"
bash scripts/dev_factory_tick.sh <SLUG>
```

| Output | Agent action |
|--------|--------------|
| `BACKLOG_WAKE_EXECUTE` | Start oldest ticket **now** — skill **`dev-phases`** + **`dev-mr-pipeline`** |
| `BACKLOG_WAKE` | Drain — implement / handoff / next ticket same session |
| `DEV_FACTORY_IDLE` | No actionable tickets — may arm loop and wait |

### 10c. Arm continuous loop

**When user uses trigger phrases** (`run loop`, `drain backlog`, `arm dev factory`, … — see `FACTORY_RUN_INTENT_PHRASES` in `lib/devFactoryExecution.ts`):

**Agent MUST** (same turn — `.cursor/rules/dev-factory-active.mdc`):

1. Run tick now (§10b).
2. If backlog > 0: start ticket in `APP_ROOT` immediately — **no status-only reply**.
3. Launch loop in background with `notify_on_output` on patterns from `lib/devFactoryLoopWiring.ts`:

```bash
DEV_LOOP_INTERVAL_SEC=300 bash scripts/arm_dev_loop.sh <SLUG>
```

Watch patterns (regex): `buildCombinedWatchPattern(loop.purpose)` — includes `BACKLOG_WAKE_EXECUTE`, `BACKLOG_WAKE`, `DEV_FACTORY_IDLE`, `LOOP_ARMED`, `MR_PR_BACKUP_`, `AGENT_LOOP_TICK_<purpose>`.

### 10d. Per-ticket command reference

| Step | Command |
|------|---------|
| Gate | `cd "$APP_ROOT" && <gate_command>` |
| MR push | `cd "$APP_ROOT" && <mr_push_command>` |
| Wait CI | `bash scripts/wait_pr_pipeline.sh <SLUG> <PR_ID>` |
| Wait deploy | `bash scripts/wait_main_deploy.sh <SLUG>` |
| STG check | `bash scripts/check_stg_build.sh <SLUG> <commit>` |
| Preflight | `npx tsx scripts/preflight_jira_handoff.ts <SLUG> <KEY>` |
| Handoff | `npx tsx scripts/post_jira_handoff.ts <SLUG> <KEY> ... --transition` |

Detail: skills **`dev-mr-pipeline`**, **`dev-jira`**, **`dev-phases`**.

### 10e. Example user → agent mapping

| User says | Agent does |
|-----------|------------|
| "Set up dev-agent for myapp" | §0–§9 this doc |
| "Run the dev factory" / "drain backlog" | §10b–§10c active factory mode |
| "Work ticket TST-105" | Tick if needed → branch in APP_ROOT → phases 1–8 |
| "Stop the loop" | Kill `dev-loop.sh` / disarm; document in project-memory |

---

## 11. Attach existing project repo (submodule / clone)

When `projects/<SLUG>/` comes from another git repo:

```bash
cd "$ENGINE_ROOT"
# Submodule (team):
git submodule add git@github.com:<org>/dev-agent-project-<SLUG>.git "projects/<SLUG>"
git submodule update --init

# Or plain clone:
git clone git@github.com:<org>/dev-agent-project-<SLUG>.git "projects/<SLUG>"
```

**Agent MUST** after clone:

1. Copy secret **examples** → `.secrets/` (§5) — secrets are never in project git.
2. Confirm `app.repo_path` points at live app checkout (§4).
3. Run `bash scripts/setup_verify.sh <SLUG>`.

See **`ENGINE-REVIEW.md`** for engine vs project repo split.

---

## 12. Multi-project

Each app = one `projects/<SLUG>/` with isolated `.secrets/`.

```bash
bash scripts/new_project.sh otherapp TST-2 "Other App"
# Repeat §4–§9 for each SLUG
```

Arm loops independently:

```bash
DEV_LOOP_INTERVAL_SEC=300 bash scripts/arm_dev_loop.sh myapp
DEV_LOOP_INTERVAL_SEC=600 bash scripts/arm_dev_loop.sh otherapp
```

---

## 13. Pre-flight checklist (copy for agent)

```bash
cd "$ENGINE_ROOT"

# Engine
bash tests/run_tests.sh

# Project
test -f "projects/<SLUG>/project.yaml"
bash scripts/setup_verify.sh <SLUG>

# Runtime readiness
bash scripts/dev_factory_tick.sh <SLUG>
APP_ROOT="$(npx tsx scripts/resolve_app_root.ts <SLUG>)"
test -d "$APP_ROOT/.git" && git -C "$APP_ROOT" status -sb
```

All commands exit 0 / expected sentinels → **setup complete**. Proceed to **`AGENTS.md`** loop.

---

## 14. Settings reference

### `project.yaml` (tracked — no secrets)

| Key | Purpose |
|-----|---------|
| `dev_factory.epic_key` | JQL parent epic |
| `dev_factory.pickup_label` | Usually `impl-dev` |
| `dev_factory.excluded_labels` | Never pick (qa, human, pause) |
| `dev_factory.excluded_issue_keys` | Hard exclude by key |
| `dev_factory.handoff_status` | Target status (Validate/Testing) |
| `git.*` | MR URL pattern, branch prefixes, ticket regex |
| `stg.base_url` | STG host for buildId check |
| `app.repo_path` | App checkout |
| `app.gate_command` / `app.mr_push_command` | Local CI |
| `app.wait_*_script` | Override app delegation paths |
| `loop.purpose` | Loop tick sentinel suffix |
| `jira.transitions.validate_testing` | Post-handoff transition id |

### `.secrets/jira.env`

| Key | Required |
|-----|----------|
| `JIRA_BASE_URL` | yes |
| `JIRA_EMAIL` | yes |
| `JIRA_API_TOKEN` | yes |
| `JIRA_PROJECT_KEY` | recommended |

### `.secrets/bitbucket.env` (Bitbucket apps)

| Key | Required |
|-----|----------|
| `BITBUCKET_USERNAME` | yes |
| `BITBUCKET_TOKEN` | yes |
| `BITBUCKET_WORKSPACE` | yes |

---

## Related docs

| Doc | When |
|-----|------|
| **`HOST_SETUP.md`** | Machine Node/npm install |
| **`AGENTS.md`** | Runtime loop + hard rules |
| **`PORTABILITY.md`** | Engine vs project repo ownership |
| **`ENGINE-REVIEW.md`** | GitHub publish + linking live projects |
| **`.cursor/skills/dev-factory-loop/SKILL.md`** | Loop tick + drain policy |
| **`.cursor/skills/dev-mr-pipeline/SKILL.md`** | Per-ticket MR flow |
| **`.cursor/skills/dev-jira/SKILL.md`** | Handoff + QA RETURN |
| **`.cursor/skills/dev-phases/SKILL.md`** | OpenSpec + phase checklist |
