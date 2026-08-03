import { describe, expect, it } from "vitest";
import { resolveQaHandoffKick } from "../../lib/qaSubagentKick.ts";

describe("resolveQaHandoffKick", () => {
  it("kicks after successful handoff", () => {
    const r = resolveQaHandoffKick({ handoffOk: true });
    expect(r.kick).toBe(true);
    expect(r.reasons).toContain("handoff:ok");
  });

  it("does not kick before handoff", () => {
    expect(resolveQaHandoffKick({}).kick).toBe(false);
    expect(resolveQaHandoffKick({ handoffOk: false }).kick).toBe(false);
  });

  it("honors suppress", () => {
    const r = resolveQaHandoffKick({ handoffOk: true, suppress: true });
    expect(r.kick).toBe(false);
    expect(r.reasons).toContain("suppress");
  });
});
