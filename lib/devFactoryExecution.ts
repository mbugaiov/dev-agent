// Dev factory execution contract — every backlog tick emits BACKLOG_WAKE_EXECUTE only.

import type { GitConfig } from "./projectConfig.ts";
import type { BacklogWakePayload } from "./devFactoryLoop.ts";

export const BACKLOG_WAKE_EXECUTE_SENTINEL = "BACKLOG_WAKE_EXECUTE" as const;

/** Shell watcher policy: no inform-only backlog wake — execute in the tick turn. */
export const SHELL_WATCHER_AGENT_MUST_EXECUTE =
  "Every backlog tick emits BACKLOG_WAKE_EXECUTE only (no BACKLOG_WAKE). Start oldest ticket in that turn — status-only replies forbidden.";

export const PENDING_EXECUTE_PATH = ".cursor/dev-factory-pending-execute.json";

export const STATUS_ONLY_PHRASES = [
  "ready when you say go",
  "say the word",
  "ready for ",
  "loop healthy",
  "no dev work in flight",
  "nothing new to act on",
  "tick #",
  "when you want",
  "when you're ready",
  "briefly inform",
  "no open mr blocking",
] as const;

export const FACTORY_RUN_INTENT_PHRASES = [
  "run loop",
  "execute loop",
  "arm loop",
  "arm dev loop",
  "arm dev factory",
  "start factory",
  "start dev factory",
  "dev factory loop",
  "work the backlog",
  "drain backlog",
  "drain the queue",
  "drain the backlog",
  "force tick",
  "factory tick",
  "active factory",
  "run factory",
  "execute factory",
  "loop every",
  "tick every",
  "loop:arm",
] as const;

export const DEFAULT_FACTORY_LOOP_INTERVAL_SEC = 300;

export function userRequestedActiveFactoryRun(text: string): boolean {
  const lower = text.toLowerCase();
  return FACTORY_RUN_INTENT_PHRASES.some((p) => lower.includes(p));
}

export function parseFactoryLoopIntervalSec(
  text: string,
  defaultSec = DEFAULT_FACTORY_LOOP_INTERVAL_SEC,
): number {
  const lower = text.toLowerCase();
  const minMatch = lower.match(
    /(?:every|interval)\s+(\d+)\s*(?:m(?:in(?:ute)?s?)?)\b/,
  );
  if (minMatch) {
    const n = Number(minMatch[1]);
    if (n > 0 && n <= 1440) return n * 60;
  }
  const secMatch = lower.match(/dev_loop_interval_sec\s*=\s*(\d+)/i);
  if (secMatch) {
    const n = Number(secMatch[1]);
    if (n >= 60 && n <= 86400) return n;
  }
  return defaultSec;
}

export type PendingExecuteState = {
  oldest: string;
  count: number;
  branchPrefix: string;
  issuedAt: string;
  consumed: boolean;
  executePrompt: string;
  /** Factory slug — stop/session hooks must not require DEV_AGENT_SLUG. */
  slug?: string;
};

export type BacklogWakeExecution = {
  executeNow: true;
  oldest: string;
  count: number;
  branchPrefix: string;
  forbidden: readonly string[];
  firstSteps: string[];
};

export function ticketBranchPrefix(
  ticketKey: string,
  branchPrefixes: readonly string[],
): string {
  return branchPrefixes.map((k) => `${k}/${ticketKey}`).join("|");
}

export function ticketBranchPrefixes(
  ticketKey: string,
  branchPrefixes: readonly string[],
): readonly string[] {
  return branchPrefixes.map((k) => `${k}/${ticketKey}`);
}

/** Build regex fragment from git.ticket_key_pattern e.g. "TST-\\d+" */
function ticketKeyCapture(pattern: string): string {
  return pattern.replace(/^\^/, "").replace(/\$$/, "");
}

export function parseTicketKeyFromBranch(
  branch: string,
  git: Pick<GitConfig, "branch_prefixes" | "ticket_key_pattern">,
): string | null {
  const prefixes = git.branch_prefixes.join("|");
  const key = ticketKeyCapture(git.ticket_key_pattern);
  const match = branch.match(new RegExp(`^(?:${prefixes})/(${key})`));
  return match?.[1] ?? null;
}

export function isOnAnyTicketBranch(
  currentBranch: string,
  git: Pick<GitConfig, "branch_prefixes" | "ticket_key_pattern">,
): boolean {
  return parseTicketKeyFromBranch(currentBranch, git) !== null;
}

export function consumePendingExecuteState(
  state: PendingExecuteState,
): PendingExecuteState {
  return { ...state, consumed: true };
}

export function shouldConsumePendingOnHandoff(
  pending: PendingExecuteState | null,
  handoffTicketKey: string,
): boolean {
  return (
    pending !== null &&
    !pending.consumed &&
    pending.oldest === handoffTicketKey
  );
}

export function buildBacklogWakeExecution(
  payload: BacklogWakePayload,
  branchPrefixes: readonly string[],
  tracker: "jira" | "github_issues" = "jira",
): BacklogWakeExecution {
  const oldest = payload.oldest;
  const pickupStep =
    tracker === "github_issues"
      ? `bash scripts/pickup_github_ticket.sh <slug> ${oldest} --scope "<plan>"`
      : `bash scripts/pickup_jira_ticket.sh <slug> ${oldest} --scope "<plan>" --points <n>`;
  const progressStep =
    tracker === "github_issues"
      ? `Ensure ${oldest} stays open with pickup label (impl-dev); remove validate-testing if present`
      : `Transition ${oldest} → In Progress (if To Do)`;
  const handoffHint =
    tracker === "github_issues"
      ? "OpenSpec change → implement → run app gate command → MR push → post_github_handoff.ts"
      : "OpenSpec change → implement → run app gate command → MR push";
  return {
    executeNow: true,
    oldest,
    count: payload.count,
    branchPrefix: ticketBranchPrefix(oldest, branchPrefixes),
    forbidden: [...STATUS_ONLY_PHRASES],
    firstSteps: [
      pickupStep,
      progressStep,
      `git checkout -B <prefix>/${oldest}-<slug> origin/<default-branch>`,
      handoffHint,
      "Do NOT end turn with status-only; drain until DEV_FACTORY_IDLE",
    ],
  };
}

export function buildPendingExecuteState(
  payload: BacklogWakePayload,
  branchPrefixes: readonly string[],
  tracker: "jira" | "github_issues" = "jira",
  slug?: string,
): PendingExecuteState {
  const execution = buildBacklogWakeExecution(payload, branchPrefixes, tracker);
  return {
    oldest: payload.oldest,
    count: payload.count,
    branchPrefix: execution.branchPrefix,
    issuedAt: new Date().toISOString(),
    consumed: false,
    executePrompt: formatExecutePrompt(execution),
    ...(slug ? { slug } : {}),
  };
}

export function formatExecutePrompt(execution: BacklogWakeExecution): string {
  return (
    `BACKLOG_WAKE_EXECUTE: Start ${execution.oldest} NOW in this turn. ` +
    `Branch prefix ${execution.branchPrefix}-*. ` +
    `Forbidden: status-only replies (${execution.forbidden.slice(0, 3).join(", ")}…). ` +
    `Steps: ${execution.firstSteps.join(" → ")}`
  );
}

export function formatBacklogWakeExecuteLine(
  payload: BacklogWakePayload,
  branchPrefixes: readonly string[],
  tracker: "jira" | "github_issues" = "jira",
): string {
  const execution = buildBacklogWakeExecution(payload, branchPrefixes, tracker);
  return `${BACKLOG_WAKE_EXECUTE_SENTINEL} ${JSON.stringify({
    ...execution,
    issues: payload.issues,
    jql: payload.jql,
    ...(payload.blockedByFollowOn
      ? { blockedByFollowOn: payload.blockedByFollowOn }
      : {}),
    prompt: formatExecutePrompt(execution),
    wakePrompt: payload.prompt,
  })}`;
}

export function isStatusOnlyAgentReply(text: string): boolean {
  const lower = text.toLowerCase();
  if (!lower.trim()) return false;
  const hits = STATUS_ONLY_PHRASES.filter((p) => lower.includes(p));
  if (hits.length >= 2) return true;
  if (hits.length === 1 && /tick #\d+/i.test(lower)) return true;
  if (
    hits.length >= 1 &&
    !lower.includes("openspec") &&
    !lower.includes("git checkout") &&
    !lower.includes("implement")
  ) {
    return lower.includes("loop ok") || lower.includes("backlog unchanged");
  }
  return false;
}

export function hasStartedTicketWork(
  currentBranch: string,
  ticketKey: string,
  git: Pick<GitConfig, "branch_prefixes" | "ticket_key_pattern">,
): boolean {
  return ticketBranchPrefixes(ticketKey, git.branch_prefixes).some((prefix) =>
    currentBranch.startsWith(prefix),
  );
}

export function shouldForceDrainFollowup(input: {
  pending: PendingExecuteState | null;
  currentBranch: string;
  hasWorkingTreeChanges: boolean;
  hasOpenPr?: boolean;
  loopCount: number;
  maxFollowups?: number;
  git: Pick<GitConfig, "branch_prefixes" | "ticket_key_pattern">;
}): { force: true; message: string } | { force: false } {
  const max = input.maxFollowups ?? 5;
  if (!input.pending || input.pending.consumed || input.pending.count <= 0) {
    return { force: false };
  }
  if (input.loopCount >= max) return { force: false };
  if (input.hasWorkingTreeChanges) return { force: false };
  if (input.hasOpenPr) return { force: false };
  if (
    hasStartedTicketWork(
      input.currentBranch,
      input.pending.oldest,
      input.git,
    )
  ) {
    return { force: false };
  }
  const activeKey = parseTicketKeyFromBranch(input.currentBranch, input.git);
  if (activeKey && activeKey !== input.pending.oldest) {
    return { force: false };
  }
  return {
    force: true,
    message:
      `${input.pending.executePrompt} ` +
      `You ended the turn without starting ${input.pending.oldest}. ` +
      `Begin implementation immediately — no status summary.`,
  };
}
