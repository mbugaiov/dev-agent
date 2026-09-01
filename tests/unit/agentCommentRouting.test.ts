import { describe, expect, it } from "vitest";
import {
  bitbucketPrTargetKey,
  isJiraIssueKey,
  parsePrId,
  shouldDualWriteBitbucketPr,
} from "../../lib/agentCommentRouting.ts";
import { mapBitbucketPrComment } from "../../lib/bitbucketPrComments.ts";
import { bitbucketPrCommentPath, bitbucketPrCommentsPath } from "../../lib/bitbucketClient.ts";
import type { ProjectConfig } from "../../lib/projectConfig.ts";

describe("agentCommentRouting", () => {
  it("parses pr:N and numeric ids", () => {
    expect(parsePrId("pr:437")).toBe("437");
    expect(parsePrId("437")).toBe("437");
    expect(parsePrId("TST-123")).toBeUndefined();
    expect(parsePrId("pr:abc")).toBeUndefined();
  });

  it("detects Jira keys", () => {
    expect(isJiraIssueKey("TST-123")).toBe(true);
    expect(isJiraIssueKey("TST-1")).toBe(true);
    expect(isJiraIssueKey("pr:1")).toBe(false);
    expect(isJiraIssueKey("99")).toBe(false);
  });

  it("builds bitbucket target keys like GitHub pr:", () => {
    expect(bitbucketPrTargetKey(437)).toBe("pr:437");
  });

  it("dual-writes only for bitbucket git provider", () => {
    const bb = {
      git: { provider: "bitbucket" },
    } as ProjectConfig;
    const gh = {
      git: { provider: "github" },
    } as ProjectConfig;
    expect(shouldDualWriteBitbucketPr(bb)).toBe(true);
    expect(shouldDualWriteBitbucketPr(gh)).toBe(false);
  });
});

describe("bitbucketPrComments mapping", () => {
  it("maps content.raw and ids", () => {
    const c = mapBitbucketPrComment({
      id: 99,
      updated_on: "2026-09-01T00:00:00.000Z",
      content: { raw: "### Hephaestus progress" },
    });
    expect(c?.id).toBe("99");
    expect(c?.body).toContain("Hephaestus progress");
  });

  it("builds comment paths", () => {
    expect(bitbucketPrCommentsPath("ws", "repo", 437)).toBe(
      "/repositories/ws/repo/pullrequests/437/comments",
    );
    expect(bitbucketPrCommentPath("ws", "repo", 437, 12)).toBe(
      "/repositories/ws/repo/pullrequests/437/comments/12",
    );
  });
});
