import { describe, expect, it } from "vitest";
import {
  classifyEnsureChronosLine,
  resolvePmAgentRoot,
} from "../../lib/chronosKickBridge";

describe("chronosKickBridge", () => {
  it("resolves PM_AGENT_ROOT then sibling", () => {
    expect(
      resolvePmAgentRoot("/work/dev-agent", {}, { PM_AGENT_ROOT: "/custom/pm" }),
    ).toBe("/custom/pm");
    expect(resolvePmAgentRoot("/work/dev-agent", {})).toBe("/work/pm-agent");
    expect(
      resolvePmAgentRoot(
        "/work/dev-agent",
        { pm_kick: { pm_agent_path: "../elsewhere-pm" } },
        {},
      ),
    ).toBe("/work/elsewhere-pm");
  });

  it("maps ensure_chronos sentinel lines", () => {
    expect(
      classifyEnsureChronosLine(
        'CHRONOS_ONESHOT_ARMED {"slug":"pantheon","pid":1}',
      ),
    ).toBe("armed");
    expect(
      classifyEnsureChronosLine('ALREADY_RUNNING {"slug":"pantheon","pid":2}'),
    ).toBe("already");
    expect(
      classifyEnsureChronosLine(
        'CHRONOS_ONESHOT_SKIP {"reason":"CURSOR_API_KEY-missing"}',
      ),
    ).toBe("skipped");
    expect(
      classifyEnsureChronosLine('CHRONOS_ONESHOT_FAIL {"reason":"lock-busy"}'),
    ).toBe("failed");
    expect(classifyEnsureChronosLine("noise")).toBe("unknown");
  });
});
