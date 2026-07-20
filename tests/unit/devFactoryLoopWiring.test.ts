import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildBacklogWakePayload } from "../../lib/devFactoryLoop.ts";
import { DRAIN_QUEUE_AFTER_HANDOFF, formatHandoffComment, formatMergedPrUrl } from "../../lib/projectConfig.ts";
import {
  buildLoopArmPayload,
  buildSessionEndChecklist,
  buildCombinedWatchPattern,
  DEV_FACTORY_LOOP_WATCH_PATTERNS,
  formatLoopArmLine,
  LOOP_ARM_SCRIPT,
  LOOP_ARM_SENTINEL,
  LOOP_UNARMED_SENTINEL,
  loopWiringDocsValid,
  mustDrainQueueOnWake,
  PR_PIPELINE_WATCH_PATTERN,
  sessionEndAllowed,
  sessionMayIdleUntilNextTick,
  sessionShouldContinueAfterHandoff,
} from "../../lib/devFactoryLoopWiring.ts";
import { formatBacklogWakeExecuteLine } from "../../lib/devFactoryExecution.ts";
import { formatJiraUnavailableTick } from "../../lib/devFactoryLoop.ts";
import { runLoopWiringPreflight } from "../../lib/loopWiringPreflight.ts";
import { FIXTURE_CONFIG } from "../fixtures/projectFixture.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("devFactoryLoopWiring", () => {
  it("LW-01 defines BACKLOG_WAKE watcher", () => {
    expect(
      DEV_FACTORY_LOOP_WATCH_PATTERNS.find((w) => w.pattern === "^BACKLOG_WAKE"),
    ).toBeDefined();
  });

  it("LW-05 session continues after handoff when backlog remains", () => {
    expect(sessionShouldContinueAfterHandoff(5)).toBe(true);
    expect(sessionMayIdleUntilNextTick(0)).toBe(true);
  });

  it("LW-07 BACKLOG_WAKE with tickets means drain", () => {
    expect(mustDrainQueueOnWake(5)).toBe(true);
    expect(mustDrainQueueOnWake(0)).toBe(false);
  });

  it("LW-08 sessionEndAllowed blocks ending with open backlog", () => {
    const res = sessionEndAllowed({
      backlogCount: 3,
      hasOpenPr: false,
      loopArmed: true,
      prWatcherArmed: true,
    });
    expect(res.ok).toBe(false);
  });

  it("LW-14 wake prompt forbids stopping after one ticket", () => {
    const payload = buildBacklogWakePayload(FIXTURE_CONFIG, [
      { key: "TST-105", summary: "edit", status: "To Do" },
    ]);
    expect(payload.prompt).toContain("do NOT stop after one ticket");
  });

  it("LW-15 handoff comment reminds agent to drain queue", () => {
    const comment = formatHandoffComment({
      mergedPrUrl: formatMergedPrUrl(FIXTURE_CONFIG.git, 1),
      pipelineBuildNumber: 1,
      stgBuildId: "abc1234",
      mainCommit: "abc1234",
      summary: "sample",
    });
    expect(comment).toContain(DRAIN_QUEUE_AFTER_HANDOFF);
  });

  it("LW-16 formatLoopArmLine emits LOOP_ARMED JSON", () => {
    const line = formatLoopArmLine("selftest", 900, "selftestdev");
    expect(line).toMatch(/^LOOP_ARMED /);
    const json = JSON.parse(line.slice("LOOP_ARMED ".length));
    expect(json.sentinel).toBe(LOOP_ARM_SENTINEL);
    expect(json.slug).toBe("selftest");
  });

  it("LW-18 loop wiring docs valid in engine", () => {
    const skill = readFileSync(
      join(ROOT, ".cursor/skills/dev-factory-loop/SKILL.md"),
      "utf8",
    );
    const agents = readFileSync(join(ROOT, "AGENTS.md"), "utf8");
    const dod = readFileSync(
      join(ROOT, "projects/_template/docs/DEFINITION-OF-DONE.md"),
      "utf8",
    );
    expect(loopWiringDocsValid(skill, agents, dod)).toBe(true);
  });

  it("LW-19 runLoopWiringPreflight passes on engine files", () => {
    const result = runLoopWiringPreflight({
      skillDoc: readFileSync(
        join(ROOT, ".cursor/skills/dev-factory-loop/SKILL.md"),
        "utf8",
      ),
      agentsDoc: readFileSync(join(ROOT, "AGENTS.md"), "utf8"),
      dodDoc: readFileSync(
        join(ROOT, "projects/_template/docs/DEFINITION-OF-DONE.md"),
        "utf8",
      ),
      armScript: readFileSync(join(ROOT, "scripts/arm_dev_loop.sh"), "utf8"),
      schedulerScript: readFileSync(join(ROOT, "scripts/dev-loop.sh"), "utf8"),
      hooksJson: readFileSync(join(ROOT, ".cursor/hooks.json"), "utf8"),
    });
    expect(result).toEqual({ ok: true });
  });

  it("LW-21 dev-loop refuses unarmed execution", () => {
    const child = spawnSync("bash", ["scripts/dev-loop.sh", "selftest"], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 2000,
    });
    expect(child.status).toBe(1);
    expect(child.stdout).toContain(LOOP_UNARMED_SENTINEL);
  });

  it("LW-26 combined watch pattern includes BACKLOG_WAKE_EXECUTE", () => {
    expect(buildCombinedWatchPattern("selftestdev")).toContain(
      "BACKLOG_WAKE_EXECUTE",
    );
  });

  it("LW-27 execute wake line pairs with backlog wake payload", () => {
    const payload = buildBacklogWakePayload(FIXTURE_CONFIG, [
      { key: "TST-105", summary: "edit", status: "To Do" },
    ]);
    const line = formatBacklogWakeExecuteLine(
      payload,
      FIXTURE_CONFIG.git.branch_prefixes,
    );
    expect(line).toMatch(/^BACKLOG_WAKE_EXECUTE /);
    expect(line).toContain("TST-105");
  });

  it("LW-28 hooks.json registers drain stop hook", () => {
    const hooks = readFileSync(join(ROOT, ".cursor/hooks.json"), "utf8");
    expect(hooks).toContain("dev-factory-drain-stop");
  });
});
