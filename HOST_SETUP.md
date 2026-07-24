# Dev Agent — host machine setup

One-time machine dependencies before **`SETUP.md`**. An AI agent can run most checks below;
humans only needed for installing Node or pasting API tokens into `.secrets/`.

## Required

| Tool | Version | Verify |
|------|---------|--------|
| **Node.js** | 20+ | `node -v` |
| **npm** | 9+ | `npm -v` |
| **git** | any recent | `git --version` |
| **bash** | 4+ | `bash --version` |

```bash
cd /path/to/dev-agent
npm install
bash tests/run_tests.sh    # must exit 0
```

## Recommended (MR + deploy polling)

| Tool | Purpose | Verify |
|------|---------|--------|
| **Bitbucket API token** | PR pipeline wait, merge | in `projects/<slug>/.secrets/bitbucket.env` |
| **Jira API token** | Backlog tick, handoff | in `projects/<slug>/.secrets/jira.env` |
| **Cursor MCP `user-atlassian`** | Jira search/edit in Agent | Settings → MCP → connected |

Git host CLI (`gh` for GitHub, `bb` optional for Bitbucket) is **not** required — engine scripts use REST.

## Cursor workspace

Open **`dev-agent/`** as the workspace root (recommended), or a parent folder that contains both
`dev-agent/` and the app checkout referenced by `app.repo_path`.

Engine rules apply when paths match `.cursor/rules/dev-engine.mdc` globs.

## Application repo (OpenSpec)

When `app.openspec_enabled: true` (default for dev-agent projects), the **app checkout**
must install OpenSpec before factory work:

| Item | Purpose |
|------|---------|
| `@fission-ai/openspec` | Spec CLI (`npm install --save-dev`) |
| `"spec": "openspec"` | npm script in app `package.json` |
| `openspec/specs/` + `openspec/changes/` | Spec-first workflow dirs |
| `.cursor/skills/openspec-*` | Agent skills (propose, apply, archive) |

Verify: `bash scripts/verify_app_openspec.sh <slug>` (also run inside `setup_verify.sh`).

OpenSpec skills live in the **app repo**, not the engine. See **`SETUP.md` §6**.

## Global skills (optional)

No global install required for dev-agent itself.

## Next step

Follow **`SETUP.md`** from section **0 — Agent entry** through **`setup_verify.sh` green**.
