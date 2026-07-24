import { describe, expect, it } from "vitest";
import {
  missingOpenspecSkills,
  packageHasOpenspecScript,
  runOpenspecAppCheck,
} from "../../lib/openspecAppCheck.ts";

describe("openspecAppCheck", () => {
  it("packageHasOpenspecScript detects spec script", () => {
    expect(
      packageHasOpenspecScript({ scripts: { spec: "openspec" } }),
    ).toBe(true);
    expect(packageHasOpenspecScript({ scripts: { test: "vitest" } })).toBe(
      false,
    );
  });

  it("missingOpenspecSkills lists absent skills", () => {
    expect(missingOpenspecSkills(["openspec-propose"])).toEqual([
      "openspec-apply-change",
      "openspec-archive-change",
    ]);
    expect(
      missingOpenspecSkills([
        "openspec-propose",
        "openspec-apply-change",
        "openspec-archive-change",
      ]),
    ).toEqual([]);
  });

  it("runOpenspecAppCheck passes when package and skills present", () => {
    expect(
      runOpenspecAppCheck({
        appRoot: "/app",
        specsDir: "openspec/specs",
        packageJson: {
          devDependencies: { "@fission-ai/openspec": "^1.4.1" },
          scripts: { spec: "openspec" },
        },
        skillNamesPresent: [
          "openspec-propose",
          "openspec-apply-change",
          "openspec-archive-change",
        ],
      }).ok,
    ).toBe(true);
  });

  it("runOpenspecAppCheck fails without npm package", () => {
    const r = runOpenspecAppCheck({
      appRoot: "/app",
      specsDir: "openspec/specs",
      packageJson: { scripts: { spec: "openspec" } },
      skillNamesPresent: [
        "openspec-propose",
        "openspec-apply-change",
        "openspec-archive-change",
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("@fission-ai/openspec");
  });
});
