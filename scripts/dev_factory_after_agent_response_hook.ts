/**
 * Cursor afterAgentResponse — arm `/summarize` latch when oneshot drain markers appear.
 * stdin: { text: string }
 * stdout: {}
 */
import { readFileSync } from "node:fs";
import {
  resolveDevFactoryEngineRoot,
  writePendingSummarize,
  readPendingSummarize,
} from "../lib/devFactoryHookRuntime.ts";
import {
  buildPendingSummarizeState,
  shouldArmSummarizeFromAgentText,
} from "../lib/summarizePending.ts";

function readStdin(): { text?: string } {
  try {
    const raw = readFileSync(0, "utf8");
    if (!raw.trim()) return {};
    return JSON.parse(raw) as { text?: string };
  } catch {
    return {};
  }
}

function main() {
  const input = readStdin();
  const text = input.text ?? "";
  const engineRoot = resolveDevFactoryEngineRoot(process.cwd());
  if (!engineRoot || !shouldArmSummarizeFromAgentText(text)) {
    console.log("{}");
    return;
  }
  const existing = readPendingSummarize(engineRoot);
  if (existing && !existing.consumed) {
    console.log("{}");
    return;
  }
  writePendingSummarize(
    engineRoot,
    buildPendingSummarizeState({ reason: "agent_done_marker" }),
  );
  console.log("{}");
}

main();
