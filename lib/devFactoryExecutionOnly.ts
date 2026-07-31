// Execution-only dev factory policy — no inform-only backlog wakes, ever.

import {
  BACKLOG_WAKE_EXECUTE_SENTINEL,
  type BacklogWakeExecution,
} from "./devFactoryExecution.ts";
import { DEV_FACTORY_LOOP_WATCH_PATTERNS } from "./devFactoryLoopWiring.ts";

export const INFORM_ONLY_WAKE_SENTINEL = "BACKLOG_WAKE" as const;
export const IDLE_SENTINEL = "DEV_FACTORY_IDLE" as const;

/** Engine files that must never reintroduce inform-only backlog wakes. */
export const EXECUTION_ONLY_POLICY_SOURCE_PATHS = [
  "scripts/dev_factory_tick.ts",
  "scripts/dev_factory_tick.sh",
  "scripts/arm_dev_loop.sh",
  "scripts/dev-loop.sh",
  "lib/devFactoryLoop.ts",
  "lib/devFactoryLoopWiring.ts",
  "lib/devFactoryExecution.ts",
  "lib/loopWiringPreflight.ts",
] as const;

export type TickOutputKind = "execute" | "idle" | "jira_fallback";

export type TickOutputValidation =
  | { ok: true; kind: TickOutputKind }
  | { ok: false; reason: string };

export type PolicyViolation = { file: string; reason: string };

export type PolicyScanResult =
  | { ok: true }
  | { ok: false; violations: PolicyViolation[] };

/** True when line is inform-only BACKLOG_WAKE (not BACKLOG_WAKE_EXECUTE). */
export function isInformOnlyBacklogWakeLine(line: string): boolean {
  const trimmed = line.trimStart();
  if (!trimmed.startsWith(INFORM_ONLY_WAKE_SENTINEL)) return false;
  return !trimmed.startsWith(`${BACKLOG_WAKE_EXECUTE_SENTINEL} `);
}

/** True when a shell watcher pattern would match inform-only backlog wakes. */
export function isInformOnlyWatchPattern(pattern: string): boolean {
  if (pattern === "^BACKLOG_WAKE") return true;
  if (/BACKLOG_WAKE\|/.test(pattern) && !pattern.includes("BACKLOG_WAKE_EXECUTE")) {
    return true;
  }
  if (pattern.includes("^BACKLOG_WAKE)") && !pattern.includes("BACKLOG_WAKE_EXECUTE")) {
    return true;
  }
  return false;
}

export function parseBacklogWakeExecutePayload(
  line: string,
): BacklogWakeExecution & Record<string, unknown> {
  const prefix = `${BACKLOG_WAKE_EXECUTE_SENTINEL} `;
  if (!line.trimStart().startsWith(prefix)) {
    throw new Error("Not a BACKLOG_WAKE_EXECUTE line");
  }
  return JSON.parse(line.trimStart().slice(prefix.length)) as BacklogWakeExecution &
    Record<string, unknown>;
}

export function validateExecuteWakeLine(line: string): TickOutputValidation {
  if (isInformOnlyBacklogWakeLine(line)) {
    return {
      ok: false,
      reason: "Inform-only BACKLOG_WAKE line is forbidden — use BACKLOG_WAKE_EXECUTE only",
    };
  }
  const prefix = `${BACKLOG_WAKE_EXECUTE_SENTINEL} `;
  if (!line.trimStart().startsWith(prefix)) {
    return { ok: false, reason: "Expected BACKLOG_WAKE_EXECUTE line" };
  }
  let payload: BacklogWakeExecution & Record<string, unknown>;
  try {
    payload = parseBacklogWakeExecutePayload(line);
  } catch {
    return { ok: false, reason: "BACKLOG_WAKE_EXECUTE JSON parse failed" };
  }
  if (payload.executeNow !== true) {
    return { ok: false, reason: "BACKLOG_WAKE_EXECUTE must set executeNow: true" };
  }
  if (!payload.oldest || typeof payload.oldest !== "string") {
    return { ok: false, reason: "BACKLOG_WAKE_EXECUTE missing oldest ticket key" };
  }
  const prompt = String(payload.prompt ?? "");
  if (!prompt.includes("NOW") || !prompt.includes(BACKLOG_WAKE_EXECUTE_SENTINEL)) {
    return {
      ok: false,
      reason: "BACKLOG_WAKE_EXECUTE prompt missing mandatory execute contract",
    };
  }
  if (!Array.isArray(payload.firstSteps) || payload.firstSteps.length === 0) {
    return { ok: false, reason: "BACKLOG_WAKE_EXECUTE missing firstSteps" };
  }
  return { ok: true, kind: "execute" };
}

export function validateJiraFallbackLine(line: string): TickOutputValidation {
  if (!/^AGENT_LOOP_TICK_/.test(line.trimStart())) {
    return { ok: false, reason: "Expected AGENT_LOOP_TICK fallback line" };
  }
  const jsonStart = line.indexOf("{");
  if (jsonStart < 0) {
    return { ok: false, reason: "AGENT_LOOP_TICK missing JSON payload" };
  }
  let payload: { executeNow?: boolean; prompt?: string; fallback?: boolean };
  try {
    payload = JSON.parse(line.slice(jsonStart)) as typeof payload;
  } catch {
    return { ok: false, reason: "AGENT_LOOP_TICK JSON parse failed" };
  }
  if (payload.executeNow !== true) {
    return {
      ok: false,
      reason: "Jira fallback tick must set executeNow: true (re-tick + start on execute wake)",
    };
  }
  const prompt = String(payload.prompt ?? "");
  if (
    !prompt.includes("dev_factory_tick") ||
    !prompt.includes(BACKLOG_WAKE_EXECUTE_SENTINEL)
  ) {
    return {
      ok: false,
      reason: "Jira fallback prompt must instruct immediate re-tick and execute wake",
    };
  }
  return { ok: true, kind: "jira_fallback" };
}

/** Validate full stdout from one dev_factory_tick run (non-schedule lines only). */
export function validateTickStdout(stdout: string): TickOutputValidation {
  const lines = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  for (const line of lines) {
    if (isInformOnlyBacklogWakeLine(line)) {
      return {
        ok: false,
        reason: `Inform-only wake in tick output: ${line.slice(0, 120)}`,
      };
    }
  }

  const executeLines = lines.filter((l) =>
    l.startsWith(`${BACKLOG_WAKE_EXECUTE_SENTINEL} `),
  );
  const idleLines = lines.filter((l) => l.startsWith(`${IDLE_SENTINEL} `));
  const fallbackLines = lines.filter((l) => /^AGENT_LOOP_TICK_/.test(l));

  if (executeLines.length > 0 && idleLines.length > 0) {
    return {
      ok: false,
      reason: "Tick cannot emit both BACKLOG_WAKE_EXECUTE and DEV_FACTORY_IDLE",
    };
  }
  if (executeLines.length > 1) {
    return { ok: false, reason: "Tick emitted multiple BACKLOG_WAKE_EXECUTE lines" };
  }
  if (idleLines.length > 1) {
    return { ok: false, reason: "Tick emitted multiple DEV_FACTORY_IDLE lines" };
  }
  if (fallbackLines.length > 1) {
    return { ok: false, reason: "Tick emitted multiple AGENT_LOOP_TICK fallback lines" };
  }

  if (executeLines.length === 1) {
    return validateExecuteWakeLine(executeLines[0]!);
  }
  if (idleLines.length === 1) {
    return { ok: true, kind: "idle" };
  }
  if (fallbackLines.length === 1) {
    return validateJiraFallbackLine(fallbackLines[0]!);
  }

  return { ok: false, reason: "Tick stdout missing execute, idle, or jira fallback sentinel" };
}

/** Validate a single tick line before printing — throws on policy violation. */
export function assertValidTickLine(line: string): void {
  const trimmed = line.trim();
  if (!trimmed) return;

  if (isInformOnlyBacklogWakeLine(trimmed)) {
    throw new Error(
      "EXECUTION_ONLY_POLICY: inform-only BACKLOG_WAKE emission blocked",
    );
  }

  if (trimmed.startsWith(`${BACKLOG_WAKE_EXECUTE_SENTINEL} `)) {
    const result = validateExecuteWakeLine(trimmed);
    if (!result.ok) {
      throw new Error(`EXECUTION_ONLY_POLICY: ${result.reason}`);
    }
    return;
  }

  if (trimmed.startsWith(`${IDLE_SENTINEL} `)) {
    return;
  }

  if (/^AGENT_LOOP_TICK_/.test(trimmed)) {
    const result = validateJiraFallbackLine(trimmed);
    if (!result.ok) {
      throw new Error(`EXECUTION_ONLY_POLICY: ${result.reason}`);
    }
    return;
  }

  // stderr / diagnostics — not tick sentinels
  if (trimmed.startsWith("dev_factory_tick:")) return;
  if (trimmed.startsWith("TICK_NOTIFY_FAILED ")) return;
  if (trimmed.startsWith("SECRETS_ENV_UNSAFE ")) return;

  throw new Error(
    `EXECUTION_ONLY_POLICY: unexpected tick line sentinel: ${trimmed.slice(0, 80)}`,
  );
}

export function validateLoopWatchPatterns(
  patterns: readonly { pattern: string }[],
): PolicyScanResult {
  const violations: PolicyViolation[] = [];
  for (const { pattern } of patterns) {
    if (isInformOnlyWatchPattern(pattern)) {
      violations.push({
        file: "lib/devFactoryLoopWiring.ts",
        reason: `Inform-only watcher pattern forbidden: ${pattern}`,
      });
    }
  }
  if (!patterns.some((p) => p.pattern === "^BACKLOG_WAKE_EXECUTE")) {
    violations.push({
      file: "lib/devFactoryLoopWiring.ts",
      reason: "Missing required ^BACKLOG_WAKE_EXECUTE watcher",
    });
  }
  return violations.length ? { ok: false, violations } : { ok: true };
}

export function validateArmScriptContent(script: string): PolicyScanResult {
  const violations: PolicyViolation[] = [];
  if (!script.includes("BACKLOG_WAKE_EXECUTE")) {
    violations.push({
      file: "scripts/arm_dev_loop.sh",
      reason: "arm script must mention BACKLOG_WAKE_EXECUTE",
    });
  }
  if (/BACKLOG_WAKE\|/.test(script)) {
    violations.push({
      file: "scripts/arm_dev_loop.sh",
      reason: "arm script must not watch inform-only BACKLOG_WAKE",
    });
  }
  if (/On BACKLOG_WAKE:/.test(script) || /On BACKLOG_WAKE[^_]/.test(script)) {
    violations.push({
      file: "scripts/arm_dev_loop.sh",
      reason: "arm script must not instruct agents on inform-only BACKLOG_WAKE",
    });
  }
  return violations.length ? { ok: false, violations } : { ok: true };
}

type SourceRule = { test: (content: string) => boolean; reason: string };

const WIRING_RULE: SourceRule = {
  test: (c) => !/\{ pattern: "\^BACKLOG_WAKE"/.test(c),
  reason: 'Must not define ^BACKLOG_WAKE watcher (use ^BACKLOG_WAKE_EXECUTE only)',
};

export function scanSourceFile(path: string, content: string): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  if (path.endsWith("dev_factory_tick.ts") && !content.includes("assertValidTickLine")) {
    violations.push({
      file: path,
      reason:
        "dev_factory_tick.ts must validate lines via assertValidTickLine before emit",
    });
  }

  const rules: SourceRule[] = [
    {
      id: "no-formatBacklogWakeLine",
      test: (c) => !c.includes("formatBacklogWakeLine"),
      reason: "formatBacklogWakeLine removed — use formatBacklogWakeExecuteLine only",
    },
    {
      id: "no-inform-wake-console-log",
      test: (c) => !/console\.log\(\s*[`'"]BACKLOG_WAKE[`'"]/.test(c),
      reason: "Must not console.log inform-only BACKLOG_WAKE sentinel",
    },
    {
      id: "no-inform-wake-formatter",
      test: (c) => !/BACKLOG_WAKE \$\{JSON\.stringify/.test(c),
      reason: "Must not format inform-only BACKLOG_WAKE JSON lines",
    },
  ];

  if (path.endsWith("devFactoryLoopWiring.ts") && WIRING_RULE.test(content) === false) {
    violations.push({ file: path, reason: WIRING_RULE.reason });
  }

  for (const rule of rules) {
    if (!rule.test(content)) {
      violations.push({ file: path, reason: rule.reason });
    }
  }

  return violations;
}

export function scanEngineExecutionOnlyPolicy(
  readFile: (relativePath: string) => string,
): PolicyScanResult {
  const violations: PolicyViolation[] = [];

  for (const rel of EXECUTION_ONLY_POLICY_SOURCE_PATHS) {
    let content: string;
    try {
      content = readFile(rel);
    } catch {
      violations.push({ file: rel, reason: "Policy source file missing" });
      continue;
    }
    violations.push(...scanSourceFile(rel, content));
  }

  const wiringResult = validateLoopWatchPatterns(DEV_FACTORY_LOOP_WATCH_PATTERNS);
  if (!wiringResult.ok) {
    violations.push(...wiringResult.violations);
  }

  try {
    const arm = readFile("scripts/arm_dev_loop.sh");
    const armResult = validateArmScriptContent(arm);
    if (!armResult.ok) violations.push(...armResult.violations);
  } catch {
    violations.push({
      file: "scripts/arm_dev_loop.sh",
      reason: "Policy source file missing",
    });
  }

  return violations.length ? { ok: false, violations } : { ok: true };
}
