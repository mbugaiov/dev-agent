// Dev factory loop wiring — watcher patterns, session drain rules.

import { DEV_FACTORY_TICK_POLICY, DRAIN_QUEUE_AFTER_HANDOFF } from "./projectConfig.ts";

export type LoopWatchPattern = {
  pattern: string;
  reason: string;
};

export const DEV_FACTORY_LOOP_WATCH_PATTERNS: readonly LoopWatchPattern[] = [
  { pattern: "^BACKLOG_WAKE_EXECUTE", reason: "dev factory execute wake" },
  { pattern: "^BACKLOG_WAKE", reason: "dev factory backlog wake" },
  { pattern: "^DEV_FACTORY_IDLE", reason: "dev factory idle" },
  {
    pattern: "^MR_SESSION_MERGED_STALE_BRANCH",
    reason: "merged PR stale checkout — run handoff",
  },
  {
    pattern: "^MR_PR_BACKUP_(WAKE|GREEN|MERGED|MERGE_FAILED)",
    reason: "open PR pipeline backup wake",
  },
] as const;

export const PR_PIPELINE_WATCH_PATTERN: LoopWatchPattern = {
  pattern: "^PR_PIPELINE_(FAILED|GREEN)",
  reason: "PR pipeline result",
};

export const LOOP_ARM_SENTINEL = "LOOP_ARMED" as const;
export const LOOP_ARM_SCRIPT = "scripts/arm_dev_loop.sh" as const;
export const LOOP_SCHEDULER_SCRIPT = "scripts/dev-loop.sh" as const;
export const LOOP_UNARMED_SENTINEL = "LOOP_UNARMED_REFUSED" as const;

/** Build combined watch regex; optional loop purpose adds AGENT_LOOP_TICK_<purpose>. */
export function buildCombinedWatchPattern(loopPurpose?: string): string {
  const base =
    "^(BACKLOG_WAKE_EXECUTE|BACKLOG_WAKE|DEV_FACTORY_IDLE|LOOP_ARMED|LOOP_UNARMED_REFUSED|MR_SESSION_MERGED_STALE_BRANCH|MR_PR_BACKUP_)";
  if (loopPurpose) {
    return `${base.slice(0, -1)}|AGENT_LOOP_TICK_${loopPurpose})`;
  }
  return base;
}

export function sessionShouldContinueAfterHandoff(backlogCount: number): boolean {
  return backlogCount > 0;
}

export function sessionMayIdleUntilNextTick(backlogCount: number): boolean {
  return backlogCount === 0;
}

export function mustDrainQueueOnWake(backlogCount: number): boolean {
  return backlogCount > 0;
}

export function buildSessionEndChecklist(input: {
  backlogCount: number;
  hasOpenPr: boolean;
  loopArmed: boolean;
}): string[] {
  const steps: string[] = [];
  if (input.hasOpenPr) {
    steps.push(
      `Arm wait_pr_pipeline with notify_on_output on ${PR_PIPELINE_WATCH_PATTERN.pattern}`,
    );
  }
  if (sessionShouldContinueAfterHandoff(input.backlogCount)) {
    steps.push(
      "Start the next impl-dev ticket immediately (same session — do not wait for loop tick)",
    );
  } else {
    steps.push("Backlog empty — may idle until DEV_FACTORY_IDLE / next loop tick");
  }
  if (!input.loopArmed) {
    steps.push(
      `Re-arm dev loop: bash ${LOOP_ARM_SCRIPT} <slug> in background with notify_on_output`,
    );
  } else {
    steps.push("Dev loop armed with notify_on_output watchers");
  }
  return steps;
}

export function sessionEndAllowed(input: {
  backlogCount: number;
  hasOpenPr: boolean;
  loopArmed: boolean;
  prWatcherArmed: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (input.hasOpenPr && !input.prWatcherArmed) {
    return {
      ok: false,
      reason: "Open PR requires wait_pr_pipeline watcher before ending turn",
    };
  }
  if (sessionShouldContinueAfterHandoff(input.backlogCount)) {
    return {
      ok: false,
      reason:
        "Backlog non-empty — must start next ticket in same session, not end turn",
    };
  }
  if (!input.loopArmed) {
    return {
      ok: false,
      reason: `Dev loop not armed — run bash ${LOOP_ARM_SCRIPT} <slug> with notify_on_output`,
    };
  }
  return { ok: true };
}

export type LoopArmPayload = {
  sentinel: typeof LOOP_ARM_SENTINEL;
  slug: string;
  intervalSec: number;
  script: typeof LOOP_ARM_SCRIPT;
  loopScript: string;
  watchers: LoopWatchPattern[];
  prWatcher: LoopWatchPattern;
  combinedWatchPattern: string;
  instructions: string;
};

export function buildLoopArmPayload(
  slug: string,
  intervalSec: number,
  loopPurpose: string,
): LoopArmPayload {
  return {
    sentinel: LOOP_ARM_SENTINEL,
    slug,
    intervalSec,
    script: LOOP_ARM_SCRIPT,
    loopScript: LOOP_SCHEDULER_SCRIPT,
    watchers: [...DEV_FACTORY_LOOP_WATCH_PATTERNS],
    prWatcher: PR_PIPELINE_WATCH_PATTERN,
    combinedWatchPattern: buildCombinedWatchPattern(loopPurpose),
    instructions:
      "Launch arm_dev_loop.sh <slug> in background Shell with notify_on_output on each watcher pattern.",
  };
}

export function formatLoopArmLine(
  slug: string,
  intervalSec: number,
  loopPurpose: string,
): string {
  return `${LOOP_ARM_SENTINEL} ${JSON.stringify(buildLoopArmPayload(slug, intervalSec, loopPurpose))}`;
}

export function loopWiringDocsValid(...corpora: string[]): boolean {
  const text = corpora.join("\n").toLowerCase();
  const required: string[] = [
    "notify_on_output",
    "backlog_wake",
    "backlog_wake_execute",
    "status-only",
    LOOP_ARM_SCRIPT.toLowerCase(),
    "silently",
    "do not stop after one ticket",
    "re-run",
    "next ticket",
    "active factory",
    "factory_run_intent",
    DEV_FACTORY_TICK_POLICY.toLowerCase().slice(0, 20),
    DRAIN_QUEUE_AFTER_HANDOFF.toLowerCase().slice(0, 15),
  ];
  return required.every((k) => text.includes(k));
}
