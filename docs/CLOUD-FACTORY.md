# Cloud factory wake (no local Cursor IDE)

Unattended Hephaestus: **GitHub Actions cron → `dev_factory_tick` → Cursor SDK cloud agent**.

Local `arm_dev_loop.sh` + IDE `notify_on_output` remain supported. This path is for when you
want the factory without an open Cursor chat on your laptop.

## Default: OFF

**Disabled until you set the flag.** Merging this workflow does not start agents.

| Layer | Gate |
|-------|------|
| GitHub Actions | Job `wake` runs only if variable `CLOUD_FACTORY_ENABLED=true` (schedule **and** manual) |
| Script | Exits `0` with `CLOUD_FACTORY_DISABLED` unless env `CLOUD_FACTORY_ENABLED` is `true` / `1` / `yes` |

Unset / any other value = off.

## Workflow

File: [`.github/workflows/factory-hourly.yml`](../.github/workflows/factory-hourly.yml)

| Trigger | When `CLOUD_FACTORY_ENABLED` unset | When `= true` |
|---------|--------------------------------------|---------------|
| `schedule` (hourly `:17` UTC) | Notice job only (`CLOUD_FACTORY_DISABLED`) | Tick + optional spawn |
| `workflow_dispatch` | Same — wake job skipped | Runs; **dry-run default on** |

Script: `bash scripts/cloud_factory_wake.sh <slug> [--dry-run]`  
(still requires `CLOUD_FACTORY_ENABLED=true` in the environment)

## Secrets & variables — where to put what

Configure on **`mbugaiov/dev-agent`** (the repo that hosts this workflow).
Secrets are **per-repo** in GitHub Actions — a key on `pantheon` does **not** apply here.

| Name | Type | Already on engines? | Needed? |
|------|------|---------------------|---------|
| `CLOUD_FACTORY_ENABLED` | Actions **variable** | No | **Master switch.** Must be `true` or nothing runs. |
| `CURSOR_API_KEY` | Actions **secret** | Yes on `dev-agent` (and siblings for Themis) | Required to spawn (not for dry-run). Already on `dev-agent`. |
| `FACTORY_GITHUB_TOKEN` | Actions **secret** | **No** (new) | **Yes for private app Issues** (e.g. private `pantheon`). |
| `CLOUD_FACTORY_FORCE_DRY_RUN` | Actions **variable** | No | Optional. `true` = never spawn even when enabled (soak / log-only). |

### Cursor side (not GitHub secrets)

| Item | Why |
|------|-----|
| Cursor account / API key with **Cloud Agents** access | SDK `Agent.prompt({ cloud: … })` |
| GitHub connected in [Cursor Dashboard](https://cursor.com/dashboard) with access to app + engines | Cloud VM clones those repos |
| Optional: saved **Cloud Environment** with STG/SSH secrets | Full gate → deploy → buildId |

## Enable (when ready)

1. `dev-agent` → Settings → Secrets and variables → Actions → **Variables**
2. Add `CLOUD_FACTORY_ENABLED` = `true`
3. Optional: Actions → Cloud factory → Run workflow with **dry_run = true** first
4. To turn off again: delete the variable or set to `false`

## Local equivalent

```bash
# Still disabled — prints CLOUD_FACTORY_DISABLED and exits 0
bash scripts/cloud_factory_wake.sh pantheon --dry-run

# Explicit enable for this shell only
export CLOUD_FACTORY_ENABLED=true
export CURSOR_API_KEY=…   # for real spawn
export GITHUB_TOKEN=…     # for private Issues
bash scripts/cloud_factory_wake.sh pantheon --dry-run
```

## Limits (MVP)

- Spawns **Hephaestus** only. Hermes / Athena / Argus kicks are instructed in the prompt.
- Hourly idempotency key: `cloud-factory-<slug>-<issue>-YYYYMMDDHH`.
