import { describe, expect, it } from "vitest";
import {
  pathLooksLikeUi,
  shouldKickUx,
  resolveUxFactoryPhase,
  hasUxCharterFirstLabel,
  isUxCharterReadyComment,
  commentsHaveUxCharterReady,
  DEFAULT_UI_PATH_GLOBS,
  UX_CHARTER_FIRST_LABEL,
  UX_CHARTER_READY_SENTINEL,
} from "../../lib/uxSubagentKick.ts";

describe("uxSubagentKick", () => {
  it("kicks on needs-ux-pass label alone", () => {
    const r = shouldKickUx({ labels: ["impl-dev", "needs-ux-pass", "acme"] });
    expect(r.kick).toBe(true);
    expect(r.reasons).toContain("label:needs-ux-pass");
  });

  it("kicks on impl-ux label", () => {
    const r = shouldKickUx({ labels: ["impl-ux"] });
    expect(r.kick).toBe(true);
  });

  it("skips backend-only labels", () => {
    const r = shouldKickUx({
      labels: ["impl-dev", "acme"],
      surfaces: ["lib/services/foo.ts", "scripts/bar.sh"],
    });
    expect(r.kick).toBe(false);
  });

  it("kicks when surfaces include components/", () => {
    const r = shouldKickUx({
      labels: ["impl-dev"],
      surfaces: ["components/WidgetForm.tsx"],
    });
    expect(r.kick).toBe(true);
    expect(r.reasons.some((x) => x.startsWith("surface:"))).toBe(true);
  });

  it("kicks when diff touches app UI", () => {
    const r = shouldKickUx({
      labels: ["impl-dev"],
      diffPaths: ["app/login/page.tsx", "lib/actions/x.ts"],
    });
    expect(r.kick).toBe(true);
  });

  it("pathLooksLikeUi matches defaults", () => {
    expect(pathLooksLikeUi("components/X.tsx", DEFAULT_UI_PATH_GLOBS)).toBe(
      true,
    );
    expect(pathLooksLikeUi("lib/services/x.ts", DEFAULT_UI_PATH_GLOBS)).toBe(
      false,
    );
  });
});

describe("ux-charter-first", () => {
  it("detects label and sentinel", () => {
    expect(hasUxCharterFirstLabel(["impl-dev", UX_CHARTER_FIRST_LABEL])).toBe(
      true,
    );
    expect(isUxCharterReadyComment(`see ${UX_CHARTER_READY_SENTINEL} below`)).toBe(
      true,
    );
    expect(
      commentsHaveUxCharterReady([
        { body: "WIP" },
        { body: "UX_CHARTER_READY — Athena Mode B" },
      ]),
    ).toBe(true);
  });

  it("before-implement kicks charter when pending", () => {
    const r = resolveUxFactoryPhase({
      labels: ["impl-dev", "ux-charter-first", "needs-ux-pass"],
      when: "before-implement",
      charterReady: false,
    });
    expect(r.phase).toBe("charter");
    expect(r.kick).toBe(true);
    expect(r.mode).toBe("charter");
    expect(r.reasons).toContain("charter:pending");
  });

  it("before-implement skips kick when charter ready", () => {
    const r = resolveUxFactoryPhase({
      labels: ["impl-dev", "ux-charter-first"],
      when: "before-implement",
      charterReady: true,
    });
    expect(r.phase).toBe("none");
    expect(r.kick).toBe(false);
    expect(r.reasons).toContain("charter:ready");
  });

  it("before-implement ignores tickets without the label", () => {
    const r = resolveUxFactoryPhase({
      labels: ["impl-dev", "needs-ux-pass"],
      when: "before-implement",
      charterReady: false,
    });
    expect(r.phase).toBe("none");
    expect(r.kick).toBe(false);
  });

  it("after-implement still polishes with needs-ux-pass even with charter-first", () => {
    const r = resolveUxFactoryPhase({
      labels: ["impl-dev", "ux-charter-first", "needs-ux-pass"],
      when: "after-implement",
      charterReady: true,
    });
    expect(r.phase).toBe("polish");
    expect(r.kick).toBe(true);
    expect(r.mode).toBe("hephaestus-kick");
  });

  it("ux-charter-first alone does not trigger after-implement polish", () => {
    const r = resolveUxFactoryPhase({
      labels: ["impl-dev", "ux-charter-first"],
      when: "after-implement",
    });
    expect(r.phase).toBe("none");
    expect(r.kick).toBe(false);
  });
});
