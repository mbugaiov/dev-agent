import { describe, expect, it } from "vitest";
import {
  commentsHaveUxCharterReady,
  filterExcludedIssueNumbers,
  githubIssuesSearchUrl,
  mapGithubSearchItem,
  parseGithubIssueNumber,
} from "../../lib/githubIssuesBacklog.ts";

describe("githubIssuesBacklog", () => {
  it("builds search URL with pickup and excluded labels", () => {
    const url = githubIssuesSearchUrl({
      owner: "mbugaiov",
      repo: "pantheon",
      pickupLabel: "impl-dev",
      excludedLabels: ["human-required", "factory-pause"],
    });
    expect(url).toContain("api.github.com/search/issues");
    expect(decodeURIComponent(url)).toContain("label:impl-dev");
    expect(decodeURIComponent(url)).toContain("-label:human-required");
    expect(decodeURIComponent(url)).toContain("repo:mbugaiov/pantheon");
  });

  it("maps search items to factory keys", () => {
    const issue = mapGithubSearchItem(
      {
        number: 12,
        title: "Add seals",
        state: "open",
        labels: [{ name: "impl-dev" }, { name: "pantheon" }],
      },
      "pantheon",
    );
    expect(issue.key).toBe("pantheon#12");
    expect(issue.labels).toContain("impl-dev");
  });

  it("filters excluded issue numbers", () => {
    const issues = [
      mapGithubSearchItem(
        { number: 1, title: "a", state: "open" },
        "pantheon",
      ),
      mapGithubSearchItem(
        { number: 2, title: "b", state: "open" },
        "pantheon",
      ),
    ];
    expect(filterExcludedIssueNumbers(issues, [1]).map((i) => i.number)).toEqual([
      2,
    ]);
  });

  it("parses issue numbers from keys", () => {
    expect(parseGithubIssueNumber("pantheon#9")).toBe(9);
    expect(parseGithubIssueNumber("#9")).toBe(9);
    expect(parseGithubIssueNumber("nope")).toBeNull();
  });

  it("detects UX_CHARTER_READY in comments", () => {
    expect(
      commentsHaveUxCharterReady([{ body: "WIP" }, { body: "UX_CHARTER_READY\nok" }]),
    ).toBe(true);
    expect(commentsHaveUxCharterReady([{ body: "not yet" }])).toBe(false);
  });
});
