---
name: dev-qa-subagent
description: When and how Hephaestus wakes Argus (qa-agent) immediately after Validate/Testing handoff — isolated oneshot via ensure_argus, not ambient IDE hooks or in-chat Task.
---

# Dev → QA subagent kick (after handoff)

After **`post_jira_handoff.ts`** / **`post_github_handoff.ts`** succeeds, the ticket is in
`Validate/Testing` (or GitHub `validate-testing`). **Do not wait** for
`arm_qa_loop.sh` / the next `AGENT_LOOP_WAKE_<slug>qa` timer.

Handoff now **hard-kicks** Argus as an **isolated oneshot**:

1. Prints `QA_KICK_YES` + `QA_WAKE_EXECUTE` (via `fireQaHandoffKick` → qa-agent
   `qa_handoff_kick.ts` / pending write).
2. Writes qa-agent `.cursor/qa-pending-execute.json` (`consumed: false`).
3. Runs `qa-agent/scripts/ensure_argus.sh <slug> --ticket <KEY>` — detached
   `cursor-agent` oneshot (background session). Dedupes on
   `projects/<slug>/factory/argus-oneshot.pid`.
4. On `ARGUS_ONESHOT_ARMED` / `ALREADY_RUNNING`: auto-acks Hephaestus
   `.cursor/dev-factory-pending-argus-kick.json` (`consumed: true`).
5. Close/return scripts ack `qa-pending-execute` for that ticket so latches
   never stick and re-wake ambient chats.

**Forbidden:** workspace `sessionStart`/`stop` hooks injecting `ARGUS_KICK` into
personal or neighbor Composer sessions; spawning Argus as a Task inside those chats.

## Detect

```bash
# Prefer lines printed by handoff scripts:
#   QA_KICK_YES …
#   QA_WAKE_EXECUTE …
#   ARGUS_HARD_KICK_OK … "oneshot":"armed"
#   ARGUS_ONESHOT_ARMED …
#   ARGUS_KICK_ACK_OK … "via":"ensure_argus_oneshot"
```

## If oneshot skipped (no CURSOR_API_KEY / cursor-agent)

```bash
cd ../qa-agent   # or QA_AGENT_ROOT
bash scripts/ensure_argus.sh <slug> --ticket <KEY>
npx tsx scripts/ack_argus_kick.ts --ticket <KEY>
```

Do **not** paste `ARGUS_KICK_EXECUTE` into an ambient IDE chat as a substitute.

## Ordering

```
… → merge → STG buildId MATCH → post_*_handoff
  → QA_KICK_YES + QA_WAKE_EXECUTE + ensure_argus oneshot + ack latch
  → Hephaestus continues drain of impl-dev backlog (next ticket)
```

## Forbidden

- Ending handoff with only `GITHUB_HANDOFF_OK` and no ensure_argus attempt
- Injecting kick into personal/neighbor chats via hooks or paste
- Spawning Argus Task in the Hephaestus Composer session as the primary wake
- Leaving `qa-pending-execute` / `dev-factory-pending-argus-kick` unconsumed after PASS/RETURN
