import { describe, expect, it } from "vitest";
import {
  isDevHandoffComment,
  mayTransitionAfterHandoffPost,
  planBacklogWithFollowOns,
  qaReturnBlocksValidateTesting,
  qaReturnedToDev,
} from "../../lib/jiraCommentGate.ts";
import { formatMergedPrUrl, type GitConfig } from "../../lib/projectConfig.ts";

const GIT: GitConfig = {
  provider: "bitbucket",
  workspace: "example-corp",
  repo: "my-app",
  default_branch: "main",
  branch_prefixes: ["feat"],
  ticket_key_pattern: "TST-\\d+",
};

describe("jiraCommentGate", () => {
  it("detects QA RETURN comments", () => {
    expect(
      qaReturnedToDev(
        "QA RETURN (blocked — cannot stay in Validate/Testing): relocate failed.",
      ),
    ).toBe(true);
    expect(qaReturnedToDev("What was implemented: foo")).toBe(false);
  });

  it("detects dev handoff comments", () => {
    const handoff = `What was implemented: test
Merged PR: ${formatMergedPrUrl(GIT, 69)}
Pipeline build: #191
STG buildId: 84d1171 (main 84d1171)`;
    expect(isDevHandoffComment(handoff)).toBe(true);
  });

  it("blocks Validate/Testing when QA RETURN is after last handoff", () => {
    const gate = qaReturnBlocksValidateTesting([
      {
        created: "2026-07-09T10:00:00.000Z",
        body: `What was implemented: x
Merged PR: ${formatMergedPrUrl(GIT, 67)}
Pipeline build: #187
STG buildId: 4e0eb4d (main 4e0eb4d)`,
      },
      {
        created: "2026-07-09T16:35:00.000Z",
        body: "QA RETURN (blocked — cannot stay in Validate/Testing): testids missing.",
      },
    ]);
    expect(gate.blocked).toBe(true);
  });

  it("planBacklogWithFollowOns picks dev follow-on over blocked parent", () => {
    const issues = [
      { key: "TST-108", summary: "Station", status: "In Progress" },
      { key: "TST-141", summary: "Listbox", status: "In Progress" },
    ];
    const plan = planBacklogWithFollowOns(
      issues,
      {
        "TST-108": [
          {
            created: "2026-07-09T16:35:00.000Z",
            body: "QA RETURN (blocked): Dev ticket: TST-141",
          },
        ],
        "TST-141": [],
      },
      GIT.ticket_key_pattern,
    );
    expect(plan.pickKey).toBe("TST-141");
    expect(plan.blockedByFollowOn["TST-108"]).toBe("TST-141");
  });

  it("allows transition after new handoff supersedes QA RETURN", () => {
    const comments = [
      {
        created: "2026-07-09T16:35:00.000Z",
        body: "QA RETURN (blocked): still broken.",
      },
      {
        created: "2026-07-09T18:00:00.000Z",
        body: `What was implemented: fix
Merged PR: ${formatMergedPrUrl(GIT, 70)}
Pipeline build: #192
STG buildId: abcdef1 (main abcdef1)`,
      },
    ];
    expect(qaReturnBlocksValidateTesting(comments).blocked).toBe(false);
    expect(mayTransitionAfterHandoffPost(comments)).toBe(true);
  });
});
