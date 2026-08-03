/**
 * Cursor sessionStart hook — inject pending BACKLOG_WAKE_EXECUTE and/or Argus kick.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PENDING_EXECUTE_PATH,
  type PendingExecuteState,
} from "../lib/devFactoryExecution.ts";
import {
  PENDING_ARGUS_KICK_PATH,
  type PendingArgusKickState,
} from "../lib/argusKickPending.ts";

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

function readArgusPending(root: string): PendingArgusKickState | null {
  const path = join(root, PENDING_ARGUS_KICK_PATH);
  if (!existsSync(path)) return null;
  try {
    const state = JSON.parse(readFileSync(path, "utf8")) as PendingArgusKickState;
    return state.consumed ? null : state;
  } catch {
    return null;
  }
}

function main() {
  const root = process.cwd();
  const parts: string[] = [];
  const argus = readArgusPending(root);
  if (argus) {
    parts.push(
      `ARGUS KICK PENDING: ${argus.executePrompt} ` +
        `Do NOT end the session until Argus Task is spawned and ack_argus_kick.ts runs.`,
    );
  }
  const pending = readPending(root);
  if (pending) {
    parts.push(
      `DEV FACTORY EXECUTION PENDING: ${pending.executePrompt} ` +
        `Do NOT reply with status-only summaries while this file exists.`,
    );
  }
  if (!parts.length) {
    console.log("{}");
    return;
  }
  console.log(JSON.stringify({ additional_context: parts.join(" ") }));
}

main();
