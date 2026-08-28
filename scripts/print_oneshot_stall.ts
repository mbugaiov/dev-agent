/**
 * K14 stall probe for Hephaestus oneshot.
 * Usage: npx tsx scripts/print_oneshot_stall.ts <slug>
 * Prints: ONESHOT_NONE | ONESHOT_HEALTHY | ONESHOT_STALLED {...}
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectOneshotStallSignals,
  decideOneshotStall,
  lastActivitySec,
} from "../lib/oneshotStall.ts";
import {
  decideMissedPrPipelineStall,
  defaultMissedPrPipelineGraceSec,
  readPrPipelineResultLatch,
} from "../lib/prPipelineLatch.ts";

const slug = process.argv[2] ?? "";
if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
  console.error("Usage: print_oneshot_stall.ts <slug>");
  process.exit(2);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FACTORY = join(ROOT, "projects", slug, "factory");
const PID_FILE = join(FACTORY, "hephaestus-oneshot.pid");
const LOG = join(FACTORY, "hephaestus-oneshot.out");
const HEARTBEAT = join(FACTORY, "hephaestus-oneshot.heartbeat");
const CLAIM = join(FACTORY, "hephaestus-oneshot.claim.json");
const PR_RESULT = join(FACTORY, "pr-pipeline.result.json");

function pidAlive(pid: string): boolean {
  if (!pid) return false;
  try {
    execFileSync("kill", ["-0", pid], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

let alive = false;
if (existsSync(PID_FILE)) {
  const pid = readFileSync(PID_FILE, "utf8").trim();
  alive = pidAlive(pid);
}

const signals = collectOneshotStallSignals({
  pidFile: PID_FILE,
  logFile: LOG,
  heartbeatFile: HEARTBEAT,
  claimFile: CLAIM,
  pidAlive: alive,
});

let result = decideOneshotStall(signals);
if (!result.stalled && alive) {
  const missed = decideMissedPrPipelineStall({
    oneshotAlive: true,
    nowSec: signals.nowSec,
    lastActivitySec: lastActivitySec(signals),
    latch: readPrPipelineResultLatch(PR_RESULT),
    graceSec: defaultMissedPrPipelineGraceSec(),
  });
  if (missed.stalled) result = missed;
}

if (!alive) {
  process.stdout.write(`ONESHOT_NONE ${JSON.stringify({ slug })}\n`);
} else if (result.stalled) {
  process.stdout.write(
    `ONESHOT_STALLED ${JSON.stringify({
      slug,
      reason: result.reason,
      silentSec: signals.silentSec,
      lastActivitySec: lastActivitySec(signals),
    })}\n`,
  );
} else {
  process.stdout.write(`ONESHOT_HEALTHY ${JSON.stringify({ slug })}\n`);
}
