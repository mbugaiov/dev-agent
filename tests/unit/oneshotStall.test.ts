import { describe, expect, it } from "vitest";
import {
  decideOneshotStall,
  lastActivitySec,
  readClaimIssuedAtSec,
} from "../../lib/oneshotStall.ts";
import { mkdtempSync, writeFileSync } from "node:fs";
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
        logTail: "Connection lost, reconnecting to https://agentn.global.api5.cursor.sh",
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
        logTail: "Connection lost, reconnecting to https://agentn.global.api5.cursor.sh",
        reconnectGraceSec: 300,
        silentSec: 900,
      }),
    ).toEqual({ stalled: false });
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

  it("not stalled when log has bytes even if old heartbeat", () => {
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

describe("readClaimIssuedAtSec", () => {
  it("parses issuedAt from claim json", () => {
    const dir = mkdtempSync(join(tmpdir(), "claim-"));
    const path = join(dir, "claim.json");
    writeFileSync(
      path,
      JSON.stringify({ issuedAt: "2026-08-24T20:17:33Z" }),
    );
    const sec = readClaimIssuedAtSec(path);
    expect(sec).toBe(Date.parse("2026-08-24T20:17:33Z") / 1000);
  });
});
