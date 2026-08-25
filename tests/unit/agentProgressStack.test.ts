import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  agentProgressMarker,
  buildProgressChatBanner,
  decideAgentProgressStack,
  findProgressStackableComment,
  humanizeMilestone,
  isProgressMilestone,
  parseAgentProgressBanner,
  parseAgentProgressMarker,
  sameProgressEvent,
  type AgentProgressEvent,
} from "../../lib/agentProgressStack.ts";
import {
  clearProgressTicketKey,
  readProgressTicketKey,
  writeProgressTicketKey,
} from "../../lib/progressTicketLatch.ts";
import { githubTargetKey } from "../../lib/agentStartedStack.ts";

const T0 = new Date("2026-08-25T02:14:00.000Z");
const T1 = new Date("2026-08-25T02:33:00.000Z");
const T_LATE = new Date("2026-08-25T10:00:00.000Z");

function event(
  over: Partial<AgentProgressEvent> &
    Pick<AgentProgressEvent, "status" | "detail">,
): AgentProgressEvent {
  return {
    seat: "Hephaestus",
    ticketLine: "**Ticket:** TST-2143",
    at: T0,
    ...over,
  };
}

describe("agentProgressStack", () => {
  it("humanizes milestones", () => {
    expect(isProgressMilestone("pipeline_waiting")).toBe(true);
    expect(humanizeMilestone("pipeline_waiting")).toBe("pipeline waiting");
    expect(isProgressMilestone("nope")).toBe(false);
  });

  it("builds chat banner without marker", () => {
    const body = buildProgressChatBanner(
      event({ status: "pipeline waiting", detail: "PR #138" }),
    );
    expect(body).toContain("### Hephaestus progress");
    expect(body).toContain("**Status:** pipeline waiting");
    expect(body).not.toContain("agent-progress:");
  });

  it("creates marked tracker comment", () => {
    const d = decideAgentProgressStack({
      existing: null,
      event: event({
        status: "mr opened",
        detail: "https://example/pr/138",
      }),
      targetKey: "TST-2143",
      now: T0,
    });
    expect(d.action).toBe("create");
    expect(d.body).toContain("### Hephaestus progress");
    expect(d.body).toContain(agentProgressMarker("Hephaestus", "TST-2143"));
  });

  it("skips identical status+detail (no spam)", () => {
    const first = decideAgentProgressStack({
      existing: null,
      event: event({
        status: "pipeline waiting",
        detail: "PR #138 — wait armed",
      }),
      targetKey: "TST-2143",
      now: T0,
    });
    const again = decideAgentProgressStack({
      existing: { body: first.body, updatedAt: T0 },
      event: event({
        status: "pipeline waiting",
        detail: "PR #138 — wait armed",
        at: T1,
      }),
      targetKey: "TST-2143",
      now: T1,
    });
    expect(again.action).toBe("skip");
  });

  it("patches and stacks prior status on change", () => {
    const first = decideAgentProgressStack({
      existing: null,
      event: event({
        status: "pipeline waiting",
        detail: "PR #138",
      }),
      targetKey: "TST-2143",
      now: T0,
    });
    const next = decideAgentProgressStack({
      existing: { body: first.body, updatedAt: T0 },
      event: event({
        status: "pipeline failed",
        detail: "PR #138 — test failed",
        at: T1,
      }),
      targetKey: "TST-2143",
      now: T1,
    });
    expect(next.action).toBe("patch");
    expect(next.body).toContain("**Status:** pipeline failed");
    expect(next.body).toContain("Earlier (1):");
    expect(next.body).toMatch(/pipeline waiting/);
  });

  it("creates fresh comment after session TTL", () => {
    const first = decideAgentProgressStack({
      existing: null,
      event: event({ status: "pipeline waiting", detail: "PR #1" }),
      targetKey: "TST-1",
      now: T0,
    });
    const late = decideAgentProgressStack({
      existing: { body: first.body, updatedAt: T0 },
      event: event({
        status: "pipeline green",
        detail: "PR #1",
        at: T_LATE,
      }),
      targetKey: "TST-1",
      now: T_LATE,
      sessionTtlMs: 6 * 60 * 60 * 1000,
    });
    expect(late.action).toBe("create");
  });

  it("parses marker and banner", () => {
    const body = decideAgentProgressStack({
      existing: null,
      event: event({ status: "handoff", detail: "Validate/Testing" }),
      targetKey: githubTargetKey("issue", 87),
      now: T0,
      markerStyle: "code",
    }).body;
    expect(parseAgentProgressMarker(body)).toEqual({
      seat: "Hephaestus",
      targetKey: "issue:87",
    });
    const parsed = parseAgentProgressBanner(body);
    expect(parsed?.status).toBe("handoff");
    expect(sameProgressEvent(parsed!, { status: "handoff", detail: "Validate/Testing" })).toBe(
      true,
    );
  });

  it("findProgressStackableComment prefers marked comment", () => {
    const marked = decideAgentProgressStack({
      existing: null,
      event: event({ status: "mr opened", detail: "link" }),
      targetKey: "TST-9",
      now: T0,
    }).body;
    const hit = findProgressStackableComment(
      [
        {
          body: "noise",
          updatedAt: T1,
        },
        { body: marked, updatedAt: T0 },
      ],
      "Hephaestus",
      "TST-9",
      T1,
    );
    expect(hit?.body).toBe(marked);
  });
});

describe("progressTicketLatch", () => {
  it("writes reads and clears latch", () => {
    const root = mkdtempSync(join(tmpdir(), "prog-latch-"));
    try {
      writeProgressTicketKey(root, "demo", "TST-2143");
      expect(readProgressTicketKey(root, "demo")).toBe("TST-2143");
      expect(
        readFileSync(
          join(root, "projects/demo/factory/progress-ticket.key"),
          "utf8",
        ).trim(),
      ).toBe("TST-2143");
      clearProgressTicketKey(root, "demo");
      expect(readProgressTicketKey(root, "demo")).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
