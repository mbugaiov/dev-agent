---
name: dev-ux-subagent
description: When and how Hephaestus wakes an Athena UX subagent on the current feature branch — Mode B charter before implement (ux-charter-first), or Mode A polish after implement (needs-ux-pass / UI). Uses upgraded Athena pipeline.
---

# Dev → UX subagent kick (same feature branch)

Hephaestus **does** invoke Athena as a **Cursor Task subagent** when the ticket needs
UX. Work lands on the **same feature branch** Hephaestus already opened — not a
separate UX pilot branch and not a second Jira epic.

Athena pipeline (in **ux-agent** repo: `docs/UX-PIPELINE.md`, not this repo):
architect → DESIGN.md → visual direction → browser → UI rules → a11y → **Impeccable last**.

## Two phases

| Phase | Label / signal | When | Athena mode | Notify `--mode` |
|-------|----------------|------|-------------|-----------------|
| **Charter** | `ux-charter-first` and no tracker `UX_CHARTER_READY` | **Before** feature UI implement | Mode B — architect + direction + freeze | `charter` |
| **Polish** | `needs-ux-pass` / `impl-ux` / UI surfaces or diff | **After** feature behaviour works | Mode A — browser → rules → a11y → Impeccable | `hephaestus-kick` |

Detect helpers:

```bash
# Before implement — charter gate
npx tsx scripts/should_kick_ux.ts <slug> \
  --labels <ticket-labels> --surfaces "…" \
  --when before-implement --ticket <KEY>
# UX_KICK_YES + phase charter → wake Athena Mode B; do NOT implement UI yet
# UX_KICK_NO + charter:ready → proceed to implement

# After implement — polish gate (default --when after-implement)
npx tsx scripts/should_kick_ux.ts <slug> \
  --labels <ticket-labels> --surfaces "…" --diff
```

`--ticket` loads comments (Jira or GitHub Issues per `tracker.provider`) and looks for
sentinel **`UX_CHARTER_READY`**.  
Or pass `--charter-ready` when the charter comment is already known.

UI globs (config `ux_kick.ui_path_globs` or defaults):
`components/`, `app/`, `lib/ui.ts`, `DESIGN.md`, `public/`, `*.css`, `*.module.css`.

## Ordering in the ticket flow

```
pickup → branch → OpenSpec shell
  → [if ux-charter-first && !UX_CHARTER_READY: Athena Mode B charter]
  → implement feature (from charter when present)
  → [if should_kick_ux after-implement: Athena Mode A polish]
  → gate:mr → mr:push → …
```

**Forbidden:** implementing UI for a `ux-charter-first` ticket before `UX_CHARTER_READY`
appears on the tracker ticket (Jira or GitHub Issue comment from Athena or human).

## How to wake (mandatory shape)

**Before** spawning the Task, notify Teams:

```bash
npx tsx scripts/notify_ux_kick.ts <slug> \
  --ticket <KEY> --branch <feature-branch> \
  --surfaces 'components/…,lib/ui.ts' \
  --mode charter            # or hephaestus-kick for polish
```

Then use the **Task** tool (`subagent_type: generalPurpose`). Prompt must include:

**Start banner (mandatory):** Athena posts `### Athena started` on the issue **and**
in chat before Mode B/A work (`**Ticket**` / `**Mode:** Mode B charter|Mode A polish` /
`**Doing:** …`). See Pantheon `FACTORY.md` → Agent start.

### Mode B — charter (`ux-charter-first`, before implement)

1. Role: **Athena / UX** — skills `ux-loop` Mode B, `ux-phases`, `ux-architect`,
   `ux-visual-direction`, `ux-browser-review`, `ux-jira`. Read **ux-agent**
   `docs/UX-PIPELINE.md` (path under `ux_kick.ux_agent_path`).
2. **Branch lock:** stay on current app branch; prefer **no product code commits**
   unless the ticket explicitly asks for a pilot implement.
3. **DESIGN.md:** if it marks prior direction failed / not accepted, propose **new**
   directions — do not polish the failed look.
4. Deliverable: architect + chosen visual direction + freeze; baseline screenshots for
   first-viewport redesigns; post tracker comment with exact sentinel **`UX_CHARTER_READY`**
   (`gh issue comment` when `tracker.provider=github_issues`, else Jira); write run folder
   under ux-agent `projects/<slug>/runs/…`.
5. Do **not** add/remove `impl-dev`. Leave `ux-charter-first` on the ticket.
6. Return: path to `run.md` + summary for Hephaestus implement.

### Mode A — polish (after implement)

1. Role: **Athena / UX** — `ux-loop` Mode A, `ux-phases`, `ux-browser-review`,
   `ux-ui-rules-review`, `ux-a11y-review`, `ux-impeccable` (**last**), `ux-jira`.
2. **Branch lock:** stay on current app branch; **do not** create `feat/ux-*` pilot.
3. Order: browser screenshots → UI rules → a11y → Impeccable `audit|polish|harden|critique`.
   Avoid `craft` / `overdrive` / `delight`.
4. Freeze: routes, `data-testid`s, server actions unless the ticket owns them.
5. Deliverable: commit UX fixes on this branch (or note if nothing to change) + screenshot paths.
6. Return: list of files changed + residual risks.

Example Task descriptions: `Athena charter …` / `Athena UX pass …`.

After charter returns: re-run `should_kick_ux … --when before-implement --ticket KEY`
until `UX_KICK_NO` with `charter:ready`, then **implement**.  
After polish returns: continue **gate → mr:push** (Hephaestus owns MR/STG/handoff).

## Labels

| Label | Meaning |
|-------|---------|
| `impl-dev` | Hephaestus factory pickup (keep) |
| `ux-charter-first` | Design-first: charter before implement |
| `needs-ux-pass` / `impl-ux` | Polish kick after implement |

Do **not** file a separate UX-only child for the in-branch pass.

## Forbidden

- Skipping charter kick when `ux-charter-first` is present and charter is not ready
- Implementing UI before `UX_CHARTER_READY` on a `ux-charter-first` ticket
- Skipping polish kick when `needs-ux-pass` / `impl-ux` is present after implement
- Asking Athena to “just Impeccable” a failed redesign without Mode B architect
- Nested redesign that opens a second app MR while this ticket's MR is open
- Deploying STG from a UX-only pilot
- Leaving **shared Athena / Hephaestus engine** edits only local — open a **GitHub PR**
  on `ux-agent` when Athena skills/docs change, and on `dev-agent` when kick/factory
  skills change (see each engine `PORTABILITY.md`)
