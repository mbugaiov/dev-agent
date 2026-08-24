import { describe, expect, it } from "vitest";
import {
  commentsAlreadyHaveStgHandoff,
  extractStgBuildIds,
  shaPrefixMatch,
} from "../../lib/handoffCommentDedup.ts";
import { formatHandoffComment } from "../../lib/projectConfig.ts";

describe("handoffCommentDedup", () => {
  const sample = formatHandoffComment({
    mergedPrUrl: "https://github.com/org/app/pull/1",
    pipelineBuildNumber: "9",
    stgBuildId: "c4aabc6deadbeef",
    mainCommit: "c4aabc6deadbeef",
    summary: "STG handoff",
  });

  it("extracts STG buildId from formatted handoff", () => {
    expect(extractStgBuildIds(sample)).toEqual(["c4aabc6deadbeef"]);
  });

  it("skips duplicate handoff for the same buildId", () => {
    expect(
      commentsAlreadyHaveStgHandoff([{ body: sample }], "c4aabc6deadbeef"),
    ).toBe(true);
    expect(
      commentsAlreadyHaveStgHandoff([{ body: sample }], "c4aabc6"),
    ).toBe(true);
  });

  it("does not skip a different STG buildId (retest)", () => {
    expect(
      commentsAlreadyHaveStgHandoff([{ body: sample }], "aaaaaaaa"),
    ).toBe(false);
    expect(commentsAlreadyHaveStgHandoff([], "c4aabc6deadbeef")).toBe(false);
  });

  it("ignores short hashes and prose without STG buildId line", () => {
    expect(shaPrefixMatch("abc", "abcdef0")).toBe(false);
    expect(
      commentsAlreadyHaveStgHandoff(
        [{ body: "wait for STG then close" }],
        "c4aabc6deadbeef",
      ),
    ).toBe(false);
  });
});
