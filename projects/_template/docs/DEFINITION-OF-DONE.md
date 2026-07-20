# Dev handoff gate — <Project Name>

Machine Definition of Done for the **dev agent** before moving tickets to **Validate/Testing**.

## Dev agent MAY hand off when

1. MR merged; pipeline green; blocking review resolved.
2. STG buildId matches merge commit (`scripts/check_stg_build.sh <slug>`).
3. No unresolved **QA RETURN** after the last dev handoff (`lib/jiraCommentGate.ts`).
4. Handoff comment includes: PR link, pipeline build #, STG buildId, acceptance steps.
5. Feature work stays out of **Done** — QA agent owns closure.

## Drain policy

One open MR at a time; many tickets per tick when backlog exists. After handoff,
Next: re-run dev factory JQL and start the next ticket immediately (same session).

## Dev agent MUST NOT

- Move feature tickets to **Done**.
- Hand off while STG lags `main` without STG retest comment (`--kind stg-retest`).
- Override QA RETURN by drift-triaging to Validate/Testing.

## JQL

See `project.yaml` → `dev_factory` block. Built at runtime by `lib/projectConfig.ts`.

## QA pairing

QA loop runs in **qa-agent** (`projects/<slug>/`). Dev respects QA RETURN and follow-on
`Dev ticket: <KEY>` routing from `dev_factory_tick`.
