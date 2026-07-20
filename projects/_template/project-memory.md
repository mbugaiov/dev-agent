# <Project Name> — dev factory memory

Created: <date>
Slug: `<slug>`
Epic: `<EPIC-KEY>`

## Active loop

- **Purpose:** `<slug>dev`
- **Interval:** 300s default
- **Arm script:** `bash scripts/arm_dev_loop.sh <slug>`

## App repo

- Path: see `project.yaml` → `app.repo_path`
- Gate: `app.gate_command`
- OpenSpec: enabled when `app.openspec_enabled`

## Human exceptions

Document project-specific exclusions in `docs/HUMAN-EXCEPTIONS.md`.

## Run history

(Appended after each factory session — tickets shipped, blockers, QA RETURN notes.)
