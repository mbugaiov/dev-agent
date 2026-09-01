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

  it("uses jql override when set (board-wide, no epic)", () => {
    const jql = buildDevFactoryJql({
      ...FIXTURE_DEV_FACTORY,
      epic_key: undefined,
      jql: 'project = RQ AND labels = impl-dev AND (parent is EMPTY OR parent != RQ-1579) AND status in ("To Do") ORDER BY created ASC',
    });
    expect(jql).toContain("project = RQ");
    expect(jql).toContain("parent != RQ-1579");
    expect(jql).not.toContain("parent = TST-1");
  });

  it("throws when neither epic_key nor jql is set", () => {
    expect(() =>
      buildDevFactoryJql({
        ...FIXTURE_DEV_FACTORY,
        epic_key: undefined,
        jql: undefined,
      }),
    ).toThrow(/jql or.*epic_key/);
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

import { resolveTrackerProvider } from "../../lib/projectConfig.ts";
import type { ProjectConfig } from "../../lib/projectConfig.ts";

function baseConfig(over: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    name: "My App",
    slug: "myapp",
    dev_factory: FIXTURE_DEV_FACTORY,
    git: {
      provider: "github",
      workspace: "example-corp",
      repo: "my-app",
      default_branch: "main",
      branch_prefixes: ["feat"],
      ticket_key_pattern: "TST-\\d+",
    },
    stg: { base_url: "https://stg.example.com" },
    app: {
      repo_path: "../my-app",
      gate_command: "npm test",
      mr_push_command: "npm run mr:push",
      openspec_enabled: true,
      openspec_specs_dir: "openspec/specs",
    },
    loop: { purpose: "myappdev", interval_sec_default: 300 },
    ...over,
  };
}

describe("resolveTrackerProvider", () => {
  it("defaults to jira", () => {
    expect(resolveTrackerProvider(baseConfig({ git: {
      provider: "bitbucket",
      workspace: "example-corp",
      repo: "my-app",
      default_branch: "main",
      branch_prefixes: ["feat"],
      ticket_key_pattern: "TST-\\d+",
    }}))).toBe("jira");
  });

  it("uses explicit tracker.provider", () => {
    expect(
      resolveTrackerProvider(
        baseConfig({ tracker: { provider: "github_issues" } }),
      ),
    ).toBe("github_issues");
  });

  it("infers github_issues when jira disabled + github git", () => {
    expect(
      resolveTrackerProvider(
        baseConfig({ jira: { enabled: false } }),
      ),
    ).toBe("github_issues");
  });
});
