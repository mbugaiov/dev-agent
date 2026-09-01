/**
 * Shared routing for post_agent_started / post_agent_progress:
 * Jira KEY + optional Bitbucket PR dual-write when git.provider is bitbucket.
 */
import { githubTargetKey } from "./agentStartedStack.ts";
import type { ProjectConfig } from "./projectConfig.ts";

export function parsePrId(target: string): string | undefined {
  if (target.startsWith("pr:")) {
    const n = target.slice(3).trim();
    return /^\d+$/.test(n) ? n : undefined;
  }
  if (/^\d+$/.test(target.trim())) return target.trim();
  return undefined;
}

export function isJiraIssueKey(target: string): boolean {
  return /^[A-Z][A-Z0-9]+-\d+$/i.test(target.trim());
}

/** Bitbucket stacking targetKey — same shape as GitHub pr:N. */
export function bitbucketPrTargetKey(prId: string | number): string {
  return githubTargetKey("pr", prId);
}

export function shouldDualWriteBitbucketPr(config: ProjectConfig): boolean {
  return config.git.provider === "bitbucket";
}
