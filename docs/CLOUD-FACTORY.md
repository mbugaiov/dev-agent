# Cloud factory wake (no local Cursor IDE)

Unattended Hephaestus: **GitHub Actions cron → `dev_factory_tick` → Cursor SDK cloud agent**.

Local `arm_dev_loop.sh` + IDE `notify_on_output` remain supported. This path is for when you
want the factory without an open Cursor chat on your laptop.

## Workflow

File: [`.github/workflows/factory-hourly.yml`](../.github/workflows/factory-hourly.yml)

| Trigger | Behavior |
|---------|----------|
| `schedule` (hourly `:17` UTC) | Runs only if repo variable `CLOUD_FACTORY_ENABLED=true` |
| `workflow_dispatch` | Always available; **dry-run default on** |

Script: `bash scripts/cloud_factory_wake.sh <slug> [--dry-run]`

## Secrets & variables — where to put what

Configure on **`mbugaiov/dev-agent`** (the repo that hosts this workflow).
Secrets are **per-repo** in GitHub Actions — a key on `pantheon` does **not** apply here.

| Name | Type | Already on engines? | Needed? |
|------|------|---------------------|---------|
| `CURSOR_API_KEY` | Actions **secret** | Yes on `dev-agent`, `pantheon`, `qa-agent`, `ux-agent`, `ba-agent` (for Themis/review) | **Reuse the same secret on `dev-agent`** — already present. Used to spawn cloud agents. |
| `FACTORY_GITHUB_TOKEN` | Actions **secret** | **No** (new) | **Yes for private app Issues** (e.g. private `pantheon`). PAT or fine-grained token with `issues:read` (+ `contents` if agents need clone outside Cursor). Fallback: `GH_TOKEN`, then `github.token` (insufficient for private sibling repos from this public engine). |
| `CLOUD_FACTORY_ENABLED` | Actions **variable** | No | Set to `true` to allow **scheduled** hourly runs. Leave unset until you are ready. |
| `CLOUD_FACTORY_FORCE_DRY_RUN` | Actions **variable** | No | Optional. `true` = schedule still runs but never spawns (soak / log-only). |

### Cursor side (not GitHub secrets)

| Item | Why |
|------|-----|
| Cursor account / API key with **Cloud Agents** access | SDK `Agent.prompt({ cloud: … })` |
| GitHub connected in [Cursor Dashboard](https://cursor.com/dashboard) with access to `pantheon`, `dev-agent`, `qa-agent`, `ux-agent`, `ba-agent` | Cloud VM clones those repos |
| Optional: saved **Cloud Environment** with STG/SSH secrets | Full gate → deploy → buildId without laptop credentials |

GHA `CURSOR_API_KEY` only **starts** the agent. Clone/auth for private repos is Cursor↔GitHub, not the Actions runner.

## Manual dry-run (safe)

1. Open **Actions → Cloud factory (hourly) → Run workflow**
2. Leave **dry_run = true**, slug `pantheon`
3. Confirm logs show `DEV_FACTORY_IDLE` or `CLOUD_FACTORY_PLAN` with `"action":"dry_run"` and a prompt — **no** `CLOUD_FACTORY_SPAWNED`

## Go live

1. Confirm `CURSOR_API_KEY` on `dev-agent` (already there for code-review).
2. Add `FACTORY_GITHUB_TOKEN` if Issues tick against a private app repo fails with 401/404.
3. Set variable `CLOUD_FACTORY_ENABLED=true`.
4. Optional: one manual run with **dry_run = false** to spawn a single cloud Hephaestus.
5. Watch Actions logs for `CLOUD_FACTORY_SPAWNED` and the Cursor cloud agent dashboard.

## Local equivalent

```bash
export CURSOR_API_KEY=…   # or rely on env
export GITHUB_TOKEN=…     # for private Issues
bash scripts/cloud_factory_wake.sh pantheon --dry-run
# bash scripts/cloud_factory_wake.sh pantheon
```

## Limits (MVP)

- Spawns **Hephaestus** only. Hermes / Athena / Argus kicks are instructed in the prompt (same as IDE); separate cloud wakes per role can come later.
- Does not replace app PR CI on `pantheon` (gate + Themis + STG deploy).
- Hourly idempotency key: `cloud-factory-<slug>-<issue>-YYYYMMDDHH` — one spawn bucket per issue per UTC hour.
