import { describe, expect, it } from "vitest";
import { FIXTURE_CONFIG } from "../fixtures/projectFixture.ts";
import {
  APP_GITHUB_REQUIRED_CHECKS,
  ENGINE_GITHUB_REQUIRED_CHECKS,
  resolveGithubPrRequiredChecks,
  shouldDelegatePrPipelineToApp,
} from "../../lib/prPipelineRequired.ts";
import type { ProjectConfig } from "../../lib/projectConfig.ts";

function githubConfig(
  overrides: Partial<ProjectConfig["git"]> = {},
): ProjectConfig {
  return {
    ...FIXTURE_CONFIG,
    git: {
      ...FIXTURE_CONFIG.git,
      provider: "github",
      workspace: "acme-corp",
      repo: "example-app",
      ...overrides,
    },
  };
}

describe("prPipelineRequired (#89 contract)", () => {
  it("delegates non-GitHub git.provider to app wait_pr_pipeline", () => {
    expect(shouldDelegatePrPipelineToApp(FIXTURE_CONFIG)).toBe(true);
    expect(shouldDelegatePrPipelineToApp(githubConfig())).toBe(false);
  });

  it("GitHub app repos default to gate + Themis checks", () => {
    expect(resolveGithubPrRequiredChecks(githubConfig(), "acme-corp/dev-agent")).toEqual(
      [...APP_GITHUB_REQUIRED_CHECKS],
    );
  });

  it("engine repo match uses test + Themis checks", () => {
    const engineCfg = githubConfig({
      workspace: "acme-corp",
      repo: "dev-agent",
    });
    expect(
      resolveGithubPrRequiredChecks(engineCfg, "acme-corp/dev-agent"),
    ).toEqual([...ENGINE_GITHUB_REQUIRED_CHECKS]);
  });

  it("honors git.pr_required_checks override", () => {
    expect(
      resolveGithubPrRequiredChecks(
        githubConfig({ pr_required_checks: ["lint", "build"] }),
        null,
      ),
    ).toEqual(["lint", "build"]);
  });
});
