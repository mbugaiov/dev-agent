# Dev-agent setup levels — short guide

**Framework:** Dan Shapiro L0–L5 (`maturity-agent` → `framework/shapiro-levels.md`).  
**Audience:** New project onboarding — what you get at each setup tier, and what is **tested** vs **not implemented yet**.

---

## Three setup options (new project)

| Option | What you configure | Maturity level (product delivery) | Tested |
|--------|-------------------|-----------------------------------|------------|
| **1 — Minimal** | Clone dev-agent, scaffold project, point at app, no secrets | **L3** (agent-assisted dev; you drive merge/handoff) | ✅ Yes |
| **2 — Jira + Bitbucket** | Option 1 + `jira.env` + `bitbucket.env`, factory tick/MR scripts | **L4** (factory picks tickets, ships MRs; human STG/QA/Done) | ✅ Yes (Bitbucket apps) |
| **3 — Full factory** | Option 2 + STG URL + deploy/buildId gate + **qa-agent** (+ optional Teams) | **L5′** (L5 on STG — unattended dev handoff + QA auto-accept on STG) | ✅ Yes (reference path) |

**Headline rule:** Level is about **routine delivery on the target env**. Without STG + qa-agent you cannot claim L5′ even if the dev loop runs.

---

## Option 1 — Minimal setup → **L3**

**Goal:** Use dev-agent as **playbook + local checks** while you code in the app repo.

### Steps

```bash
git clone <dev-agent-repo> && cd dev-agent
npm install
bash tests/run_tests.sh

bash scripts/new_project.sh <slug> <EPIC-KEY> "<Display Name>"
# Edit projects/<slug>/project.yaml → app.repo_path, gate_command, git.* 

bash scripts/setup_verify.sh <slug> --skip-jira --skip-stg
# Optional when app checkout exists:
bash scripts/verify_app_openspec.sh <slug>
```

### What works

| Capability | Status |
|------------|--------|
| Engine self-tests | ✅ |
| Project scaffold + DoD templates | ✅ |
| Resolve app path, OpenSpec readiness check | ✅ |
| Agent skills (`dev-phases`, `dev-mr-pipeline`) as manual checklist | ✅ |
| Local app gate (`project.yaml` → `app.gate_command`) | ✅ (in app repo) |

### What does **not** work

| Capability | Status |
|------------|--------|
| `dev_factory_tick.sh` backlog pickup | ❌ needs Jira |
| MR wait / auto-merge delegation | ❌ needs Bitbucket + app CI scripts |
| STG buildId handoff | ❌ needs STG |
| Validate/Testing → Done | ❌ needs qa-agent + STG |

### Level coverage

- **L3** — multi-step agent work, human owns PR merge, Jira, QA.
- **Not L4+** — no automated backlog or role split in practice.

---

## Option 2 — Jira + Bitbucket → **L4**

**Goal:** Dev factory **picks tickets** and **ships MRs**; humans still own STG verify, QA, and Done.

### Extra steps (after Option 1)

```bash
cp projects/<slug>/jira.env.example projects/<slug>/.secrets/jira.env
cp projects/<slug>/bitbucket.env.example projects/<slug>/.secrets/bitbucket.env
# Fill tokens; set git.provider: bitbucket in project.yaml

# App repo must have: gate_command, mr_push_command, wait_pr_pipeline.sh
bash scripts/setup_verify.sh <slug> --skip-stg   # or full verify if STG URL is real

bash scripts/dev_factory_tick.sh <slug>          # BACKLOG_WAKE_EXECUTE / DEV_FACTORY_IDLE
# Manual session — do NOT need arm_dev_loop for L4 on-demand use
```

### What works

| Capability | Status |
|------------|--------|
| Jira backlog JQL + tick | ✅ |
| Ticket pickup + scope comment | ✅ |
| OpenSpec → implement → gate → MR push | ✅ (app repo) |
| Wait PR pipeline (app script) | ✅ |
| Squash merge | ✅ if app CI has auto-merge (else **human merge** → still L4) |
| Jira handoff to Validate/Testing | ⚠️ partial — needs STG/buildId for machine DoD |

### What does **not** work (without Option 3 pieces)

| Capability | Status |
|------------|--------|
| Machine STG handoff (`check_stg_build.sh`) | ❌ without STG |
| QA auto-accept → Done | ❌ without qa-agent |
| Teams tick notifications | ⚠️ optional — set `DEV_FACTORY_TEAMS_WEBHOOK_URL` in `jira.env` |

### Level coverage

- **L4** — dev + CR roles, Jira intent, deploy exists or pending; **human QA Done**.
- **L5′** — blocked until STG buildId gate + qa-agent loop.

---

## Option 3 — Full integrations → **L5′**

**Goal:** Unattended **dev factory on STG** (reference production setup).

### Extra steps (after Option 2)

```bash
# project.yaml → stg.base_url (live STG)
bash scripts/setup_verify.sh <slug>          # expect SETUP_OK

# Clone/setup qa-agent sibling; arm QA loop for same epic
bash scripts/arm_dev_loop.sh <slug>            # dev factory loop

# Optional Teams summary on tick:
# DEV_FACTORY_TEAMS_WEBHOOK_URL in projects/<slug>/.secrets/jira.env
```

### Integrations

| Integration | Required for L5′? | Tested |
|-------------|-------------------|------------|
| Jira | Yes | ✅ |
| Bitbucket (app MR/CI) | Yes | ✅ |
| STG + buildId gate | Yes | ✅ |
| qa-agent (Validate/Testing → Done) | Yes | ✅ separate repo |
| Teams tick notify | No | ✅ optional |
| MCP Atlassian (chat) | No | ✅ optional |
| GitHub (engine PRs only) | For engine changes | ✅ |

### Level coverage

- **L5′ (L5 on STG)** — auto-merge when CI + CR green, STG buildId truth, machine handoff, QA auto-accept on STG.
- **Not full L5** — PROD deploy and multi-product unattended remain human-gated (by design).

---

## Support matrix — what dev-agent does **not** implement yet

| Feature | Status | Workaround |
|---------|--------|------------|
| Factory backlog **without Jira** (mock/local tickets) | ❌ Not implemented | Manual ticket in chat (Option 1) |
| **`git.provider: github`** for **app** repo MR/CI | ⚠️ Partial — URL helpers exist; no `github.env` / `setup_verify` path like Bitbucket | Use Bitbucket for app, or add app-side `wait_pr_pipeline` + document tokens manually |
| Handoff to Validate/Testing **without STG** | ❌ By design (machine DoD) | Option 2 + manual Jira comment |
| **qa-agent** bundled inside dev-agent | ❌ Separate repo | Install qa-agent per `qa-agent/SETUP.md` |
| Unattended **PROD** deploy | ❌ Out of scope (L5 not L5′) | Human PROD gate |
| Full L5 without **OpenSpec** in app | ❌ `openspec_enabled: true` mandatory in template | Install OpenSpec per `SETUP.md` §6 |

---

## Quick verify commands

```bash
# Option 1
bash scripts/setup_verify.sh <slug> --scaffold
bash scripts/setup_verify.sh <slug> --skip-jira --skip-stg

# Option 2
bash scripts/setup_verify.sh <slug> --skip-stg
bash scripts/dev_factory_tick.sh <slug>

# Option 3
bash scripts/setup_verify.sh <slug>
bash scripts/arm_dev_loop.sh <slug>
```

---

## Related docs

- **`SETUP.md`** — full agent runbook
- **`PORTABILITY.md`** — engine vs project vs app layers
- **`docs/DEV-FACTORY-AUTOMATION.md`** — loop wiring
- **maturity-agent** `framework/shapiro-levels.md` — L0–L5 definitions
