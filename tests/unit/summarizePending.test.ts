import { describe, expect, it } from "vitest";
import {
  buildPendingSummarizeState,
  formatSummarizeFollowup,
  shouldArmSummarizeFromAgentText,
  shouldForceSummarizeFollowup,
  SUMMARIZE_FOLLOWUP_SENTINEL,
} from "../../lib/summarizePending.ts";
import { decideDevFactoryStopHook } from "../../lib/devFactoryHookRuntime.ts";

describe("summarizePending", () => {
  it("arms from oneshot done markers", () => {
    expect(shouldArmSummarizeFromAgentText("DEV_FACTORY_IDLE {\"slug\":\"x\"}")).toBe(
      true,
    );
    expect(shouldArmSummarizeFromAgentText("LOOP_EXIT_IDLE")).toBe(true);
    expect(shouldArmSummarizeFromAgentText("GITHUB_HANDOFF_OK selftest#1")).toBe(
      false,
    );
  });

  it("skips summarize turn itself", () => {
    expect(
      shouldArmSummarizeFromAgentText("/summarize\nKairos oneshot done"),
    ).toBe(false);
    expect(
      shouldArmSummarizeFromAgentText("SUMMARIZE_FOLLOWUP_DONE compact ok"),
    ).toBe(false);
  });

  it("followup starts with /summarize slash", () => {
    const s = buildPendingSummarizeState({
      reason: "test",
      slug: "selftest",
      ticket: "selftest#1",
    });
    const msg = formatSummarizeFollowup(s);
    expect(msg.startsWith(SUMMARIZE_FOLLOWUP_SENTINEL)).toBe(true);
    expect(msg).toContain("SUMMARIZE_FOLLOWUP_DONE");
  });

  it("forces once while unconsumed", () => {
    const pending = buildPendingSummarizeState({ reason: "idle" });
    expect(
      shouldForceSummarizeFollowup({ pending, loopCount: 0 }).force,
    ).toBe(true);
    expect(
      shouldForceSummarizeFollowup({ pending, loopCount: 5 }).force,
    ).toBe(true);
    expect(
      shouldForceSummarizeFollowup({ pending, loopCount: 6 }).force,
    ).toBe(false);
    expect(
      shouldForceSummarizeFollowup({
        pending: { ...pending, consumed: true },
        loopCount: 0,
      }).force,
    ).toBe(false);
  });
});

describe("stop hook summarize followup", () => {
  it("emits /summarize when drain idle and latch armed", () => {
    const pending = buildPendingSummarizeState({
      reason: "agent_done_marker",
      slug: "selftest",
    });
    const res = decideDevFactoryStopHook({
      engineRoot: "/tmp/no-engine",
      status: "completed",
      loopCount: 0,
      pending: null,
      argusPending: null,
      summarizePending: pending,
      consumeSummarizeOnEmit: false,
      factorySession: true,
    });
    expect(res.followup_message).toBeTruthy();
    expect(res.followup_message!.startsWith("/summarize")).toBe(true);
  });

  it("prefers unconsumed execute drain over summarize", () => {
    const res = decideDevFactoryStopHook({
      engineRoot: "/tmp/no-engine",
      status: "completed",
      loopCount: 0,
      pending: {
        oldest: "TST-1",
        count: 1,
        branchPrefix: "feat/TST-1",
        issuedAt: new Date().toISOString(),
        consumed: false,
        executePrompt: "BACKLOG_WAKE_EXECUTE",
        slug: "selftest",
      },
      argusPending: null,
      summarizePending: buildPendingSummarizeState({ reason: "x" }),
      consumeSummarizeOnEmit: false,
      currentBranch: "main",
      hasWorkingTreeChanges: false,
      hasOpenPr: false,
      factorySession: true,
    });
    // Without project yaml, still may force drain — must not be /summarize first
    if (res.followup_message) {
      expect(res.followup_message.startsWith("/summarize")).toBe(false);
    }
  });
});
