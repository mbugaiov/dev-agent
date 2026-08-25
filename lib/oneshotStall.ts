/**
 * K14 — cursor-agent oneshot stall liveness (Hephaestus / Argus).
 * Pure decision: alive pid + silent log/heartbeat → stalled.
 */
import { existsSync, readFileSync, statSync } from "node:fs";

export type StallSignals = {
  alive: boolean;
  nowSec: number;
  issuedAtSec?: number;
  heartbeatSec?: number;
  logMtimeSec?: number;
  /** Bytes in hephaestus-oneshot.out — 0 means runner never received agent output. */
  logBytes?: number;
  logTail?: string;
  silentSec?: number;
  reconnectGraceSec?: number;
  maxWallSec?: number;
  /** Alive + empty log past this → stalled (pipe/buffer hang). Default 600s. */
  noOutputSec?: number;
};

export type StallResult = {
  stalled: boolean;
  reason?: string;
};

const RECONNECT_RE =
  /Connection lost|reconnecting to https:\/\/agent/i;

export function defaultStallThresholds(): {
  silentSec: number;
  reconnectGraceSec: number;
  maxWallSec: number;
  noOutputSec: number;
} {
  const env = (k: string, fallback: number) => {
    const v = process.env[k];
    if (!v) return fallback;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    silentSec: env("ONESHOT_STALL_SILENT_SEC", 900),
    reconnectGraceSec: env("ONESHOT_STALL_RECONNECT_GRACE_SEC", 300),
    maxWallSec: env("ONESHOT_STALL_MAX_WALL_SEC", 14400),
    noOutputSec: env("ONESHOT_STALL_NO_OUTPUT_SEC", 600),
  };
}

/** Last known activity from heartbeat, log mtime, or arm time. */
export function lastActivitySec(signals: StallSignals): number {
  return Math.max(
    signals.heartbeatSec ?? 0,
    signals.logMtimeSec ?? 0,
    signals.issuedAtSec ?? 0,
  );
}

export function decideOneshotStall(signals: StallSignals): StallResult {
  if (!signals.alive) return { stalled: false };

  const { silentSec, reconnectGraceSec, maxWallSec, noOutputSec } = {
    silentSec: signals.silentSec ?? defaultStallThresholds().silentSec,
    reconnectGraceSec:
      signals.reconnectGraceSec ?? defaultStallThresholds().reconnectGraceSec,
    maxWallSec: signals.maxWallSec ?? defaultStallThresholds().maxWallSec,
    noOutputSec: signals.noOutputSec ?? defaultStallThresholds().noOutputSec,
  };
  const now = signals.nowSec;
  const last = lastActivitySec(signals);

  if (signals.issuedAtSec && now - signals.issuedAtSec > maxWallSec) {
    return { stalled: true, reason: "max_wall_sec" };
  }

  // Empty log while pid lives = runner never received output (classic pipe hang).
  const logBytes = signals.logBytes ?? -1;
  if (
    logBytes === 0 &&
    signals.issuedAtSec &&
    now - signals.issuedAtSec > noOutputSec
  ) {
    return { stalled: true, reason: "no_output" };
  }

  const tail = signals.logTail ?? "";
  const reconnecting = RECONNECT_RE.test(tail);

  if (reconnecting && last > 0 && now - last > reconnectGraceSec) {
    return { stalled: true, reason: "reconnect_timeout" };
  }

  if (last > 0 && now - last > silentSec) {
    return {
      stalled: true,
      reason: reconnecting ? "reconnect_silent" : "silent_timeout",
    };
  }

  return { stalled: false };
}

export function readClaimIssuedAtSec(claimPath: string): number | undefined {
  try {
    const raw = readFileSync(claimPath, "utf8");
    const j = JSON.parse(raw) as { issuedAt?: string };
    if (!j.issuedAt) return undefined;
    const ms = Date.parse(j.issuedAt);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
  } catch {
    return undefined;
  }
}

export function readFileMtimeSec(path: string): number | undefined {
  try {
    if (!existsSync(path)) return undefined;
    return Math.floor(statSync(path).mtimeMs / 1000);
  } catch {
    return undefined;
  }
}

export function readLogTail(path: string, maxBytes = 4096): string {
  try {
    if (!existsSync(path)) return "";
    const buf = readFileSync(path);
    const slice = buf.subarray(Math.max(0, buf.length - maxBytes));
    return slice.toString("utf8");
  } catch {
    return "";
  }
}

export function readLogBytes(path: string): number | undefined {
  try {
    if (!existsSync(path)) return undefined;
    return statSync(path).size;
  } catch {
    return undefined;
  }
}

export function collectOneshotStallSignals(input: {
  pidFile: string;
  logFile: string;
  heartbeatFile: string;
  claimFile: string;
  pidAlive: boolean;
  nowSec?: number;
}): StallSignals {
  const thresholds = defaultStallThresholds();
  return {
    alive: input.pidAlive,
    nowSec: input.nowSec ?? Math.floor(Date.now() / 1000),
    issuedAtSec: readClaimIssuedAtSec(input.claimFile),
    heartbeatSec: readFileMtimeSec(input.heartbeatFile),
    logMtimeSec: readFileMtimeSec(input.logFile),
    logBytes: readLogBytes(input.logFile),
    logTail: readLogTail(input.logFile),
    silentSec: thresholds.silentSec,
    reconnectGraceSec: thresholds.reconnectGraceSec,
    maxWallSec: thresholds.maxWallSec,
    noOutputSec: thresholds.noOutputSec,
  };
}
