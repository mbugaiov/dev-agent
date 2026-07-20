import { describe, expect, it } from "vitest";
import {
  formatStgRetestHandoffComment,
  qaNeedsStgRetestHandoff,
} from "../../lib/projectConfig.ts";
import {
  mayTransitionToValidateTesting,
  parseHealthBuildId,
  stgHealthUrl,
} from "../../lib/stgBuildCheck.ts";

describe("stgBuildCheck", () => {
  it("parses buildId from health JSON", () => {
    expect(parseHealthBuildId({ buildId: "abc1234" })).toBe("abc1234");
    expect(parseHealthBuildId({ status: "ok" })).toBe("");
    expect(parseHealthBuildId(null)).toBe("");
  });

  it("builds STG health URL", () => {
    expect(stgHealthUrl("https://stg.example.com/", "/api/health")).toBe(
      "https://stg.example.com/api/health",
    );
  });

  it("gates Validate/Testing on STG build match", () => {
    expect(
      mayTransitionToValidateTesting({
        merged: true,
        deploySuccessful: true,
        deploySkippedNonAppOnly: false,
        stgBuildId: "abc1234",
        mainCommit: "abc1234def567",
      }),
    ).toBe(true);
    expect(
      mayTransitionToValidateTesting({
        merged: true,
        deploySuccessful: false,
        deploySkippedNonAppOnly: false,
        stgBuildId: "deadbeef",
        mainCommit: "abc1234def567",
      }),
    ).toBe(false);
  });
});

describe("stg retest handoff", () => {
  it("formats STG retest comment with feature commit note", () => {
    const text = formatStgRetestHandoffComment({
      mergedPrUrl:
        "https://bitbucket.org/example-corp/my-app/pull-requests/42",
      pipelineBuildNumber: 100,
      stgBuildId: "fff0001",
      mainCommit: "fff0001abc",
      summary: "retest after QA RETURN",
      featureMainCommit: "abc1234",
      followOnNotes: ["fix typo on main"],
    });
    expect(text).toContain("STG retest handoff");
    expect(text).toContain("Feature merge commit: abc1234");
    expect(text).toContain("fix typo on main");
  });

  it("detects QA RETURN handoff gaps", () => {
    expect(qaNeedsStgRetestHandoff("No dev handoff with merge SHA")).toBe(
      true,
    );
    expect(qaNeedsStgRetestHandoff("Looks good, ready for QA")).toBe(false);
  });
});
