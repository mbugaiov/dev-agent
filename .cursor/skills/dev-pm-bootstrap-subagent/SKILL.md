---
name: dev-pm-bootstrap-subagent
description: When and how Hephaestus demuxes project-bootstrap parents — strip impl-dev, wake Chronos via ensure_chronos (not ambient Task), do not implement the epic.
---

# Dev → Chronos bootstrap demux

When a pickup ticket has **`project-bootstrap`** and tracker comments do **not**
yet contain **`WBS_READY`**, Hephaestus **must not implement**. Demux to Chronos.

```
project-bootstrap (+ impl-dev)
  → should_kick_bootstrap / demux_project_bootstrap
  → strip pickup (impl-dev)
  → ensure_chronos.sh (pm-agent) → Chronos pm-bootstrap
  → Hermes ba-wbs → WBS_DRAFT_READY → Chronos seeds children → WBS_READY
  → children carry impl-dev → normal Hephaestus drain
```

## Script (mandatory)

```bash
# Decide only
npx tsx scripts/should_kick_bootstrap.ts <slug> \
  --labels <comma-labels> --ticket <KEY>
# BOOTSTRAP_DEMUX_YES (exit 0) → demux; exit 1 → skip

# Full demux (strip + wake Chronos + ticket comment)
npx tsx scripts/demux_project_bootstrap.ts <slug> <KEY> \
  --labels <comma-labels>
# BOOTSTRAP_DEMUX_OK | BOOTSTRAP_DEMUX_PARTIAL | BOOTSTRAP_DEMUX_SKIP
```

Resolve Chronos checkout: `PM_AGENT_ROOT` → `project.yaml` `pm_kick.pm_agent_path` →
sibling `../pm-agent`.

## Ordering (before BA / UX / implement)

```
pickup
  → [if project-bootstrap && !WBS_READY: demux → next ticket]
  → [ba-spec-first …]
  → [ux-charter-first …]
  → implement …
```

After demux, **continue draining** other `impl-dev` tickets in the same oneshot.
Do **not** wait for WBS_READY on the parent.

## Forbidden

- Implementing a `project-bootstrap` parent as a single MR
- Leaving `impl-dev` on the parent after demux (Kairos re-arm loop)
- Spawning Chronos only as an ambient IDE Task when `ensure_chronos.sh` exists
- Touching Iris / telegram inbound as part of this path
