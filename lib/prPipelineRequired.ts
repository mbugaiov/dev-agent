/**
 * Resolve PR pipeline waiter strategy from project.yaml (pure — no network).
 */
import type { ProjectConfig } from "./projectConfig.ts";

export const ENGINE_GITHUB_REQUIRED_CHECKS = [
  "test",
  "review (Themis)",
  "isolation (Themis)",
] as const;

export const APP_GITHUB_REQUIRED_CHECKS = [
  "gate",
  "review (Themis)",
  "isolation (Themis)",
] as const;

/** Bitbucket (and non-GitHub git providers) must use app wait_pr_pipeline scripts. */
export function shouldDelegatePrPipelineToApp(config: ProjectConfig): boolean {
  return config.git.provider !== "github";
}

/** GitHub required checks for gh pr checks polling. */
export function resolveGithubPrRequiredChecks(
  config: ProjectConfig,
  engineRepo?: string | null,
): string[] {
  const custom = config.git.pr_required_checks;
  if (custom?.length) return [...custom];
  const repo = `${config.git.workspace}/${config.git.repo}`;
  if (engineRepo && repo === engineRepo) {
    return [...ENGINE_GITHUB_REQUIRED_CHECKS];
  }
  return [...APP_GITHUB_REQUIRED_CHECKS];
}
