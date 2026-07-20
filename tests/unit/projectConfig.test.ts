import { describe, expect, it } from "vitest";
import {
  buildDevFactoryJql,
  buildPrUrlPattern,
  formatHandoffComment,
  handoffCommentValid,
  stgBuildIdMatchesMain,
} from "../../lib/projectConfig.ts";

/** Generic fixture — not a live project. Live values belong in projects/<slug>/ only. */
const FIXTURE_DEV_FACTORY = {
  epic_key: "TST-1",
  pickup_label: "impl-dev",
  excluded_labels: ["impl-qa", "human-required"],
  excluded_issue_keys: ["TST-99", "TST-100"],
  statuses: ["To Do", "In Progress"],
  handoff_status: "Validate/Testing",
  forbidden_target_statuses: ["Done"],
  order_by: "created ASC",
};

describe("projectConfig", () => {
  it("builds JQL from config (no hardcoded epic in lib)", () => {
    const jql = buildDevFactoryJql(FIXTURE_DEV_FACTORY);
    expect(jql).toContain("parent = TST-1");
    expect(jql).toContain("labels = impl-dev");
    expect(jql).toContain("labels not in (impl-qa");
    expect(jql).toContain("TST-99");
    expect(jql).toContain('status in ("To Do", "In Progress")');
  });

  it("validates handoff comment against git config PR pattern", () => {
    const git = {
      provider: "bitbucket" as const,
      workspace: "example-corp",
      repo: "my-app",
      default_branch: "main",
      branch_prefixes: ["feat"],
      ticket_key_pattern: "TST-\\d+",
    };
    const sample = formatHandoffComment({
      mergedPrUrl:
        "https://bitbucket.org/example-corp/my-app/pull-requests/42",
      pipelineBuildNumber: 100,
      stgBuildId: "abc1234",
      mainCommit: "abc1234def",
      summary: "test",
    });
    expect(handoffCommentValid(sample, buildPrUrlPattern(git))).toBe(true);
  });

  it("matches STG buildId to main commit", () => {
    expect(stgBuildIdMatchesMain("abc1234", "abc1234def567")).toBe(true);
  });
});
