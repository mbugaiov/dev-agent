/**
 * Cloud factory wake entrypoint.
 * Usage: npx tsx scripts/cloud_factory_wake.ts <slug> [--dry-run]
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, CursorAgentError } from "@cursor/sdk";
import { loadProjectConfig } from "../lib/loadProject.ts";
import {
  isCloudFactoryEnabled,
  planCloudWake,
  parseTickStdout,
} from "../lib/cloudFactoryWake.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith("-")) ?? process.env.DEV_AGENT_SLUG ?? "";
const dryRun =
  args.includes("--dry-run") ||
  process.env.CLOUD_FACTORY_DRY_RUN === "1" ||
  process.env.CLOUD_FACTORY_DRY_RUN === "true";

if (!slug) {
  console.error("Usage: cloud_factory_wake.ts <slug> [--dry-run]");
  process.exit(1);
}

// Default OFF — refuse tick/spawn until CLOUD_FACTORY_ENABLED=true|1|yes
if (!isCloudFactoryEnabled()) {
  console.log(
    'CLOUD_FACTORY_DISABLED {"reason":"CLOUD_FACTORY_ENABLED is not true","hint":"Set repo variable or env CLOUD_FACTORY_ENABLED=true to enable"}',
  );
  process.exit(0);
}

const config = loadProjectConfig(ROOT, slug);

function runTick(): string {
  return execFileSync("bash", ["scripts/dev_factory_tick.sh", slug], {
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function main() {
  let stdout: string;
  try {
    stdout = runTick();
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    stdout = String(e.stdout ?? "");
    const stderr = String(e.stderr ?? "");
    console.error("CLOUD_FACTORY_TICK_FAILED", e.message ?? err);
    if (stderr) console.error(stderr);
    if (stdout) process.stdout.write(stdout);
    process.exit(1);
  }

  // Surface tick lines for Actions logs / notify_on_output compatibility
  process.stdout.write(stdout.endsWith("\n") ? stdout : `${stdout}\n`);

  const parsed = parseTickStdout(stdout);
  const plan = planCloudWake({ parsed, config, dryRun });

  console.log(
    `CLOUD_FACTORY_PLAN ${JSON.stringify({
      action: plan.action,
      ...(plan.action === "idle" || plan.action === "skip"
        ? { reason: plan.reason, tickLine: plan.tickLine }
        : {
            issueKey: plan.issueKey,
            idempotencyKey: plan.idempotencyKey,
            repos: plan.repos.map((r) => r.url),
            dryRun: plan.action === "dry_run",
          }),
    })}`,
  );

  if (plan.action === "idle" || plan.action === "skip") {
    process.exit(0);
  }

  if (plan.action === "dry_run") {
    console.log("CLOUD_FACTORY_DRY_RUN prompt follows:");
    console.log(plan.prompt);
    process.exit(0);
  }

  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    console.error(
      "CLOUD_FACTORY_SPAWN_FAILED CURSOR_API_KEY is required (or pass --dry-run)",
    );
    process.exit(1);
  }

  try {
    const result = await Agent.prompt(plan.prompt, {
      apiKey,
      model: { id: process.env.CLOUD_FACTORY_MODEL?.trim() || "composer-2.5" },
      idempotencyKey: plan.idempotencyKey,
      cloud: {
        repos: plan.repos,
        autoCreatePR: false,
        skipReviewerRequest: true,
      },
    });

    console.log(
      `CLOUD_FACTORY_SPAWNED ${JSON.stringify({
        status: result.status,
        result: result.result ?? null,
        runId: result.id ?? null,
      })}`,
    );

    if (result.status === "error") {
      process.exit(2);
    }
  } catch (err) {
    if (err instanceof CursorAgentError) {
      console.error(
        `CLOUD_FACTORY_SPAWN_FAILED ${err.message} retryable=${String(err.isRetryable)}`,
      );
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
