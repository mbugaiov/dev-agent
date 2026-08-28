/**
 * Bounded PR pipeline poll for cursor-agent oneshot.
 * Exit 0 = green, 1 = failed, 3 = still pending (re-invoke). Never rely on Await regex.
 *
 * Usage:
 *   npx tsx scripts/follow_pr_pipeline_chunk.ts <slug> <PR> [--max-sec 75] [--poll 15]
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectConfig, resolveAppRoot } from "../lib/loadProject.ts";
import {
  writePrPipelineResultLatch,
  type PrPipelineResultLatch,
} from "../lib/prPipelineLatch.ts";
import {
  CHUNK_EXIT,
  classifyRequiredChecks,
  type PipelineOutcome,
} from "../lib/prPipelineStatus.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function usage(): never {
  console.error(
    "Usage: follow_pr_pipeline_chunk.ts <slug> <PR> [--max-sec 75] [--poll 15]",
  );
  process.exit(CHUNK_EXIT.usage);
}

const slug = process.argv[2] ?? "";
const prRaw = process.argv[3] ?? "";
if (!/^[a-z0-9][a-z0-9-]*$/.test(slug) || !/^\d+$/.test(prRaw)) usage();
const pr = Number(prRaw);

let maxSec = 75;
let pollSec = 15;
for (let i = 4; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === "--max-sec") maxSec = Number(process.argv[++i]);
  else if (a === "--poll") pollSec = Number(process.argv[++i]);
  else usage();
}
if (!Number.isFinite(maxSec) || maxSec < 5) maxSec = 75;
if (!Number.isFinite(pollSec) || pollSec < 5) pollSec = 15;

function loadGithubRepo(slugName: string): string {
  const cfg = loadProjectConfig(ROOT, slugName);
  const ws = cfg.git?.workspace;
  const repo = cfg.git?.repo;
  if (ws && repo) return `${ws}/${repo}`;
  throw new Error("git.workspace/repo missing in project.yaml");
}

function defaultRequired(): string[] {
  return ["test", "review (Themis)", "isolation (Themis)"];
}

function fetchChecks(
  repo: string,
  prNum: number,
): Record<string, string> {
  const raw = execFileSync(
    "gh",
    [
      "pr",
      "checks",
      String(prNum),
      "-R",
      repo,
      "--json",
      "name,bucket,state",
    ],
    { encoding: "utf8", timeout: 60_000 },
  );
  const data = JSON.parse(raw || "[]") as Array<{
    name?: string;
    bucket?: string;
    state?: string;
  }>;
  const out: Record<string, string> = {};
  for (const row of data) {
    const name = (row.name || "").trim();
    if (!name) continue;
    out[name] = String(row.bucket || row.state || "");
  }
  return out;
}

function writeLatch(
  outcome: "failed" | "green",
  repo: string,
  reason?: string,
): void {
  const path = join(
    ROOT,
    "projects",
    slug,
    "factory",
    "pr-pipeline.result.json",
  );
  const latch: PrPipelineResultLatch = {
    pr,
    repo,
    outcome,
    at: new Date().toISOString(),
    reason,
  };
  writePrPipelineResultLatch(path, latch);
}

function postProgress(milestone: string, detail: string): void {
  try {
    execFileSync(
      "bash",
      [
        join(ROOT, "scripts/lib/post_progress_best_effort.sh"),
        slug,
        milestone,
        detail,
      ],
      { stdio: "ignore", timeout: 30_000 },
    );
  } catch {
    /* best effort */
  }
}

function followupsDisposed(repo: string, prNum: number): boolean {
  const cfg = loadProjectConfig(ROOT, slug);
  const appRoot = resolveAppRoot(ROOT, cfg);
  const script = join(appRoot, "scripts/check_review_followups_disposed.sh");
  if (!existsSync(script)) {
    const engine = join(ROOT, "scripts/check_review_followups_disposed.sh");
    if (!existsSync(engine)) return true;
    try {
      execFileSync("bash", [engine, String(prNum)], {
        encoding: "utf8",
        timeout: 120_000,
        env: { ...process.env, THEMIS_FOLLOWUP_REPO: repo },
        cwd: ROOT,
      });
      return true;
    } catch {
      return false;
    }
  }
  try {
    execFileSync("bash", [script, String(prNum)], {
      encoding: "utf8",
      timeout: 120_000,
      env: { ...process.env, THEMIS_FOLLOWUP_REPO: repo },
      cwd: appRoot,
    });
    return true;
  } catch {
    return false;
  }
}

const repo = loadGithubRepo(slug);
const required = defaultRequired();
const deadline = Date.now() + maxSec * 1000;

console.log(
  `FOLLOW_PR_CHUNK {"slug":"${slug}","pr":${pr},"repo":"${repo}","maxSec":${maxSec},"pollSec":${pollSec}}`,
);
postProgress(
  "pipeline_waiting",
  `PR #${pr} — follow_pr_pipeline_chunk (max ${maxSec}s)`,
);

let lastOutcome: PipelineOutcome = "pending";
while (Date.now() < deadline) {
  let byName: Record<string, string> = {};
  try {
    byName = fetchChecks(repo, pr);
  } catch (err) {
    console.log(
      `check fetch error: ${err instanceof Error ? err.message : String(err)}`,
    );
    lastOutcome = "pending";
  }
  for (const name of required) {
    console.log(`${name}\t${byName[name] || "missing"}`);
  }
  console.log("---");
  const classified = classifyRequiredChecks(required, byName);
  lastOutcome = classified.outcome;

  if (classified.outcome === "failed") {
    writeLatch("failed", repo, `failed:${classified.failed.join(",")}`);
    console.log(`PR_PIPELINE_FAILED ${JSON.stringify({ pr, repo })}`);
    postProgress(
      "pipeline_failed",
      `PR #${pr} — required check failed (${classified.failed.join(", ")})`,
    );
    process.exit(CHUNK_EXIT.failed);
  }

  if (classified.outcome === "green") {
    if (!followupsDisposed(repo, pr)) {
      writeLatch("failed", repo, "followups_undisposed");
      console.log(
        `PR_PIPELINE_FAILED ${JSON.stringify({ pr, repo, reason: "followups_undisposed" })}`,
      );
      postProgress(
        "pipeline_failed",
        `PR #${pr} — Themis follow-ups undisposed`,
      );
      process.exit(CHUNK_EXIT.failed);
    }
    writeLatch("green", repo);
    console.log(`PR_PIPELINE_GREEN ${JSON.stringify({ pr, repo })}`);
    postProgress("pipeline_green", `PR #${pr} — pipeline green`);
    process.exit(CHUNK_EXIT.green);
  }

  const remaining = deadline - Date.now();
  if (remaining <= 0) break;
  const sleepMs = Math.min(pollSec * 1000, remaining);
  execFileSync("sleep", [String(Math.ceil(sleepMs / 1000))], {
    stdio: "ignore",
  });
}

console.log(
  `PR_PIPELINE_PENDING ${JSON.stringify({ pr, repo, outcome: lastOutcome })}`,
);
console.log(
  "FOLLOW_PR_CHUNK_PENDING — re-invoke follow_pr_pipeline_chunk.sh (do not Await regex)",
);
process.exit(CHUNK_EXIT.pending);
