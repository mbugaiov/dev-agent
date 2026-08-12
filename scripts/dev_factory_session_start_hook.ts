/**
 * Cursor sessionStart hook — inject pending BACKLOG_WAKE_EXECUTE and/or Argus kick.
 * Resolves the engine from the workspace root; does not need DEV_AGENT_SLUG.
 */
import {
  decideDevFactorySessionStart,
  resolveDevFactoryEngineRoot,
} from "../lib/devFactoryHookRuntime.ts";

function main() {
  const engineRoot = resolveDevFactoryEngineRoot(process.cwd());
  if (!engineRoot) {
    console.log("{}");
    return;
  }
  console.log(JSON.stringify(decideDevFactorySessionStart(engineRoot)));
}

main();
