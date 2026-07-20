# Human exceptions — <Project Name>

Tickets the **dev factory loop must never pick up** without human action.

## Label exclusions (always)

| Label | Owner |
|-------|-------|
| `impl-qa` | QA loop (qa-agent) |
| `human-required` | Human |
| `factory-pause` | Human |
| `needs-human` | Human |

## Issue key exclusions

List on-hold infra keys in `project.yaml` → `dev_factory.excluded_issue_keys`.

## QA defects

| Scenario | Labels | Dev factory? |
|----------|--------|--------------|
| QA auto-files code defect | `qa-agent`, `confirmed-defect`, **`impl-dev`** | Yes |
| QA auto-files env blocker | `qa-agent`, `stg`, no `impl-dev` | No — human |
| QA RETURN on shipped feature | comment `QA RETURN (` | Fix same or follow-on ticket |

`impl-dev` is required for dev-factory pickup; `qa-agent` alone does not enqueue dev work.
