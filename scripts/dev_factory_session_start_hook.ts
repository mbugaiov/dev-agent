/**
 * Cursor sessionStart hook — inject pending BACKLOG_WAKE only for factory sessions.
 * Interactive ambient chats get {} (no Argus / backlog injection).
 */
import { readFileSync } from "node:fs";
import {
  decideDevFactorySessionStart,
  resolveDevFactoryEngineRoot,
} from "../lib/devFactoryHookRuntime.ts";

type SessionStartInput = {
  session_id?: string;
  is_background_agent?: boolean;
  composer_mode?: string;
};

function readStdin(): SessionStartInput {
  try {
    const raw = readFileSync(0, "utf8");
    if (!raw.trim()) return {};
    return JSON.parse(raw) as SessionStartInput;
  } catch {
    return {};
  }
}

function main() {
  const engineRoot = resolveDevFactoryEngineRoot(process.cwd());
  if (!engineRoot) {
    console.log("{}");
    return;
  }
  const input = readStdin();
  console.log(
    JSON.stringify(
      decideDevFactorySessionStart(engineRoot, {
        isBackgroundAgent: Boolean(input.is_background_agent),
        factorySessionEnv: process.env.CURSOR_FACTORY_SESSION === "1",
      }),
    ),
  );
}

main();
