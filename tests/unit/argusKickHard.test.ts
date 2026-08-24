import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildPendingArgusKickState,
  shouldForceArgusKickFollowup,
} from "../../lib/argusKickPending.ts";
import {
  buildQaWakePayload,
  classifyArgusOneshotLine,
  ensureArgusOneshot,
  formatQaWakeExecuteLine,
  resolveQaAgentRoot,
  QA_WAKE_EXECUTE_SENTINEL,
} from "../../lib/qaHandoffKickBridge.ts";

describe("argusKickPending", () => {
  it("does not force hook followup by default (oneshot-only)", () => {
    const pending = buildPendingArgusKickState({
      slug: "selftest",
      ticket: "selftest#1",
    });
    expect(
      shouldForceArgusKickFollowup({ pending, loopCount: 0 }).force,
    ).toBe(false);
    expect(pending.executePrompt).toContain("ensure_argus");
    expect(pending.executePrompt).toContain("NOT Task/hooks");
  });

  it("forces followup only when enableHookFollowup", () => {
    const pending = buildPendingArgusKickState({
      slug: "selftest",
      ticket: "selftest#1",
    });
    const d = shouldForceArgusKickFollowup({
      pending,
      loopCount: 0,
      enableHookFollowup: true,
    });
    expect(d.force).toBe(true);
    if (d.force) {
      expect(d.message).toContain("ARGUS_KICK_EXECUTE");
      expect(d.message).toContain("selftest#1");
    }
  });

  it("skips when consumed or max loops", () => {
    const pending = buildPendingArgusKickState({
      slug: "selftest",
      ticket: "selftest#1",
    });
    expect(
      shouldForceArgusKickFollowup({
        pending: { ...pending, consumed: true },
        loopCount: 0,
        enableHookFollowup: true,
      }).force,
    ).toBe(false);
    expect(
      shouldForceArgusKickFollowup({
        pending,
        loopCount: 5,
        enableHookFollowup: true,
      }).force,
    ).toBe(false);
  });
});

describe("qaHandoffKickBridge", () => {
  it("resolves QA_AGENT_ROOT then sibling", () => {
    expect(
      resolveQaAgentRoot("/work/dev-agent", {}, { QA_AGENT_ROOT: "/custom/qa" }),
    ).toBe("/custom/qa");
    expect(resolveQaAgentRoot("/work/dev-agent", {}, {})).toBe(
      "/work/qa-agent",
    );
    expect(
      resolveQaAgentRoot(
        "/work/dev-agent",
        { qa_kick: { qa_agent_path: "../elsewhere-qa" } },
        {},
      ),
    ).toBe("/work/elsewhere-qa");
  });

  it("formats QA_WAKE_EXECUTE line with executeNow", () => {
    const state = buildQaWakePayload({
      slug: "selftest",
      ticketKey: "selftest#1",
    });
    const line = formatQaWakeExecuteLine(state);
    expect(line.startsWith(QA_WAKE_EXECUTE_SENTINEL)).toBe(true);
    expect(line).toContain('"executeNow":true');
    expect(line).toContain("selftest#1");
    expect(state.consumed).toBe(false);
    expect(state.source).toBe("handoff");
  });
});

describe("classifyArgusOneshotLine", () => {
  it("maps ensure_argus sentinel lines", () => {
    expect(classifyArgusOneshotLine('ARGUS_ONESHOT_ARMED {"slug":"x"}')).toBe(
      "armed",
    );
    expect(classifyArgusOneshotLine('ALREADY_RUNNING {"slug":"x"}')).toBe(
      "already",
    );
    expect(classifyArgusOneshotLine('ARGUS_ONESHOT_SKIP {"reason":"no-key"}')).toBe(
      "skipped",
    );
    expect(classifyArgusOneshotLine('ARGUS_ONESHOT_FAIL {"reason":"timeout"}')).toBe(
      "failed",
    );
    expect(classifyArgusOneshotLine("unexpected output")).toBe("unknown");
  });
});

describe("ensureArgusOneshot", () => {
  const temps: string[] = [];
  afterEach(() => {
    while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
  });

  it("skips when ensure_argus.sh missing", () => {
    const qaRoot = mkdtempSync(join(tmpdir(), "qa-root-"));
    temps.push(qaRoot);
    const res = ensureArgusOneshot({
      qaAgentRoot: qaRoot,
      slug: "selftest",
      ticketKey: "selftest#1",
    });
    expect(res.status).toBe("skipped");
    expect(res.line).toContain("ensure_argus.sh-missing");
  });

  it("classifies ARMED from script stdout", () => {
    const qaRoot = mkdtempSync(join(tmpdir(), "qa-root-"));
    temps.push(qaRoot);
    mkdirSync(join(qaRoot, "scripts"), { recursive: true });
    writeFileSync(
      join(qaRoot, "scripts/ensure_argus.sh"),
      '#!/bin/bash\necho \'ARGUS_ONESHOT_ARMED {"slug":"selftest"}\'\n',
      { mode: 0o755 },
    );
    const res = ensureArgusOneshot({
      qaAgentRoot: qaRoot,
      slug: "selftest",
      ticketKey: "selftest#1",
    });
    expect(res.status).toBe("armed");
  });

  it("classifies ALREADY_RUNNING from script stdout", () => {
    const qaRoot = mkdtempSync(join(tmpdir(), "qa-root-"));
    temps.push(qaRoot);
    mkdirSync(join(qaRoot, "scripts"), { recursive: true });
    writeFileSync(
      join(qaRoot, "scripts/ensure_argus.sh"),
      '#!/bin/bash\necho \'ALREADY_RUNNING {"slug":"selftest"}\'\n',
      { mode: 0o755 },
    );
    const res = ensureArgusOneshot({
      qaAgentRoot: qaRoot,
      slug: "selftest",
      ticketKey: "selftest#1",
    });
    expect(res.status).toBe("already");
  });

  it("classifies SKIP from script stdout", () => {
    const qaRoot = mkdtempSync(join(tmpdir(), "qa-root-"));
    temps.push(qaRoot);
    mkdirSync(join(qaRoot, "scripts"), { recursive: true });
    writeFileSync(
      join(qaRoot, "scripts/ensure_argus.sh"),
      '#!/bin/bash\necho \'ARGUS_ONESHOT_SKIP {"reason":"no-key"}\'\n',
      { mode: 0o755 },
    );
    const res = ensureArgusOneshot({
      qaAgentRoot: qaRoot,
      slug: "selftest",
      ticketKey: "selftest#1",
    });
    expect(res.status).toBe("skipped");
  });
});
