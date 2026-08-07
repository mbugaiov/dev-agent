---
name: dev-qa-subagent
description: When and how Hephaestus wakes Argus (qa-agent) immediately after Validate/Testing handoff — same pattern as Hermes/Athena kicks, not timer-only arm_qa_loop.
---

# Dev → QA subagent kick (after handoff)

After **`post_jira_handoff.ts`** / **`post_github_handoff.ts`** succeeds, the ticket is in
`Validate/Testing` (or GitHub `validate-testing`). **Do not wait** for
`arm_qa_loop.sh` / the next `AGENT_LOOP_WAKE_<slug>qa` timer.

Handoff now **hard-kicks** Argus:

1. Prints `QA_KICK_YES` + `QA_WAKE_EXECUTE` (via `fireQaHandoffKick` → qa-agent
   `qa_handoff_kick.ts` / pending write).
2. Writes qa-agent `.cursor/qa-pending-execute.json` (`consumed: false`).
3. Writes Hephaestus `.cursor/dev-factory-pending-argus-kick.json` — stop/session
   hooks force followup until `npx tsx scripts/ack_argus_kick.ts` runs.

Hephaestus **must** wake Argus in this session (Cursor **Task** subagent), same
as BA/UX kicks — unless `--no-kick` / operator explicitly deferred.

## Detect

```bash
# Prefer lines printed by handoff scripts:
#   QA_KICK_YES …
#   QA_WAKE_EXECUTE …
#   ARGUS_HARD_KICK_OK …

# Or:
npx tsx scripts/should_kick_qa.ts <slug> --ticket <KEY> --handoff-ok
# QA_KICK_YES → wake Argus; QA_KICK_NO → skip
```

## How to wake (mandatory shape)

Use the **Task** tool (`subagent_type: generalPurpose` or explore+shell as needed).
Prompt must include:

0. **Start banner (mandatory):** before scope/smoke, post issue + chat
   `### Argus started` / **Ticket** / **Mode:** STG retest / **Doing:** …
   (Pantheon `FACTORY.md` → Agent start).
1. Role: **Argus / QA** — skill **`qa-loop`** in **`qa-agent`** checkout
   (`../qa-agent` or `QA_AGENT_ROOT`). Project slug **`<slug>`** only.
2. Sentinel: **`QA_WAKE_EXECUTE`** / **`BACKLOG_WAKE_EXECUTE`** (or `QA_LOOP_ARMED` execute contract) —
   **no notify-only / status-only**.
3. First steps:
   - `cd <qa-agent-root>`
   - `npx tsx scripts/ack_qa_pending.ts` (or ack after first scope scan starts)
   - `eval "$(bash scripts/qa_scope.sh <slug> --log --shell)"`
   - Drain **all** `validate-testing` / Validate/Testing keys (not only the one
     just handed off), oldest first.
4. Per ticket: handoff parse → OpenSpec/TC → STG retest → evidence →
   **qa-verdict-review** → close (`github_close_issue.py` / `jira_close_issue.py`)
   or `QA RETURN`.
5. End with `backlog_drained` when scope count=0.
6. Hephaestus: `npx tsx scripts/ack_argus_kick.ts --ticket <KEY>` after Argus Task is spawned.

**Isolation:** never hit another product STG under this `<slug>` (one slug = one tenant).

## Ordering

```
… → merge → STG buildId MATCH → post_*_handoff
  → QA_KICK_YES + QA_WAKE_EXECUTE + pending latches
  → Task Argus (drain validate-testing) + ack_argus_kick
  → Hephaestus continues drain of impl-dev backlog (next ticket)
```

Hephaestus may start the **next** impl-dev ticket in parallel **after** spawning
the Argus Task (do not block the whole factory on QA), but **must not** skip the
kick or leave `dev-factory-pending-argus-kick.json` unconsumed.

## Forbidden

- Ending the handoff turn with only `GITHUB_HANDOFF_OK` / `HANDOFF_POSTED` and no Argus wake
- Assuming `arm_qa_loop.sh <slug>` is running (it may not be — timer wake is not required for the kick)
- Asking the human to decide whether QA should run — kick is mandatory after handoff
- Treating `QA_KICK_YES` as notify-only — hard kick + Task + ack are required
