import { describe, expect, it } from "vitest";
import {
  buildBacklogWakePayload,
  devFactoryAppliesHumanExceptionsPolicy,
  devFactoryExcludesQaOnly,
  devFactoryShouldWake,
  devHandoffForQaLoop,
  DEV_FACTORY_HANDOFF_STATUS,
  formatBacklogWakeLine,
  formatDevFactoryIdleLine,
  formatJiraUnavailableTick,
  devFactoryJql,
} from "../../lib/devFactoryLoop.ts";
import { DEV_FACTORY_TICK_POLICY } from "../../lib/projectConfig.ts";
import { FIXTURE_CONFIG } from "../fixtures/projectFixture.ts";

describe("devFactoryLoop", () => {
  const jql = devFactoryJql(FIXTURE_CONFIG);

  it("JQL excludes impl-qa from config", () => {
    expect(devFactoryExcludesQaOnly(jql)).toBe(true);
    expect(jql).toContain("labels = impl-dev");
    expect(jql).not.toMatch(/labels = impl-qa/);
  });

  it("JQL applies human exceptions from config", () => {
    expect(
      devFactoryAppliesHumanExceptionsPolicy(
        jql,
        FIXTURE_CONFIG.dev_factory.excluded_issue_keys,
      ),
    ).toBe(true);
    expect(jql).toContain("TST-99");
  });

  it("devFactoryShouldWake when backlog non-empty", () => {
    expect(devFactoryShouldWake(3)).toBe(true);
    expect(devFactoryShouldWake(0)).toBe(false);
  });

  it("wake prompt drains queue", () => {
    expect(devHandoffForQaLoop(DEV_FACTORY_HANDOFF_STATUS, "Validate/Testing")).toBe(
      true,
    );
    const payload = buildBacklogWakePayload(FIXTURE_CONFIG, [
      { key: "TST-109", summary: "test", status: "To Do" },
    ]);
    expect(payload.prompt).toContain("Validate/Testing");
    expect(payload.prompt).toContain(DEV_FACTORY_TICK_POLICY);
    expect(payload.prompt).toContain("do NOT stop after one ticket");
    expect(formatBacklogWakeLine(payload)).toMatch(/^BACKLOG_WAKE /);
  });

  it("DEV_FACTORY_IDLE waits for next tick", () => {
    const line = formatDevFactoryIdleLine(FIXTURE_CONFIG, 0);
    expect(line).toMatch(/^DEV_FACTORY_IDLE /);
    expect(line).toContain("Wait for the next loop tick");
  });

  it("Jira-unavailable fallback includes drain policy", () => {
    const line = formatJiraUnavailableTick(FIXTURE_CONFIG);
    expect(line).toContain(`AGENT_LOOP_TICK_${FIXTURE_CONFIG.loop.purpose}`);
    expect(line).toContain("fallback");
  });
});
