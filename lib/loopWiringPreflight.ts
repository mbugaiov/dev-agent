// Loop wiring preflight — pure.

import {
  DEV_FACTORY_LOOP_WATCH_PATTERNS,
  LOOP_ARM_SCRIPT,
  LOOP_ARM_SENTINEL,
  LOOP_SCHEDULER_SCRIPT,
  LOOP_UNARMED_SENTINEL,
  loopWiringDocsValid,
  PR_PIPELINE_WATCH_PATTERN,
} from "./devFactoryLoopWiring.ts";

export const LOOP_WIRING_PREFLIGHT_PATHS = [
  "lib/devFactoryLoopWiring.ts",
  "lib/devFactoryLoop.ts",
  "lib/devFactoryExecution.ts",
  "lib/projectConfig.ts",
  "scripts/arm_dev_loop.sh",
  "scripts/dev_factory_tick.ts",
  "scripts/dev_factory_stop_hook.ts",
  "scripts/dev_factory_session_start_hook.ts",
  "scripts/print_loop_armed.ts",
  "scripts/dev-loop.sh",
  ".cursor/hooks.json",
  ".cursor/hooks/dev-factory-drain-stop.sh",
  ".cursor/skills/dev-factory-loop/SKILL.md",
  ".cursor/rules/dev-factory-active.mdc",
  "AGENTS.md",
] as const;

export function touchesLoopWiringPreflight(paths: string[]): boolean {
  return paths.some((p) =>
    LOOP_WIRING_PREFLIGHT_PATHS.some(
      (h) => p === h || p.endsWith(`/${h}`) || p.includes(h),
    ),
  );
}

export function loopWatchPatternsComplete(): boolean {
  const patterns = DEV_FACTORY_LOOP_WATCH_PATTERNS.map((w) => w.pattern);
  return (
    patterns.includes("^BACKLOG_WAKE_EXECUTE") &&
    patterns.includes("^BACKLOG_WAKE") &&
    patterns.includes("^DEV_FACTORY_IDLE") &&
    patterns.includes("^MR_SESSION_MERGED_STALE_BRANCH")
  );
}

export function armScriptMentionedInDocs(
  skillText: string,
  agentsText: string,
): boolean {
  return skillText.includes(LOOP_ARM_SCRIPT) && agentsText.includes(LOOP_ARM_SCRIPT);
}

export function runLoopWiringPreflight(input: {
  skillDoc: string;
  agentsDoc: string;
  dodDoc: string;
  armScript: string;
  schedulerScript: string;
  hooksJson?: string;
}): { ok: true } | { ok: false; reason: string } {
  if (!loopWatchPatternsComplete()) {
    return { ok: false, reason: "DEV_FACTORY_LOOP_WATCH_PATTERNS incomplete" };
  }
  if (!PR_PIPELINE_WATCH_PATTERN.pattern.startsWith("^PR_PIPELINE_")) {
    return { ok: false, reason: "PR_PIPELINE_WATCH_PATTERN regression" };
  }
  if (
    !loopWiringDocsValid(
      input.skillDoc,
      input.agentsDoc,
      input.dodDoc,
    )
  ) {
    return {
      ok: false,
      reason: "Loop wiring docs missing notify_on_output / arm script / drain policy",
    };
  }
  if (!armScriptMentionedInDocs(input.skillDoc, input.agentsDoc)) {
    return { ok: false, reason: "arm_dev_loop.sh not referenced in skill + AGENTS" };
  }
  if (!input.armScript.includes(LOOP_ARM_SENTINEL)) {
    return { ok: false, reason: "arm_dev_loop.sh missing LOOP_ARMED sentinel" };
  }
  if (!input.armScript.includes(LOOP_SCHEDULER_SCRIPT)) {
    return { ok: false, reason: "arm_dev_loop.sh must launch dev-loop.sh" };
  }
  if (!input.armScript.includes("DEV_LOOP_ARMED=1")) {
    return { ok: false, reason: "arm_dev_loop.sh must export DEV_LOOP_ARMED=1" };
  }
  if (!input.armScript.includes("print_loop_armed.ts")) {
    return { ok: false, reason: "arm_dev_loop.sh must use print_loop_armed.ts" };
  }
  if (input.armScript.includes("pkill -f 'scripts/arm_dev_loop.sh'")) {
    return { ok: false, reason: "arm_dev_loop.sh must not pkill itself" };
  }
  if (!input.armScript.includes("BACKLOG_WAKE_EXECUTE")) {
    return { ok: false, reason: "arm_dev_loop.sh must mention BACKLOG_WAKE_EXECUTE" };
  }
  if (input.hooksJson && !input.hooksJson.includes("dev-factory-drain-stop")) {
    return { ok: false, reason: "hooks.json missing dev-factory drain stop hook" };
  }
  if (!input.schedulerScript.includes(LOOP_UNARMED_SENTINEL)) {
    return { ok: false, reason: "dev-loop.sh must refuse unarmed execution" };
  }
  if (input.schedulerScript.includes("FALLBACK_PROMPT")) {
    return { ok: false, reason: "dev-loop.sh still has stale FALLBACK_PROMPT" };
  }
  return { ok: true };
}
