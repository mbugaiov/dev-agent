// Load per-project dev factory config from projects/<slug>/project.yaml
// Pure parsing helpers — file I/O in scripts.

export type DevFactoryConfig = {
  epic_key: string;
  pickup_label: string;
  excluded_labels: readonly string[];
  excluded_issue_keys: readonly string[];
  statuses: readonly string[];
  handoff_status: string;
  forbidden_target_statuses: readonly string[];
  order_by: string;
};

export type GitConfig = {
  provider: "bitbucket" | "github";
  workspace: string;
  repo: string;
  default_branch: string;
  branch_prefixes: readonly string[];
  ticket_key_pattern: string;
};

export type AppConfig = {
  repo_path: string;
  gate_command: string;
  mr_push_command: string;
  openspec_enabled: boolean;
  openspec_specs_dir: string;
  wait_pr_pipeline_script?: string;
  wait_main_deploy_script?: string;
  resolve_pr_script?: string;
};

export type HandoffInput = {
  mergedPrUrl: string;
  pipelineBuildNumber: number | string;
  stgBuildId: string;
  mainCommit: string;
  summary: string;
  acceptanceSteps?: string[];
};

export type StgRetestHandoffInput = HandoffInput & {
  featureMainCommit?: string;
  followOnNotes?: string[];
};

export type JiraTransitions = {
  in_progress?: string;
  validate_testing?: string;
};

export type ProjectConfig = {
  name: string;
  slug: string;
  dev_factory: DevFactoryConfig;
  git: GitConfig;
  stg: { base_url: string; health_path?: string };
  app: AppConfig;
  loop: { purpose: string; interval_sec_default: number };
  jira?: {
    enabled?: boolean;
    default_labels?: string[];
    transitions?: JiraTransitions;
  };
};

/** Build JQL from project dev_factory block (no hardcoded epic). */
export function buildDevFactoryJql(df: DevFactoryConfig): string {
  const excluded =
    df.excluded_labels.length > 0
      ? ` AND labels not in (${df.excluded_labels.join(", ")})`
      : "";
  const statuses = df.statuses.map((s) => `"${s}"`).join(", ");
  const excludedKeys =
    df.excluded_issue_keys.length > 0
      ? ` AND key not in (${df.excluded_issue_keys.join(", ")})`
      : "";
  return (
    `parent = ${df.epic_key} AND labels = ${df.pickup_label}` +
    excluded +
    ` AND status in (${statuses})` +
    excludedKeys +
    ` ORDER BY ${df.order_by}`
  );
}

/** PR URL pattern for handoff validation. */
export function buildPrUrlPattern(git: GitConfig): RegExp {
  if (git.provider === "github") {
    return new RegExp(
      `github\\.com/${git.workspace}/${git.repo}/pull/\\d+`,
      "i",
    );
  }
  return new RegExp(
    `${git.workspace}/${git.repo}/pull-requests/\\d+`,
    "i",
  );
}

export function formatMergedPrUrl(git: GitConfig, prId: number | string): string {
  if (git.provider === "github") {
    return `https://github.com/${git.workspace}/${git.repo}/pull/${prId}`;
  }
  return `https://bitbucket.org/${git.workspace}/${git.repo}/pull-requests/${prId}`;
}

/** Default tick policy — shared across projects unless overridden in project-memory. */
export const DEV_FACTORY_TICK_POLICY =
  "One open MR at a time; many tickets per tick when backlog exists; idle only when JQL returns zero actionable tickets.";

export const DRAIN_QUEUE_AFTER_HANDOFF =
  "Next: re-run dev factory JQL; if any actionable tickets remain, start the next ticket immediately (same session — do not wait for loop tick).";

export const MIN_GIT_HASH_LEN = 7;

export function stgBuildIdMatchesMain(
  stgBuildId: string,
  mainCommit: string,
): boolean {
  const a = stgBuildId.trim().toLowerCase();
  const b = mainCommit.trim().toLowerCase();
  if (!a || !b) return false;
  if (a.length < MIN_GIT_HASH_LEN || b.length < MIN_GIT_HASH_LEN) return false;
  return a === b || b.startsWith(a) || a.startsWith(b);
}

export function handoffCommentValid(text: string, prPattern: RegExp): boolean {
  const hasPr = prPattern.test(text) || /pull-requests\/\d+/i.test(text);
  const hasBuildId = /buildId[=:\s]+[0-9a-f]{7,40}/i.test(text);
  const hasPipelineBuild = /pipeline build:\s*#\d+/i.test(text);
  return hasPr && hasBuildId && hasPipelineBuild;
}

export function formatHandoffComment(
  input: HandoffInput,
  options?: { includeDrainReminder?: boolean },
): string {
  const includeDrain = options?.includeDrainReminder ?? true;
  const lines = [
    `What was implemented: ${input.summary}`,
    `Merged PR: ${input.mergedPrUrl}`,
    `Pipeline build: #${input.pipelineBuildNumber}`,
    `STG buildId: ${input.stgBuildId} (main ${input.mainCommit})`,
  ];
  if (input.acceptanceSteps?.length) {
    lines.push("", "Acceptance steps:");
    for (let i = 0; i < input.acceptanceSteps.length; i++) {
      lines.push(`${i + 1}. ${input.acceptanceSteps[i]}`);
    }
  }
  if (includeDrain) {
    lines.push(DRAIN_QUEUE_AFTER_HANDOFF);
  }
  return lines.join("\n");
}

export function formatStgRetestHandoffComment(
  input: StgRetestHandoffInput,
  options?: { includeDrainReminder?: boolean },
): string {
  const base = formatHandoffComment(input, { includeDrainReminder: false });
  const lines = [
    base,
    "",
    "STG retest handoff: validate against the STG buildId above (current main on STG).",
  ];
  const feature = input.featureMainCommit?.trim();
  if (feature && !stgBuildIdMatchesMain(feature, input.mainCommit)) {
    lines.push(
      `Feature merge commit: ${feature} (STG includes later main commits).`,
    );
  }
  if (input.followOnNotes?.length) {
    lines.push("Follow-on fixes on main since feature merge:");
    for (const note of input.followOnNotes) {
      lines.push(`- ${note}`);
    }
  }
  if (options?.includeDrainReminder ?? true) {
    lines.push(DRAIN_QUEUE_AFTER_HANDOFF);
  }
  return lines.join("\n");
}

export function qaNeedsStgRetestHandoff(commentText: string): boolean {
  const t = commentText.toLowerCase();
  return (
    /no dev handoff/.test(t) ||
    /handoff.*merge sha/.test(t) ||
    /buildid gate mismatch/.test(t) ||
    /need dev comment with merge sha/.test(t) ||
    /not done.*handoff/.test(t)
  );
}

export function devMayTransitionTo(
  status: string,
  forbidden: readonly string[],
): boolean {
  return !forbidden.includes(status);
}
