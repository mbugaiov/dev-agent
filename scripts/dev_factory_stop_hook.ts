/**
 * Cursor stop hook — force drain when BACKLOG_WAKE ended without starting work.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PENDING_EXECUTE_PATH,
  shouldForceDrainFollowup,
  type PendingExecuteState,
} from "../lib/devFactoryExecution.ts";
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

function readPending(root: string): PendingExecuteState | null {
  const path = join(root, PENDING_EXECUTE_PATH);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PendingExecuteState;
  } catch {
    return null;
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
    const out = execSync("git status --porcelain", {
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
  if (input.status !== "completed") {
    console.log("{}");
    return;
  }

  const engineRoot = process.cwd();
  const slug = process.env.DEV_AGENT_SLUG ?? "";
  if (!slug) {
    console.log("{}");
    return;
  }

  let config;
  try {
    config = loadProjectConfig(engineRoot, slug);
  } catch {
    console.log("{}");
    return;
  }

  const appRoot = resolveAppRoot(engineRoot, config);
  const gitCwd = existsSync(join(appRoot, ".git")) ? appRoot : engineRoot;

  const decision = shouldForceDrainFollowup({
    pending: readPending(engineRoot),
    currentBranch: gitBranch(gitCwd),
    hasWorkingTreeChanges: hasWorkingTreeChanges(gitCwd),
    hasOpenPr: hasOpenPr(appRoot),
    loopCount: input.loop_count ?? 0,
    git: config.git,
  });

  if (decision.force) {
    console.log(JSON.stringify({ followup_message: decision.message }));
  } else {
    console.log("{}");
  }
}

main();
