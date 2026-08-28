import { describe, expect, it } from "vitest";
import {
  classifyRequiredChecks,
  normalizeCheckBucket,
} from "../../lib/prPipelineStatus.ts";
import {
  decideMissedPrPipelineStall,
  parsePrPipelineResultLatch,
} from "../../lib/prPipelineLatch.ts";

describe("prPipelineStatus", () => {
  it("normalizes buckets", () => {
    expect(normalizeCheckBucket("pass")).toBe("pass");
    expect(normalizeCheckBucket("FAILURE")).toBe("fail");
    expect(normalizeCheckBucket("pending")).toBe("pending");
    expect(normalizeCheckBucket("")).toBe("missing");
  });

  it("fails closed on any required fail", () => {
    const out = classifyRequiredChecks(
      ["gate", "review (Themis)", "isolation (Themis)"],
      {
        gate: "pass",
        "review (Themis)": "fail",
        "isolation (Themis)": "pass",
      },
    );
    expect(out.outcome).toBe("failed");
    expect(out.failed).toEqual(["review (Themis)"]);
  });

  it("pending when check missing", () => {
    const out = classifyRequiredChecks(["gate", "review (Themis)"], {
      gate: "pass",
    });
    expect(out.outcome).toBe("pending");
  });

  it("green when all pass", () => {
    const out = classifyRequiredChecks(["gate", "review (Themis)"], {
      gate: "success",
      "review (Themis)": "skip",
    });
    expect(out.outcome).toBe("green");
  });
});

describe("missed PR pipeline stall", () => {
  const failedLatch = {
    pr: 454,
    repo: "mbugaiov/pantheon",
    outcome: "failed" as const,
    at: "2026-08-27T20:01:00Z",
  };

  it("parses latch", () => {
    expect(
      parsePrPipelineResultLatch(JSON.stringify(failedLatch))?.pr,
    ).toBe(454);
  });

  it("does not stall within grace after fail", () => {
    const at = Math.floor(Date.parse(failedLatch.at) / 1000);
    expect(
      decideMissedPrPipelineStall({
        oneshotAlive: true,
        nowSec: at + 30,
        lastActivitySec: at - 100,
        latch: failedLatch,
        graceSec: 120,
      }).stalled,
    ).toBe(false);
  });

  it("stalls when fail aged and agent silent", () => {
    const at = Math.floor(Date.parse(failedLatch.at) / 1000);
    const out = decideMissedPrPipelineStall({
      oneshotAlive: true,
      nowSec: at + 200,
      lastActivitySec: at - 50,
      latch: failedLatch,
      graceSec: 120,
    });
    expect(out).toEqual({
      stalled: true,
      reason: "pr_pipeline_failed_unattended",
    });
  });

  it("does not stall when agent active after fail", () => {
    const at = Math.floor(Date.parse(failedLatch.at) / 1000);
    expect(
      decideMissedPrPipelineStall({
        oneshotAlive: true,
        nowSec: at + 200,
        lastActivitySec: at + 180,
        latch: failedLatch,
        graceSec: 120,
      }).stalled,
    ).toBe(false);
  });

  it("ignores green latch", () => {
    expect(
      decideMissedPrPipelineStall({
        oneshotAlive: true,
        nowSec: 1_000_000,
        lastActivitySec: 1,
        latch: { ...failedLatch, outcome: "green" },
        graceSec: 120,
      }).stalled,
    ).toBe(false);
  });
});
