/**
 * Cursor sessionStart hook — inject pending BACKLOG_WAKE_EXECUTE contract.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PENDING_EXECUTE_PATH,
  type PendingExecuteState,
} from "../lib/devFactoryExecution.ts";

function readPending(root: string): PendingExecuteState | null {
  const path = join(root, PENDING_EXECUTE_PATH);
  if (!existsSync(path)) return null;
  try {
    const state = JSON.parse(readFileSync(path, "utf8")) as PendingExecuteState;
    return state.consumed ? null : state;
  } catch {
    return null;
  }
}

function main() {
  const pending = readPending(process.cwd());
  if (!pending) {
    console.log("{}");
    return;
  }
  console.log(
    JSON.stringify({
      additional_context:
        `DEV FACTORY EXECUTION PENDING: ${pending.executePrompt} ` +
        `Do NOT reply with status-only summaries while this file exists.`,
    }),
  );
}

main();
