import { describe, expect, it } from "vitest";
import { buildBacklogWakePayload } from "../../lib/devFactoryLoop.ts";
import {
  BACKLOG_WAKE_EXECUTE_SENTINEL,
  buildBacklogWakeExecution,
  buildPendingExecuteState,
  consumePendingExecuteState,
  formatBacklogWakeExecuteLine,
  formatExecutePrompt,
  hasStartedTicketWork,
  isStatusOnlyAgentReply,
  parseFactoryLoopIntervalSec,
  shouldConsumePendingOnHandoff,
  shouldForceDrainFollowup,
  userRequestedActiveFactoryRun,
} from "../../lib/devFactoryExecution.ts";
import { FIXTURE_CONFIG, FIXTURE_ISSUES } from "../fixtures/projectFixture.ts";

describe("devFactoryExecution", () => {
  const payload = buildBacklogWakePayload(FIXTURE_CONFIG, [...FIXTURE_ISSUES]);
  const branches = FIXTURE_CONFIG.git.branch_prefixes;

  it("EX-01 buildBacklogWakeExecution requires immediate start", () => {
    const execution = buildBacklogWakeExecution(payload, branches);
    expect(execution.executeNow).toBe(true);
    expect(execution.oldest).toBe("TST-105");
    expect(execution.branchPrefix).toBe("feat/TST-105|fix/TST-105|chore/TST-105");
    expect(execution.firstSteps[0]).toContain("pickup_jira_ticket.sh");
  });

  it("EX-02 formatBacklogWakeExecuteLine emits sentinel JSON", () => {
    const line = formatBacklogWakeExecuteLine(payload, branches);
    expect(line).toMatch(new RegExp(`^${BACKLOG_WAKE_EXECUTE_SENTINEL} `));
    const json = JSON.parse(line.slice(`${BACKLOG_WAKE_EXECUTE_SENTINEL} `.length));
    expect(json.oldest).toBe("TST-105");
    expect(json.executeNow).toBe(true);
  });

  it("EX-03 wake prompt includes execute contract", () => {
    expect(payload.prompt).toContain("BACKLOG_WAKE_EXECUTE");
    expect(payload.prompt).toContain("TST-105");
    expect(formatExecutePrompt(buildBacklogWakeExecution(payload, branches))).toContain(
      "Forbidden",
    );
  });

  it("EX-04 pending execute state captures oldest ticket", () => {
    const pending = buildPendingExecuteState(payload, branches);
    expect(pending.oldest).toBe("TST-105");
    expect(pending.count).toBe(2);
    expect(pending.consumed).toBe(false);
  });

  it("EX-05 detects status-only agent replies", () => {
    expect(
      isStatusOnlyAgentReply(
        "Tick #12 — backlog unchanged (5 tickets). Loop healthy. Ready when you say go.",
      ),
    ).toBe(true);
    expect(
      isStatusOnlyAgentReply(
        "Starting TST-105 — git checkout -B feat/TST-105-edit origin/main",
      ),
    ).toBe(false);
  });

  it("EX-06 hasStartedTicketWork matches ticket branches", () => {
    expect(
      hasStartedTicketWork("feat/TST-105-edit", "TST-105", FIXTURE_CONFIG.git),
    ).toBe(true);
    expect(
      hasStartedTicketWork("chore/sync", "TST-105", FIXTURE_CONFIG.git),
    ).toBe(false);
  });

  it("EX-07 stop hook forces followup on idle status-only turn", () => {
    const pending = buildPendingExecuteState(payload, branches);
    const res = shouldForceDrainFollowup({
      pending,
      currentBranch: "chore/sync",
      hasWorkingTreeChanges: false,
      loopCount: 0,
      git: FIXTURE_CONFIG.git,
    });
    expect(res.force).toBe(true);
  });

  it("EX-08 stop hook skips when ticket branch active", () => {
    const pending = buildPendingExecuteState(payload, branches);
    expect(
      shouldForceDrainFollowup({
        pending,
        currentBranch: "feat/TST-105-edit",
        hasWorkingTreeChanges: false,
        loopCount: 0,
        git: FIXTURE_CONFIG.git,
      }).force,
    ).toBe(false);
  });

  it("EX-09 userRequestedActiveFactoryRun matches trigger phrases", () => {
    expect(userRequestedActiveFactoryRun("please run loop every 5 min")).toBe(true);
    expect(userRequestedActiveFactoryRun("what is the next tick?")).toBe(false);
  });

  it("EX-10 parseFactoryLoopIntervalSec reads minutes", () => {
    expect(parseFactoryLoopIntervalSec("execute loop every 5 min")).toBe(300);
  });

  it("EX-11 handoff consumes pending latch", () => {
    const pending = buildPendingExecuteState(payload, branches);
    expect(shouldConsumePendingOnHandoff(pending, "TST-105")).toBe(true);
    expect(shouldConsumePendingOnHandoff(pending, "TST-106")).toBe(false);
    expect(consumePendingExecuteState(pending).consumed).toBe(true);
  });
});
