import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildBacklogWakePayload,
  formatDevFactoryIdleLine,
  formatJiraUnavailableTick,
} from "../../lib/devFactoryLoop.ts";
import { formatBacklogWakeExecuteLine } from "../../lib/devFactoryExecution.ts";
import {
  assertValidTickLine,
  isInformOnlyBacklogWakeLine,
  isInformOnlyWatchPattern,
  scanEngineExecutionOnlyPolicy,
  validateArmScriptContent,
  validateExecuteWakeLine,
  validateJiraFallbackLine,
  validateLoopWatchPatterns,
  validateTickStdout,
} from "../../lib/devFactoryExecutionOnly.ts";
import { DEV_FACTORY_LOOP_WATCH_PATTERNS } from "../../lib/devFactoryLoopWiring.ts";
import { FIXTURE_CONFIG, FIXTURE_ISSUES } from "../fixtures/projectFixture.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("devFactoryExecutionOnly", () => {
  const payload = buildBacklogWakePayload(FIXTURE_CONFIG, [...FIXTURE_ISSUES]);
  const executeLine = formatBacklogWakeExecuteLine(
    payload,
    FIXTURE_CONFIG.git.branch_prefixes,
  );
  const idleLine = formatDevFactoryIdleLine(FIXTURE_CONFIG, 0);
  const jiraFallbackLine = formatJiraUnavailableTick(FIXTURE_CONFIG);

  it("EO-01 rejects inform-only BACKLOG_WAKE lines", () => {
    const informLine = `BACKLOG_WAKE ${JSON.stringify({ count: 1, oldest: "TST-105" })}`;
    expect(isInformOnlyBacklogWakeLine(informLine)).toBe(true);
    expect(isInformOnlyBacklogWakeLine(executeLine)).toBe(false);
    expect(isInformOnlyBacklogWakeLine(idleLine)).toBe(false);
  });

  it("EO-02 validates execute wake line contract", () => {
    expect(validateExecuteWakeLine(executeLine)).toEqual({ ok: true, kind: "execute" });
    const bad = executeLine.replace('"executeNow":true', '"executeNow":false');
    expect(validateExecuteWakeLine(bad).ok).toBe(false);
  });

  it("EO-03 validateTickStdout accepts single execute line", () => {
    expect(validateTickStdout(executeLine)).toEqual({ ok: true, kind: "execute" });
  });

  it("EO-04 validateTickStdout rejects dual wake lines", () => {
    const informLine = `BACKLOG_WAKE ${JSON.stringify({ count: 1 })}`;
    const dual = `${informLine}\n${executeLine}`;
    expect(validateTickStdout(dual).ok).toBe(false);
  });

  it("EO-05 validateTickStdout accepts idle line", () => {
    expect(validateTickStdout(idleLine)).toEqual({ ok: true, kind: "idle" });
  });

  it("EO-06 validateTickStdout rejects execute + idle together", () => {
    expect(validateTickStdout(`${executeLine}\n${idleLine}`).ok).toBe(false);
  });

  it("EO-07 assertValidTickLine throws on inform-only wake", () => {
    expect(() =>
      assertValidTickLine(`BACKLOG_WAKE ${JSON.stringify({ oldest: "TST-1" })}`),
    ).toThrow(/inform-only/i);
  });

  it("EO-08 assertValidTickLine allows validated execute and idle lines", () => {
    expect(() => assertValidTickLine(executeLine)).not.toThrow();
    expect(() => assertValidTickLine(idleLine)).not.toThrow();
  });

  it("EO-09 jira fallback tick requires execute contract", () => {
    expect(validateJiraFallbackLine(jiraFallbackLine)).toEqual({
      ok: true,
      kind: "jira_fallback",
    });
    expect(jiraFallbackLine).toContain('"executeNow":true');
    expect(jiraFallbackLine).toContain("BACKLOG_WAKE_EXECUTE");
  });

  it("EO-10 loop watchers are execute-only", () => {
    expect(validateLoopWatchPatterns(DEV_FACTORY_LOOP_WATCH_PATTERNS)).toEqual({
      ok: true,
    });
    expect(isInformOnlyWatchPattern("^BACKLOG_WAKE")).toBe(true);
    expect(isInformOnlyWatchPattern("^BACKLOG_WAKE_EXECUTE")).toBe(false);
    expect(
      isInformOnlyWatchPattern("^(BACKLOG_WAKE|DEV_FACTORY_IDLE)"),
    ).toBe(true);
  });

  it("EO-11 arm script passes execution-only policy", () => {
    const arm = readFileSync(join(ROOT, "scripts/arm_dev_loop.sh"), "utf8");
    expect(validateArmScriptContent(arm)).toEqual({ ok: true });
  });

  it("EO-12 engine source scan passes (regression guard)", () => {
    const result = scanEngineExecutionOnlyPolicy((rel) =>
      readFileSync(join(ROOT, rel), "utf8"),
    );
    expect(result).toEqual({ ok: true });
  });

  it("EO-13 dev_factory_tick.ts emits via assertValidTickLine", () => {
    const tickTs = readFileSync(
      join(ROOT, "scripts/dev_factory_tick.ts"),
      "utf8",
    );
    expect(tickTs).toContain("assertValidTickLine");
    expect(tickTs).not.toContain("formatBacklogWakeLine");
  });

  it("EO-14 simulated legacy dual-wake output always fails validation", () => {
    const legacy = [
      `BACKLOG_WAKE ${JSON.stringify({ count: 2, oldest: "TST-105" })}`,
      executeLine,
    ].join("\n");
    const result = validateTickStdout(legacy);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.toLowerCase()).toMatch(/inform-only/);
    }
  });
});
