---
name: dev-ux-subagent
description: When and how Hephaestus wakes an Athena UX subagent on the current feature branch. Use after implementing UI-touching work, or when the Jira ticket has needs-ux-pass / impl-ux, before gate:mr.
---

# Dev → UX subagent kick (same feature branch)

Hephaestus **does** invoke Athena as a **Cursor Task subagent** when the ticket needs
UX polish. Work lands on the **same feature branch** Hephaestus already opened — not a
separate UX pilot branch and not a second Jira epic.

## When to kick (any one is enough)

1. Jira labels include **`needs-ux-pass`** or **`impl-ux`** (from grooming), **or**
2. Ticket **Primary surfaces** / scope mention UI paths (see detect), **or**
3. Current branch diff vs default branch touches UI globs (see detect).

**Do not kick** for pure backend, scripts-only, docs-only, or delivery-pipeline tickets
with no `components/` / `app/` UI.

## Detect helpers

```bash
# From dev-agent root — exit 0 = kick UX, 1 = skip
npx tsx scripts/should_kick_ux.ts <slug> [--labels a,b] [--surfaces "components/Foo.tsx,lib/x.ts"] [--diff]
```

`--diff` uses `git diff origin/<default>...HEAD` in `app.repo_path`.

UI globs (config `ux_kick.ui_path_globs` or defaults):
`components/`, `app/`, `lib/ui.ts`, `DESIGN.md`, `public/`, `*.css`, `*.module.css`.

## How to wake (mandatory shape)

Use the **Task** tool (`subagent_type: generalPurpose`) — there is no separate
`ux-design` subagent type. Prompt must include:

1. Role: **Athena / UX** — follow `ux-agent` skills `ux-impeccable`, `ux-phases`,
   `ux-jira` (read from ux-agent checkout path in host layout).
2. **Branch lock:** stay on current app branch `<branch>`; **do not** create
   `feat/ux-*` pilot or switch to `main`.
3. Ticket key, surfaces, charter: prefer `audit` / `polish` / `harden` / `critique`
   — avoid `craft` / `overdrive` / `delight` unless the ticket says so.
4. Freeze: routes, `data-testid`s, server actions behaviour unless the ticket owns them.
5. Deliverable: commit UX fixes on this branch (or leave a short note if nothing to change).
6. Return: list of files changed + residual risks.

Example Task description: `Athena UX pass RQ-XXXX`.

After the subagent returns: review diff, then continue **gate → mr:push** on the
**same** branch (Hephaestus owns MR/STG/handoff).

## Ordering in the ticket flow

```
pickup → branch → OpenSpec → implement feature
  → [UX subagent kick if should_kick_ux]
  → gate:mr → mr:push → …
```

Kick **after** the feature behaviour works; UX should not redesign unfinished flows.

## Labels after kick

- Keep `impl-dev` (Hephaestus still owns ship).
- `needs-ux-pass` may stay until Validate; optional comment: `UX subagent pass done on <branch>`.
- Do **not** file a separate UX-only child ticket for this in-branch pass (grooming
  already put UX intent on the feature ticket).

## Forbidden

- Nested redesign that opens a second app MR while this ticket's MR is open
- Deploying STG from a UX-only pilot
- Skipping UX kick when `needs-ux-pass` is present
- Treating empty UX subagent "nothing to do" as a failure — proceed to gate
- Leaving **shared Athena engine** edits (skills/scripts/rules) only local — if the
  UX/Hephaestus session changes common `ux-agent` engine files, open a **GitHub PR**
  on `ux-agent` in the same session (see ux-agent `PORTABILITY.md` dual delivery).
  Product UI stays on the app feature branch Bitbucket MR.
