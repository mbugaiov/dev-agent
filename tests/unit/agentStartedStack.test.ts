import { describe, expect, it } from "vitest";
import { markdownToAdf, adfToPlainText } from "../../lib/jiraClient.ts";
import {
  agentStartedMarker,
  buildChatBanner,
  decideAgentStartStack,
  findStackableComment,
  formatStackClock,
  githubTargetKey,
  parseAgentStartedBanner,
  parseAgentStartedMarker,
  sameStartEvent,
  type AgentStartEvent,
} from "../../lib/agentStartedStack.ts";

const T0 = new Date("2026-08-18T02:08:13.000Z");
const T1 = new Date("2026-08-18T02:09:40.000Z");
const T_LATE = new Date("2026-08-18T09:00:00.000Z");

function event(
  over: Partial<AgentStartEvent> & Pick<AgentStartEvent, "mode" | "doing">,
): AgentStartEvent {
  return {
    seat: "Hephaestus",
    ticketLine: "**Ticket:** demo#420",
    at: T0,
    ...over,
  };
}

describe("agentStartedStack", () => {
  it("builds a chat banner without a stack marker", () => {
    const body = buildChatBanner(
      event({ mode: "pickup", doing: "smoke", at: T0 }),
    );
    expect(body).toContain("### Hephaestus started");
    expect(body).toContain("**Mode:** pickup");
    expect(body).not.toContain("agent-started:");
  });

  it("creates a marked tracker comment when none exists", () => {
    const d = decideAgentStartStack({
      existing: null,
      event: event({ mode: "pickup", doing: "Draw PROD icon" }),
      targetKey: githubTargetKey("issue", 420),
      now: T0,
    });
    expect(d.action).toBe("create");
    expect(d.body).toContain("### Hephaestus started");
    expect(d.body).toContain(agentStartedMarker("Hephaestus", "issue:420"));
    expect(d.body).not.toContain("Also started");
  });

  it("skips identical mode+doing inside the session (Kairos K11)", () => {
    const first = decideAgentStartStack({
      existing: null,
      event: event({
        seat: "Kairos",
        mode: "portfolio wake",
        doing: "saw demo#420 — wake Hephaestus",
      }),
      targetKey: "issue:420",
      now: T0,
    });
    const again = decideAgentStartStack({
      existing: { body: first.body, updatedAt: T0 },
      event: event({
        seat: "Kairos",
        mode: "portfolio wake",
        doing: "saw demo#420 — wake Hephaestus",
        at: T1,
      }),
      targetKey: "issue:420",
      now: T1,
    });
    expect(again.action).toBe("skip");
    if (again.action === "skip") {
      expect(again.reason).toMatch(/identical/);
    }
  });

  it("patches and stacks a new doing onto the same comment", () => {
    const first = decideAgentStartStack({
      existing: null,
      event: event({ mode: "pickup / implement", doing: "Draw PROD icon" }),
      targetKey: "issue:420",
      now: T0,
    });
    const second = decideAgentStartStack({
      existing: { body: first.body, updatedAt: T0 },
      event: event({
        mode: "oneshot drain",
        doing: "Pickup #420 and implement",
        at: T1,
      }),
      targetKey: "issue:420",
      now: T1,
    });
    expect(second.action).toBe("patch");
    expect(second.body).toContain("**Mode:** oneshot drain");
    expect(second.body).toContain("**Doing:** Pickup #420 and implement");
    expect(second.body).toContain("Also started (1):");
    expect(second.body).toContain(
      `- \`${formatStackClock(T0)}\` pickup / implement — Draw PROD icon`,
    );
    expect(second.body).toContain(agentStartedMarker("Hephaestus", "issue:420"));
  });

  it("does not treat a new session as a stack (fresh comment)", () => {
    const first = decideAgentStartStack({
      existing: null,
      event: event({ mode: "pickup", doing: "v1" }),
      targetKey: "issue:420",
      now: T0,
    });
    const nextDay = decideAgentStartStack({
      existing: { body: first.body, updatedAt: T0 },
      event: event({ mode: "retest", doing: "v2", at: T_LATE }),
      targetKey: "issue:420",
      now: T_LATE,
      sessionTtlMs: 6 * 60 * 60 * 1000,
    });
    expect(nextDay.action).toBe("create");
    expect(nextDay.body).not.toContain("Also started");
  });

  it("caps stacked lines at maxStack (drops oldest)", () => {
    let body = decideAgentStartStack({
      existing: null,
      event: event({ mode: "m0", doing: "d0" }),
      targetKey: "issue:1",
      now: T0,
    }).body;
    let updatedAt = T0;
    for (let i = 1; i <= 4; i++) {
      const at = new Date(T0.getTime() + i * 60_000);
      const d = decideAgentStartStack({
        existing: { body, updatedAt },
        event: event({ mode: `m${i}`, doing: `d${i}`, at }),
        targetKey: "issue:1",
        now: at,
        maxStack: 3,
      });
      expect(d.action).toBe("patch");
      body = d.body;
      updatedAt = at;
    }
    expect(body).toContain("Also started (3):");
    expect(body).not.toContain("m0 — d0");
    expect(body).toContain("m1 — d1");
    expect(body).toContain("m3 — d3");
    expect(body).toContain("**Mode:** m4");
  });

  it("finds a marked comment over an older unmarked banner", () => {
    const marked = decideAgentStartStack({
      existing: null,
      event: event({ mode: "oneshot", doing: "live" }),
      targetKey: "issue:420",
      now: T1,
    }).body;
    const unmarked = [
      "### Hephaestus started",
      "",
      "**Ticket:** demo#420",
      "**Mode:** pickup / implement",
      "**Doing:** old",
      "",
      `_pickup_github_ticket · ${T0.toISOString()}_`,
    ].join("\n");
    const hit = findStackableComment(
      [
        { id: "1", body: unmarked, updatedAt: T0 },
        { id: "2", body: marked, updatedAt: T1 },
      ],
      "Hephaestus",
      "issue:420",
      T1,
    );
    expect(hit?.id).toBe("2");
  });

  it("stacks onto an unmarked pickup banner in-session", () => {
    const unmarked = [
      "### Hephaestus started",
      "",
      "**Ticket:** demo#420",
      "**Mode:** pickup / implement",
      "**Doing:** Draw PROD icon",
      "",
      `_pickup_github_ticket · ${T0.toISOString()}_`,
    ].join("\n");
    const hit = findStackableComment(
      [{ id: "9", body: unmarked, updatedAt: T0 }],
      "Hephaestus",
      "issue:420",
      T1,
    );
    expect(hit?.id).toBe("9");
    const d = decideAgentStartStack({
      existing: hit,
      event: event({
        mode: "oneshot drain",
        doing: "implement icon",
        at: T1,
      }),
      targetKey: "issue:420",
      now: T1,
    });
    expect(d.action).toBe("patch");
    expect(d.body).toContain("Also started (1):");
    expect(parseAgentStartedMarker(d.body)?.targetKey).toBe("issue:420");
  });

  it("does not stack Argus onto a Hephaestus banner", () => {
    const heph = decideAgentStartStack({
      existing: null,
      event: event({ mode: "pickup", doing: "impl" }),
      targetKey: "issue:420",
      now: T0,
    }).body;
    const hit = findStackableComment(
      [{ id: "1", body: heph, updatedAt: T0 }],
      "Argus",
      "issue:420",
      T1,
    );
    expect(hit).toBeNull();
  });

  it("round-trips stacked Also started bullets through Jira ADF flatten", () => {
    const first = decideAgentStartStack({
      existing: null,
      event: event({ mode: "pickup / implement", doing: "Draw PROD icon" }),
      targetKey: "TST-123",
      now: T0,
      markerStyle: "code",
    });
    const second = decideAgentStartStack({
      existing: { body: first.body, updatedAt: T0 },
      event: event({
        mode: "oneshot drain",
        doing: "Pickup and implement",
        at: T1,
      }),
      targetKey: "TST-123",
      now: T1,
      markerStyle: "code",
    });
    expect(second.action).toBe("patch");
    const flat = adfToPlainText(markdownToAdf(second.body));
    expect(parseAgentStartedMarker(flat)?.targetKey).toBe("TST-123");
    const parsed = parseAgentStartedBanner(flat);
    expect(parsed?.mode).toBe("oneshot drain");
    expect(parsed?.stack).toEqual([
      {
        at: formatStackClock(T0),
        mode: "pickup / implement",
        doing: "Draw PROD icon",
      },
    ]);
  });

  it("creates instead of patching when existing banner is another seat", () => {
    const heph = decideAgentStartStack({
      existing: null,
      event: event({ mode: "pickup", doing: "impl" }),
      targetKey: "issue:420",
      now: T0,
    }).body;
    const d = decideAgentStartStack({
      existing: { body: heph, updatedAt: T0 },
      event: event({
        seat: "Argus",
        mode: "STG retest",
        doing: "validate",
        at: T1,
      }),
      targetKey: "issue:420",
      now: T1,
    });
    expect(d.action).toBe("create");
    expect(d.body).toContain("### Argus started");
    expect(d.body).not.toContain("Also started");
  });

  it("treats whitespace-normalized doing as identical", () => {
    expect(
      sameStartEvent(
        { mode: "portfolio wake", doing: "saw  demo#420" },
        { mode: "portfolio wake", doing: "saw demo#420" },
      ),
    ).toBe(true);
  });
});
