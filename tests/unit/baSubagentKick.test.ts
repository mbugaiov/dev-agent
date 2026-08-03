import { describe, expect, it } from "vitest";
import {
  commentsHaveBaSpecReady,
  hasBaSpecFirstLabel,
  resolveBaFactoryPhase,
} from "../../lib/baSubagentKick";

describe("ba-spec-first", () => {
  it("detects label", () => {
    expect(hasBaSpecFirstLabel(["impl-dev", "ba-spec-first"])).toBe(true);
    expect(hasBaSpecFirstLabel(["impl-dev"])).toBe(false);
  });

  it("detects sentinel", () => {
    expect(
      commentsHaveBaSpecReady([{ body: "done\n\nBA_SPEC_READY\n" }]),
    ).toBe(true);
    expect(
      commentsHaveBaSpecReady([{ body: "## BA_SPEC_READY\n\nHermes published" }]),
    ).toBe(true);
    expect(commentsHaveBaSpecReady([{ body: "still drafting" }])).toBe(false);
    expect(
      commentsHaveBaSpecReady([
        {
          body: "Wait BA_SPEC_READY before implement.\n\n_pickup_github_ticket_",
        },
      ]),
    ).toBe(false);
  });

  it("kicks when pending", () => {
    const r = resolveBaFactoryPhase({
      labels: ["ba-spec-first"],
      specReady: false,
    });
    expect(r.kick).toBe(true);
    expect(r.phase).toBe("spec");
  });

  it("does not kick when ready — no human wait", () => {
    const r = resolveBaFactoryPhase({
      labels: ["ba-spec-first"],
      specReady: true,
    });
    expect(r.kick).toBe(false);
    expect(r.reasons).toContain("spec:ready");
  });

  it("no kick without label", () => {
    const r = resolveBaFactoryPhase({ labels: ["impl-dev"], specReady: false });
    expect(r.kick).toBe(false);
  });
});
