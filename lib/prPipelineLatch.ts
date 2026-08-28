/**
 * Latch + stall decision when PR pipeline already failed but oneshot sleeps on Await.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type PrPipelineResultLatch = {
  pr: number;
  repo: string;
  outcome: "failed" | "green";
  at: string; // ISO
  reason?: string;
};

export function parsePrPipelineResultLatch(
  raw: string,
): PrPipelineResultLatch | null {
  try {
    const j = JSON.parse(raw) as Partial<PrPipelineResultLatch>;
    if (
      typeof j.pr !== "number" ||
      (j.outcome !== "failed" && j.outcome !== "green") ||
      typeof j.at !== "string"
    ) {
      return null;
    }
    return {
      pr: j.pr,
      repo: String(j.repo || ""),
      outcome: j.outcome,
      at: j.at,
      reason: j.reason,
    };
  } catch {
    return null;
  }
}

export function readPrPipelineResultLatch(
  path: string,
): PrPipelineResultLatch | null {
  try {
    if (!existsSync(path)) return null;
    return parsePrPipelineResultLatch(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function writePrPipelineResultLatch(
  path: string,
  latch: PrPipelineResultLatch,
): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(latch)}\n`, "utf8");
}

export function latchAtSec(latch: PrPipelineResultLatch): number | undefined {
  const ms = Date.parse(latch.at);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
}

/**
 * Oneshot alive, pipeline already FAILED on latch, agent silent after fail → reap.
 * Does not stall on green (agent may be merging).
 */
export function decideMissedPrPipelineStall(input: {
  oneshotAlive: boolean;
  nowSec: number;
  lastActivitySec: number;
  latch: PrPipelineResultLatch | null;
  /** Seconds after fail before treating as unattended. Default 120. */
  graceSec?: number;
}): { stalled: boolean; reason?: string } {
  if (!input.oneshotAlive) return { stalled: false };
  const latch = input.latch;
  if (!latch || latch.outcome !== "failed") return { stalled: false };
  const at = latchAtSec(latch);
  if (at == null) return { stalled: false };
  const grace = input.graceSec ?? 120;
  if (input.nowSec - at < grace) return { stalled: false };
  // Agent still silent since (or before) the fail → missed wake.
  if (input.lastActivitySec > 0 && input.nowSec - input.lastActivitySec < grace) {
    return { stalled: false };
  }
  return {
    stalled: true,
    reason: "pr_pipeline_failed_unattended",
  };
}

export function defaultMissedPrPipelineGraceSec(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const v = env.ONESHOT_STALL_PR_FAIL_SEC;
  if (!v) return 120;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 120;
}
