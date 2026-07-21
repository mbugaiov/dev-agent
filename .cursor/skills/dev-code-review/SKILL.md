---
name: dev-code-review
description: Review dev-agent engine PRs before merge — pre_merge_check, cursor-agent review with blocking gate, portability and project isolation. Use before opening an engine PR or when the user asks for code review on dev-agent.
---

# Dev Agent engine — code review

## When to use

- Before opening a PR on **dev-agent** (engine repo)
- After editing `lib/`, `scripts/`, `.cursor/`, `tests/`, `.github/`
- User asks "review my changes" / "CR this branch"

**Not this skill:**

- **Product / app MRs** — use the **app repo** CR pipeline (`code-review.mdc`, `check_review_gate.sh` there)
- **`review-bugbot` / `review-security`** — Cursor subagents on local diffs (optional locally)

## Step 1 — Automated gates (blocking)

From engine root:

```bash
bash scripts/pre_merge_check.sh
```

Runs:

1. `tests/run_tests.sh` — scaffold + vitest
2. `scripts/portability_check.sh`
3. `scripts/projects_isolation_check.sh`
4. `scripts/check_review_gate_fixtures.sh`

## Step 2 — Agent review (PR / local)

### On GitHub PRs

Workflow `.github/workflows/code-review.yml` runs when `CURSOR_API_KEY` is configured.
When **CI** (`test`) and **Code Review** (`review`) both succeed, `.github/workflows/auto-merge.yml`
squash-merges the PR (same policy as LRM Bitbucket auto-merge).

1. Runs `cursor-agent` with `.cursor/rules/code-review.mdc`
2. Writes `review.md` and posts PR comment
3. Fails if `scripts/check_review_gate.sh` finds blockers

Enable: GitHub repo → Settings → Secrets → `CURSOR_API_KEY`.

### Local (same policy as CI)

```bash
export CURSOR_API_KEY=crsr_…
bash scripts/run_code_review.sh main
```

Review draft only (no agent):

```bash
bash scripts/check_review_gate.sh path/to/draft.md
bash scripts/check_review_gate_fixtures.sh
```

## Step 3 — Diff-aware checklist

- [ ] Only `projects/_template/` under `projects/` in diff
- [ ] No product names, real Jira keys, STG hosts in engine files
- [ ] No `.secrets/` except `*.example`
- [ ] New behavior has vitest or `run_tests.sh` coverage
- [ ] `AGENTS.md` updated if skills/workflows changed

## Step 4 — Factory app MRs (delegation)

When the dev factory opens MRs in the **application repo**, CR runs **there** — not via this skill:

- App: `preflight-review.mdc` before push
- App CI: Cursor review + `check_review_gate.sh`
- Dev-agent `dev-mr-pipeline`: wait until pipeline green + review clear before merge

## Output format (reporting to user)

```markdown
## Code review — dev-agent

**Gates:** pass / fail
**Review gate:** pass / blocked
**Findings:** N block · N suggest

| Severity | Location | Finding |
|----------|----------|---------|
| Block | lib/foo.ts:12 | … |

**Verdict:** merge-ready / needs fixes
```

## PR readiness

1. `bash scripts/pre_merge_check.sh` green locally
2. GitHub CI green (`ci.yml` + `code-review.yml` when secret configured)
3. PR template checklist complete (`.github/pull_request_template.md`)

## Not in scope

- Reviewing **application product code** — app repo CR pipeline
- Jira handoff / STG verify — skills `dev-jira`, `dev-mr-pipeline`
