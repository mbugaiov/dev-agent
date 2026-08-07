---
name: dev-ba-subagent
description: When and how Hephaestus wakes Hermes (ba-agent) for ba-spec-first before OpenSpec/implement. No human approval — BA_SPEC_READY after Hermes lint + skeptical review.
---

# Dev → BA subagent kick

Hephaestus invokes Hermes when the ticket has **`ba-spec-first`** and tracker
comments do **not** yet contain **`BA_SPEC_READY`**.

Order vs Athena:

```
ba-spec-first → Hermes → BA_SPEC_READY
  → [ux-charter-first → Athena → UX_CHARTER_READY]
  → OpenSpec apply + implement
```

## Script

```bash
npx tsx scripts/should_kick_ba.ts <slug> --labels <labels> --ticket <KEY>
# BA_KICK_YES → wake Hermes Task (ba-loop) on app repo / issue
# BA_KICK_NO + spec:ready → proceed
```

## Hermes contract (remind in kick prompt)

- **Before work:** post issue comment + chat banner:
  `### Hermes started` / **Ticket** / **Mode:** BA spec / **Doing:** …
  (Pantheon `FACTORY.md` → Agent start)
- Run Elicit → Model → Challenge → Specify → Validate → Publish
- **No human approve**
- Lint `validators/lint-requirements.ts` PASS
- Skeptical Blocking = None (or ASSUMPTION-### with testable default)
- Comment exact `BA_SPEC_READY` + change path

## Forbidden

- Implementing behaviour on `ba-spec-first` before `BA_SPEC_READY`
- Waiting for stakeholder sign-off inside the factory
- Skipping BA kick when label present and sentinel missing
