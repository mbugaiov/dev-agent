---
name: dev-jira
description: Jira transitions, handoff comments, QA RETURN gates, and Validate/Testing handoff for dev-agent. Use before post_jira_handoff, when QA RETURN blocks handoff, or for STG retest comments.
---

# Dev Jira (handoff + gates)

All commands run from **dev-agent root** with project slug `<slug>`.
Load config from `projects/<slug>/project.yaml`; secrets from `.secrets/jira.env`.

## Ticket pickup (before branching)

Run on every backlog wake:

```bash
bash scripts/pickup_jira_ticket.sh <slug> <KEY> \
  --scope "Scope: … OpenSpec: … Gate: …" \
  --points 2
```

| Step | Script behavior |
|------|-------------------|
| Transition | To Do → In Progress when `jira.transitions.in_progress` set |
| Assign | When unassigned and `jira.pickup.assignee_account_id` set |
| Estimate | Fills **empty** story-point fields + original estimate only |
| Scope | Posts `--scope` comment |

Requires `jira.pickup` in `project.yaml` (field ids, assignee). Creds: `.secrets/jira.env`.

Factory JQL (tick): `bash scripts/dev_factory_tick.sh <slug>`. Follow-on routing: QA
comments with `Dev ticket: <KEY>` — see `planBacklogWithFollowOns()` in
`lib/jiraCommentGate.ts`.

## Before every Validate/Testing handoff

```bash
npx tsx scripts/preflight_jira_handoff.ts <slug> <KEY>
```

| Exit | Meaning | Agent action |
|------|---------|--------------|
| 0 | No blocking QA RETURN | Proceed to post handoff |
| 1 | QA RETURN unresolved | Fix in app repo, merge, **new** handoff — do not transition |

## Post handoff comment (+ optional transition)

```bash
npx tsx scripts/post_jira_handoff.ts <slug> <KEY> \
  --pr-url "<merged PR URL>" \
  --pipeline-build <build#> \
  --stg-build-id <sha> \
  --main-commit <sha> \
  --summary "<what was implemented>" \
  --acceptance-step "<step 1>" \
  --acceptance-step "<step 2>" \
  --transition
```

**Dry run** (validate template only):

```bash
npx tsx scripts/post_jira_handoff.ts <slug> <KEY> ... --dry-run
```

### STG retest (after QA RETURN asking for merge SHA)

```bash
npx tsx scripts/post_jira_handoff.ts <slug> <KEY> \
  ... \
  --kind stg-retest \
  --feature-commit <feature-merge-sha> \
  --follow-on "<note about follow-on main commits>" \
  --transition
```

Transition ID: `project.yaml` → `jira.transitions.validate_testing` (default `"51"`).
Override via env `JIRA_VALIDATE_TESTING_TRANSITION`.

## Handoff comment requirements

Validated by `handoffCommentValid()` in `lib/projectConfig.ts`:

- Merged PR URL (matches `git` config in project.yaml)
- `Pipeline build: #<number>`
- `STG buildId: <hash> (main <hash>)`
- Drain reminder line (auto-appended)

## QA RETURN detection

Pure logic: `lib/jiraCommentGate.ts`

- `qaReturnBlocksValidateTesting()` — preflight gate
- `mayTransitionAfterHandoffPost()` — latest comment must be dev handoff, not QA RETURN
- `qaNeedsStgRetestHandoff()` — comment text signals STG retest needed

## Forbidden

- Move feature tickets to **Done** (qa-agent owns closure)
- Transition to Validate/Testing while QA RETURN is latest unresolved gate
- Hand off without STG buildId match (`scripts/check_stg_build.sh`)
