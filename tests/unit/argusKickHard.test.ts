import { describe, expect, it } from "vitest";
import {
  buildPendingArgusKickState,
  shouldForceArgusKickFollowup,
} from "../../lib/argusKickPending.ts";
import {
  buildQaWakePayload,
  formatQaWakeExecuteLine,
  resolveQaAgentRoot,
  QA_WAKE_EXECUTE_SENTINEL,
} from "../../lib/qaHandoffKickBridge.ts";

describe("argusKickPending", () => {
  it("forces followup while unconsumed", () => {
    const pending = buildPendingArgusKickState({
      slug: "pantheon",
      ticket: "pantheon#66",
    });
    const d = shouldForceArgusKickFollowup({ pending, loopCount: 0 });
    expect(d.force).toBe(true);
    if (d.force) {
      expect(d.message).toContain("ARGUS_KICK_EXECUTE");
      expect(d.message).toContain("pantheon#66");
    }
  });

  it("skips when consumed or max loops", () => {
    const pending = buildPendingArgusKickState({
      slug: "pantheon",
      ticket: "pantheon#66",
    });
    expect(
      shouldForceArgusKickFollowup({
        pending: { ...pending, consumed: true },
        loopCount: 0,
      }).force,
    ).toBe(false);
    expect(
      shouldForceArgusKickFollowup({ pending, loopCount: 5 }).force,
    ).toBe(false);
  });
});

describe("qaHandoffKickBridge", () => {
  it("resolves QA_AGENT_ROOT then sibling", () => {
    expect(
      resolveQaAgentRoot("/work/dev-agent", {}, { QA_AGENT_ROOT: "/custom/qa" }),
    ).toBe("/custom/qa");
    expect(resolveQaAgentRoot("/work/dev-agent", {}, {})).toBe(
      "/work/qa-agent",
    );
    expect(
      resolveQaAgentRoot(
        "/work/dev-agent",
        { qa_kick: { qa_agent_path: "../elsewhere-qa" } },
        {},
      ),
    ).toBe("/work/elsewhere-qa");
  });

  it("formats QA_WAKE_EXECUTE line with executeNow", () => {
    const state = buildQaWakePayload({
      slug: "pantheon",
      ticketKey: "pantheon#66",
    });
    const line = formatQaWakeExecuteLine(state);
    expect(line.startsWith(QA_WAKE_EXECUTE_SENTINEL)).toBe(true);
    expect(line).toContain('"executeNow":true');
    expect(line).toContain("pantheon#66");
    expect(state.consumed).toBe(false);
    expect(state.source).toBe("handoff");
  });
});
