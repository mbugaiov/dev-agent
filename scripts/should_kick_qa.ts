#!/usr/bin/env npx tsx
/**
 * After Validate/Testing handoff — should Hephaestus wake Argus now?
 *
 *   npx tsx scripts/should_kick_qa.ts <slug> --ticket <KEY> --handoff-ok
 *   npx tsx scripts/should_kick_qa.ts <slug> --ticket <KEY> --handoff-ok --no-kick
 *
 * Exit 0 + QA_KICK_YES → spawn Task (skill dev-qa-subagent). Exit 1 + QA_KICK_NO → skip.
 */
import { resolveQaHandoffKick, QA_KICK_NO, QA_KICK_YES } from "../lib/qaSubagentKick.ts";

const args = process.argv.slice(2);
const slug = args[0];
if (!slug || slug.startsWith("-")) {
  console.error(
    "Usage: should_kick_qa.ts <slug> --ticket <KEY> [--handoff-ok] [--no-kick]",
  );
  process.exit(2);
}

let ticket = "";
let handoffOk = false;
let suppress = false;
for (let i = 1; i < args.length; i++) {
  const a = args[i];
  if (a === "--ticket") ticket = args[++i] ?? "";
  else if (a === "--handoff-ok") handoffOk = true;
  else if (a === "--no-kick") suppress = true;
}

const result = resolveQaHandoffKick({ handoffOk, suppress });
const payload = {
  slug,
  ticket: ticket || null,
  kick: result.kick,
  reasons: result.reasons,
};

if (result.kick) {
  console.log(QA_KICK_YES);
  console.log(JSON.stringify(payload));
  console.log(
    `ARGUS_KICK → wake qa-agent for ${slug}` +
      (ticket ? ` (oldest/focus ${ticket})` : "") +
      " — skill dev-qa-subagent / BACKLOG_WAKE_EXECUTE",
  );
  process.exit(0);
}

console.log(QA_KICK_NO);
console.log(JSON.stringify(payload));
process.exit(1);
