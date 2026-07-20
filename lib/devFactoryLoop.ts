// Dev factory loop helpers — pure, config-driven.

import {
  buildDevFactoryJql,
  DEV_FACTORY_TICK_POLICY,
  type ProjectConfig,
} from "./projectConfig.ts";
import {
  buildBacklogWakeExecution,
  formatExecutePrompt,
} from "./devFactoryExecution.ts";

export type DevFactoryIssue = { key: string; summary: string; status: string };

export type BacklogWakePayload = {
  count: number;
  oldest: string;
  issues: DevFactoryIssue[];
  jql: string;
  prompt: string;
  blockedByFollowOn?: Record<string, string>;
};

export const DEV_FACTORY_HANDOFF_STATUS = "Validate/Testing" as const;

function buildBasePrompt(config: ProjectConfig): string {
  return (
    `Policy: ${DEV_FACTORY_TICK_POLICY} ` +
    `Project: ${config.slug}. App repo: ${config.app.repo_path}. ` +
    `Gate: ${config.app.gate_command}. MR: ${config.app.mr_push_command}. ` +
    `FIRST: if the current branch has an OPEN PR, run wait_pr_pipeline — do NOT start another ticket until green or merged. ` +
    `When backlog exists, drain the full queue in this session (ticket after ticket: merge → STG handoff → next ticket) — do NOT stop after one ticket. ` +
    `When DEV_FACTORY_IDLE (zero tickets), stop and wait for the next loop tick only. ` +
    `On BACKLOG_WAKE or BACKLOG_WAKE_EXECUTE: BEGIN implementation immediately (branch → OpenSpec → code). ` +
    `FORBIDDEN: status-only replies. Follow .cursor/skills/dev-factory-loop/SKILL.md and dev-mr-pipeline skill. ` +
    `Hand off to ${config.dev_factory.handoff_status} with PR link + buildId. Never move feature tickets to Done. QA loop owns closure — do not run QA work in this tick.`
  );
}

export function devFactoryJql(config: ProjectConfig): string {
  return buildDevFactoryJql(config.dev_factory);
}

export function devFactoryShouldWake(count: number): boolean {
  return count > 0;
}

export function buildBacklogWakePayload(
  config: ProjectConfig,
  issues: DevFactoryIssue[],
  options?: {
    pickKey?: string;
    blockedByFollowOn?: Record<string, string>;
  },
): BacklogWakePayload {
  const jql = devFactoryJql(config);
  const oldest = options?.pickKey ?? issues[0]?.key ?? "";
  const ordered = oldest
    ? [
        ...issues.filter((i) => i.key === oldest),
        ...issues.filter((i) => i.key !== oldest),
      ]
    : issues;
  const blocked = options?.blockedByFollowOn ?? {};
  const draft: BacklogWakePayload = {
    count: issues.length,
    oldest,
    issues: ordered,
    jql,
    prompt: "",
    ...(Object.keys(blocked).length ? { blockedByFollowOn: blocked } : {}),
  };
  const execution = buildBacklogWakeExecution(
    draft,
    config.git.branch_prefixes,
  );
  const followOnNote =
    Object.keys(blocked).length > 0
      ? ` Follow-on pick: ${oldest} (${Object.entries(blocked)
          .map(([parent, follow]) => `${parent} blocked on ${follow}`)
          .join("; ")}).`
      : "";
  const prompt =
    issues.length > 0
      ? `Dev factory backlog (${config.slug}): ${issues.length} ticket(s). Start with ${oldest}.${followOnNote} ${formatExecutePrompt(execution)} ${buildBasePrompt(config)}`
      : buildBasePrompt(config);
  return { ...draft, prompt };
}

export function formatBacklogWakeLine(payload: BacklogWakePayload): string {
  return `BACKLOG_WAKE ${JSON.stringify(payload)}`;
}

export function formatDevFactoryIdleLine(
  config: ProjectConfig,
  count: number,
): string {
  return `DEV_FACTORY_IDLE ${JSON.stringify({
    count,
    slug: config.slug,
    jql: devFactoryJql(config),
    policy: DEV_FACTORY_TICK_POLICY,
    prompt:
      "No actionable dev-factory tickets. Wait for the next loop tick — do not invent work.",
  })}`;
}

export function formatJiraUnavailableTick(
  config: ProjectConfig,
): string {
  const purpose = config.loop.purpose;
  const prompt =
    `Jira unavailable — re-check dev factory backlog (${devFactoryJql(config)}). ` +
    buildBasePrompt(config);
  return `AGENT_LOOP_TICK_${purpose} ${JSON.stringify({ prompt, fallback: true })}`;
}

export function devFactoryExcludesQaOnly(jql: string): boolean {
  return jql.includes("labels not in (impl-qa");
}

export function devFactoryAppliesHumanExceptionsPolicy(
  jql: string,
  excludedKeys: readonly string[],
): boolean {
  for (const label of [
    "human-required",
    "factory-pause",
    "needs-human",
  ] as const) {
    if (!jql.includes(label)) return false;
  }
  for (const key of excludedKeys) {
    if (!jql.includes(key)) return false;
  }
  return jql.includes('status in ("To Do", "In Progress")');
}

export function devHandoffForQaLoop(
  status: string,
  handoffStatus: string,
): boolean {
  return status === handoffStatus;
}
