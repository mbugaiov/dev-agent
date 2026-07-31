import { describe, expect, it } from "vitest";
import {
  pathLooksLikeUi,
  shouldKickUx,
  DEFAULT_UI_PATH_GLOBS,
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
