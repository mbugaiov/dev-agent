/**
 * Classify GitHub PR required-check buckets (pure — no network).
 * Keep sentinels in sync with app/engine wait_pr_pipeline.sh.
 */
export type CheckBucket = "pass" | "fail" | "pending" | "missing";

export type PipelineOutcome = "green" | "failed" | "pending";

export function normalizeCheckBucket(raw: string | null | undefined): CheckBucket {
  const s = (raw || "").trim().toLowerCase();
  if (!s) return "missing";
  if (/fail|failure|cancel|timed/.test(s)) return "fail";
  if (/pass|success|skip/.test(s)) return "pass";
  return "pending";
}

/** Map required check names → current bucket (missing if absent). */
export function classifyRequiredChecks(
  required: string[],
  byName: Record<string, string>,
): { outcome: PipelineOutcome; failed: string[]; pending: string[] } {
  const failed: string[] = [];
  const pending: string[] = [];
  for (const name of required) {
    const bucket = normalizeCheckBucket(byName[name]);
    if (bucket === "fail") failed.push(name);
    else if (bucket === "pending" || bucket === "missing") pending.push(name);
  }
  if (failed.length) return { outcome: "failed", failed, pending };
  if (pending.length) return { outcome: "pending", failed, pending };
  return { outcome: "green", failed, pending };
}

export const PR_PIPELINE_FAILED_RE = /^PR_PIPELINE_FAILED\b/m;
export const PR_PIPELINE_GREEN_RE = /^PR_PIPELINE_GREEN\b/m;
export const PR_PIPELINE_PENDING_RE = /^PR_PIPELINE_PENDING\b/m;

/** Exit codes for follow_pr_pipeline_chunk.sh */
export const CHUNK_EXIT = {
  green: 0,
  failed: 1,
  usage: 2,
  pending: 3,
} as const;
