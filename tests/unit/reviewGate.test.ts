import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractBlockingSection, reviewHasBlockers } from "../../lib/reviewGate.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const fixtures = join(ROOT, "tests/fixtures/review-gate");

describe("reviewHasBlockers", () => {
  it("passes on LGTM single line", () => {
    expect(reviewHasBlockers("LGTM - no blocking issues found.")).toBe(false);
  });

  it("passes when Blocking issues is None.", () => {
    const text = `## Summary
Looks good.

## Blocking issues
None.

## Suggestions
None.`;
    expect(reviewHasBlockers(text)).toBe(false);
  });

  it("does not treat LGTM on a later line as pass when blockers exist", () => {
    const text = `## Summary
Bug found.

## Blocking issues
- lib/foo.ts:12 — null dereference

LGTM - no blocking issues found.`;
    expect(reviewHasBlockers(text)).toBe(true);
  });

  it("fails when structured sections omit Blocking issues", () => {
    const text = `## Summary
Only summary.

## Suggestions
- nit`;
    expect(reviewHasBlockers(text)).toBe(true);
  });

  it("fails on pipeline no-output placeholder", () => {
    expect(
      reviewHasBlockers("Cursor review produced no output (see build log above)."),
    ).toBe(true);
  });

  it("fails when Blocking issues lists items", () => {
    const text = `## Summary
Bug found.

## Blocking issues
- lib/foo.ts:12 — null dereference

## Suggestions
None.`;
    expect(reviewHasBlockers(text)).toBe(true);
    expect(extractBlockingSection(text)).toContain("null dereference");
  });
});

describe("check_review_gate.sh fixtures", () => {
  const runGate = (fixture: string) =>
    execFileSync("bash", ["scripts/check_review_gate.sh", join(fixtures, fixture)], {
      cwd: ROOT,
      encoding: "utf8",
    });

  it("passes clean LGTM fixture", () => {
    expect(() => runGate("lgtm.md")).not.toThrow();
  });

  it("fails blocking-items fixture", () => {
    expect(() => runGate("blocking-items.md")).toThrow();
  });

  it("fixtures match parser expectations", () => {
    for (const [name, blocked] of [
      ["lgtm.md", false],
      ["blocking-none.md", false],
      ["blocking-items.md", true],
      ["no-output.md", true],
      ["unstructured-error.md", true],
      ["empty-blocking-section.md", true],
      ["missing-blocking-header.md", true],
      ["false-lgtm-after-blockers.md", true],
    ] as const) {
      const text = readFileSync(join(fixtures, name), "utf8");
      expect(reviewHasBlockers(text)).toBe(blocked);
    }
  });
});
