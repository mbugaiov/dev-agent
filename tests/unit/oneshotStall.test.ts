import { afterEach, describe, expect, it } from "vitest";
import {
  collectOneshotStallSignals,
  decideOneshotStall,
  defaultStallThresholds,
  lastActivitySec,
  readClaimIssuedAtSec,
  readLogBytes,
} from "../../lib/oneshotStall.ts";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("decideOneshotStall (K14)", () => {
  const now = 1_700_000_000;

  it("not stalled when not alive", () => {
    expect(
      decideOneshotStall({ alive: false, nowSec: now, heartbeatSec: now - 9999 }),
    ).toEqual({ stalled: false });
  });

  it("not stalled when heartbeat recent", () => {
    expect(
      decideOneshotStall({
        alive: true,
        nowSec: now,
        heartbeatSec: now - 60,
        silentSec: 900,
      }),
    ).toEqual({ stalled: false });
  });

  it("stalled on silent timeout", () => {
    expect(
      decideOneshotStall({
        alive: true,
        nowSec: now,
        heartbeatSec: now - 1000,
        silentSec: 900,
      }),
    ).toEqual({ stalled: true, reason: "silent_timeout" });
  });

  it("stalled on reconnect tail past grace", () => {
    expect(
      decideOneshotStall({
        alive: true,
        nowSec: now,
        heartbeatSec: now - 400,
        logTail:
          "Connection lost, reconnecting to https://agentn.global.api5.cursor.sh",
        reconnectGraceSec: 300,
        silentSec: 900,
      }),
    ).toEqual({ stalled: true, reason: "reconnect_timeout" });
  });

  it("holds reconnect within grace window", () => {
    expect(
      decideOneshotStall({
        alive: true,
        nowSec: now,
        heartbeatSec: now - 120,
        logTail:
          "Connection lost, reconnecting to https://agentn.global.api5.cursor.sh",
        reconnectGraceSec: 300,
        silentSec: 900,
      }),
    ).toEqual({ stalled: false });
  });

  it("reconnect past silent with reconnecting tail → reconnect_silent", () => {
    expect(
      decideOneshotStall({
        alive: true,
        nowSec: now,
        heartbeatSec: now - 1000,
        logTail: "Connection lost, reconnecting to https://agent.example",
        reconnectGraceSec: 3000,
        silentSec: 900,
      }),
    ).toEqual({ stalled: true, reason: "reconnect_silent" });
  });

  it("stalled on max wall clock", () => {
    expect(
      decideOneshotStall({
        alive: true,
        nowSec: now,
        issuedAtSec: now - 20_000,
        heartbeatSec: now - 60,
        maxWallSec: 14_400,
      }),
    ).toEqual({ stalled: true, reason: "max_wall_sec" });
  });

  it("max_wall_sec wins over no_output when both would apply", () => {
    expect(
      decideOneshotStall({
        alive: true,
        nowSec: now,
        issuedAtSec: now - 20_000,
        heartbeatSec: now - 10,
        logBytes: 0,
        maxWallSec: 14_400,
        noOutputSec: 600,
        silentSec: 900,
      }),
    ).toEqual({ stalled: true, reason: "max_wall_sec" });
  });

  it("stalled on empty log past noOutputSec (pipe hang)", () => {
    expect(
      decideOneshotStall({
        alive: true,
        nowSec: now,
        issuedAtSec: now - 700,
        heartbeatSec: now - 10,
        logBytes: 0,
        noOutputSec: 600,
        silentSec: 900,
      }),
    ).toEqual({ stalled: true, reason: "no_output" });
  });

  it("not stalled on empty log within noOutputSec", () => {
    expect(
      decideOneshotStall({
        alive: true,
        nowSec: now,
        issuedAtSec: now - 120,
        heartbeatSec: now - 10,
        logBytes: 0,
        noOutputSec: 600,
        silentSec: 900,
      }),
    ).toEqual({ stalled: false });
  });

  it("not stalled on empty log when issuedAt missing (no false no_output)", () => {
    expect(
      decideOneshotStall({
        alive: true,
        nowSec: now,
        heartbeatSec: now - 10,
        logBytes: 0,
        noOutputSec: 600,
        silentSec: 900,
      }),
    ).toEqual({ stalled: false });
  });

  it("not stalled when logBytes undefined (unknown size ≠ empty)", () => {
    expect(
      decideOneshotStall({
        alive: true,
        nowSec: now,
        issuedAtSec: now - 700,
        heartbeatSec: now - 10,
        noOutputSec: 600,
        silentSec: 900,
      }),
    ).toEqual({ stalled: false });
  });

  it("CLI tip-only log (non-zero bytes) is not no_output", () => {
    expect(
      decideOneshotStall({
        alive: true,
        nowSec: now,
        issuedAtSec: now - 700,
        heartbeatSec: now - 10,
        logBytes: 87,
        logMtimeSec: now - 10,
        noOutputSec: 600,
        silentSec: 900,
      }),
    ).toEqual({ stalled: false });
  });

  it("not stalled when log has bytes and recent log mtime", () => {
    expect(
      decideOneshotStall({
        alive: true,
        nowSec: now,
        issuedAtSec: now - 700,
        heartbeatSec: now - 60,
        logBytes: 42,
        logMtimeSec: now - 60,
        noOutputSec: 600,
        silentSec: 900,
      }),
    ).toEqual({ stalled: false });
  });

  it("silent_timeout when progress frozen even with non-empty log", () => {
    expect(
      decideOneshotStall({
        alive: true,
        nowSec: now,
        issuedAtSec: now - 2000,
        heartbeatSec: now - 1000,
        logBytes: 5000,
        logMtimeSec: now - 1000,
        noOutputSec: 600,
        silentSec: 900,
      }),
    ).toEqual({ stalled: true, reason: "silent_timeout" });
  });

  it("boundary: exactly noOutputSec is not stalled; +1 is", () => {
    expect(
      decideOneshotStall({
        alive: true,
        nowSec: now,
        issuedAtSec: now - 600,
        heartbeatSec: now - 1,
        logBytes: 0,
        noOutputSec: 600,
        silentSec: 900,
      }),
    ).toEqual({ stalled: false });
    expect(
      decideOneshotStall({
        alive: true,
        nowSec: now,
        issuedAtSec: now - 601,
        heartbeatSec: now - 1,
        logBytes: 0,
        noOutputSec: 600,
        silentSec: 900,
      }),
    ).toEqual({ stalled: true, reason: "no_output" });
  });

  it("lastActivitySec picks max of signals", () => {
    expect(
      lastActivitySec({
        alive: true,
        nowSec: now,
        issuedAtSec: 100,
        heartbeatSec: 200,
        logMtimeSec: 150,
      }),
    ).toBe(200);
  });
});

describe("defaultStallThresholds", () => {
  const keys = [
    "ONESHOT_STALL_SILENT_SEC",
    "ONESHOT_STALL_RECONNECT_GRACE_SEC",
    "ONESHOT_STALL_MAX_WALL_SEC",
    "ONESHOT_STALL_NO_OUTPUT_SEC",
  ] as const;
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("defaults include noOutputSec 600", () => {
    for (const k of keys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    expect(defaultStallThresholds()).toEqual({
      silentSec: 900,
      reconnectGraceSec: 300,
      maxWallSec: 14400,
      noOutputSec: 600,
    });
  });

  it("honors ONESHOT_STALL_NO_OUTPUT_SEC env", () => {
    for (const k of keys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    process.env.ONESHOT_STALL_NO_OUTPUT_SEC = "120";
    expect(defaultStallThresholds().noOutputSec).toBe(120);
  });

  it("ignores non-positive env values", () => {
    for (const k of keys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    process.env.ONESHOT_STALL_NO_OUTPUT_SEC = "0";
    expect(defaultStallThresholds().noOutputSec).toBe(600);
  });
});

describe("collectOneshotStallSignals + fixtures", () => {
  it("wires logBytes=0 into decide → no_output", () => {
    const dir = mkdtempSync(join(tmpdir(), "stall-collect-"));
    mkdirSync(dir, { recursive: true });
    const logFile = join(dir, "out");
    const heartbeatFile = join(dir, "hb");
    const claimFile = join(dir, "claim.json");
    const pidFile = join(dir, "pid");
    writeFileSync(logFile, "");
    writeFileSync(heartbeatFile, String(Math.floor(Date.now() / 1000)));
    writeFileSync(
      claimFile,
      JSON.stringify({
        issuedAt: new Date(Date.now() - 700_000).toISOString(),
      }),
    );
    writeFileSync(pidFile, "1");

    const signals = collectOneshotStallSignals({
      pidFile,
      logFile,
      heartbeatFile,
      claimFile,
      pidAlive: true,
      nowSec: Math.floor(Date.now() / 1000),
    });
    expect(signals.logBytes).toBe(0);
    expect(decideOneshotStall({ ...signals, noOutputSec: 600 })).toEqual({
      stalled: true,
      reason: "no_output",
    });
    rmSync(dir, { recursive: true, force: true });
  });

  it("readLogBytes / readClaimIssuedAtSec parse fixtures", () => {
    const dir = mkdtempSync(join(tmpdir(), "stall-io-"));
    const log = join(dir, "out");
    const claim = join(dir, "claim.json");
    writeFileSync(log, "abc");
    writeFileSync(claim, JSON.stringify({ issuedAt: "2026-08-24T20:17:33Z" }));
    expect(readLogBytes(log)).toBe(3);
    expect(readClaimIssuedAtSec(claim)).toBe(
      Date.parse("2026-08-24T20:17:33Z") / 1000,
    );
    rmSync(dir, { recursive: true, force: true });
  });
});
