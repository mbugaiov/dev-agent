/**
 * Cursor stop hook — force drain followup for factory sessions
 * (oneshot `/summarize` latch + unconsumed execute pending).
 *
 * Must work from the workspace root (`<workspace>/`) without DEV_AGENT_SLUG.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decideDevFactoryStopHook,
  readPendingExecute,
  resolveDevFactoryEngineRoot,
  resolveHookSlug,
} from "../lib/devFactoryHookRuntime.ts";
import { loadProjectConfig, resolveAppRoot } from "../lib/loadProject.ts";

type StopHookInput = {
  status?: "completed" | "aborted" | "error";
  loop_count?: number;
};

function readStdin(): StopHookInput {
  try {
    const raw = readFileSync(0, "utf8");
    if (!raw.trim()) return { status: "completed", loop_count: 0 };
    return JSON.parse(raw) as StopHookInput;
  } catch {
    return { status: "completed", loop_count: 0 };
  }
}

function gitBranch(cwd: string): string {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      cwd,
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

function hasWorkingTreeChanges(cwd: string): boolean {
  try {
    // Untracked leftovers (.themis-agent/, docs) must not block latch recovery.
    const out = execSync("git status --porcelain --untracked-files=no", {
      cwd,
      encoding: "utf8",
    }).trim();
    return out.length > 0;
  } catch {
    return false;
  }
}

function hasOpenPr(appRoot: string): boolean {
  const script = join(appRoot, "scripts/resolve_pr_id.ts");
  if (!existsSync(script)) return false;
  try {
    execSync("npx tsx scripts/resolve_pr_id.ts", {
      cwd: appRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

function main() {
  const input = readStdin();
  const engineRoot = resolveDevFactoryEngineRoot(process.cwd());
  if (!engineRoot) {
    console.log("{}");
    return;
  }

  const pending = readPendingExecute(engineRoot);
  const slug = resolveHookSlug({
    engineRoot,
    pending,
    envSlug: process.env.DEV_AGENT_SLUG,
  });

  let currentBranch = "";
  let workingTree = false;
  let openPr = false;
  if (slug) {
    try {
      const config = loadProjectConfig(engineRoot, slug);
      const appRoot = resolveAppRoot(engineRoot, config);
      const gitCwd = existsSync(join(appRoot, ".git")) ? appRoot : engineRoot;
      currentBranch = gitBranch(gitCwd);
      workingTree = hasWorkingTreeChanges(gitCwd);
      openPr = hasOpenPr(appRoot);
    } catch {
      /* decideDevFactoryStopHook still forces from the latch */
    }
  }

  const decision = decideDevFactoryStopHook({
    engineRoot,
    status: input.status ?? "completed",
    loopCount: input.loop_count ?? 0,
    envSlug: process.env.DEV_AGENT_SLUG,
    currentBranch,
    hasWorkingTreeChanges: workingTree,
    hasOpenPr: openPr,
    pending,
    factorySession: process.env.CURSOR_FACTORY_SESSION === "1",
  });
  console.log(JSON.stringify(decision));
}

main();
