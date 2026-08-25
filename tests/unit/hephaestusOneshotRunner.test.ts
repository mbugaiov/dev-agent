/**
 * Contract: hephaestus_oneshot_runner.sh — launch, capture, heartbeat, anti-pipe.
 * These tests pin the empty-log hang root cause so it cannot regress silently.
 */
import { describe, expect, it } from "vitest";
import {
  spawnSync,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const RUNNER = join(ROOT, "scripts/lib/hephaestus_oneshot_runner.sh");
const ENSURE = join(ROOT, "scripts/ensure_hephaestus_agent.sh");

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(
  pred: () => boolean,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return;
    await sleep(50);
  }
  throw new Error(`timeout waiting for ${label}`);
}

function runRunner(
  agentArgs: string[],
  envExtra: Record<string, string> = {},
): {
  status: number | null;
  log: string;
  hb: string;
  dir: string;
} {
  const dir = mkdtempSync(join(tmpdir(), "heph-runner-"));
  const log = join(dir, "out");
  const hb = join(dir, "hb");
  const r = spawnSync(
    "bash",
    [RUNNER, ...agentArgs],
    {
      env: {
        ...process.env,
        HEPHAESTUS_LOG: log,
        HEPHAESTUS_HEARTBEAT: hb,
        HEPHAESTUS_HEARTBEAT_POLL_SEC: "1",
        ...envExtra,
      },
      encoding: "utf8",
      timeout: 20_000,
    },
  );
  return {
    status: r.status,
    log: existsSync(log) ? readFileSync(log, "utf8") : "",
    hb: existsSync(hb) ? readFileSync(hb, "utf8").trim() : "",
    dir,
  };
}

describe("hephaestus_oneshot_runner source contract", () => {
  it("forbids piping agent stdout into while-read (empty-log hang)", () => {
    const src = readFileSync(RUNNER, "utf8");
    expect(src).not.toMatch(/2>&1\s*\|\s*while/);
    expect(src).not.toMatch(/\|\s*while\s+IFS= read/);
    // Must append to log, not only pipe.
    expect(src).toMatch(/>>"\$LOG"/);
    expect(src).toMatch(/touch_heartbeat/);
  });

  it("requires HEPHAESTUS_LOG and HEPHAESTUS_HEARTBEAT", () => {
    const missingLog = spawnSync("bash", [RUNNER, "true"], {
      env: { ...process.env, HEPHAESTUS_HEARTBEAT: "/tmp/x" },
      encoding: "utf8",
    });
    expect(missingLog.status).not.toBe(0);

    const missingHb = spawnSync("bash", [RUNNER, "true"], {
      env: { ...process.env, HEPHAESTUS_LOG: "/tmp/y" },
      encoding: "utf8",
    });
    expect(missingHb.status).not.toBe(0);
  });
});

describe("hephaestus_oneshot_runner capture + heartbeat", () => {
  it("captures agent stdout into the log (no pipe-read)", () => {
    const r = runRunner(["bash", "-c", "echo CAPTURE_OK; echo LINE2"]);
    try {
      expect(r.status).toBe(0);
      expect(r.log).toMatch(/CAPTURE_OK/);
      expect(r.log).toMatch(/LINE2/);
      expect(r.hb).toMatch(/^\d+$/);
    } finally {
      rmSync(r.dir, { recursive: true, force: true });
    }
  });

  it("propagates non-zero agent exit code", () => {
    const r = runRunner(["bash", "-c", "echo boom; exit 7"]);
    try {
      expect(r.status).toBe(7);
      expect(r.log).toMatch(/boom/);
    } finally {
      rmSync(r.dir, { recursive: true, force: true });
    }
  });

  it("advances heartbeat when log grows mid-run", async () => {
    const dir = mkdtempSync(join(tmpdir(), "heph-hb-"));
    const log = join(dir, "out");
    const hb = join(dir, "hb");
    const agent = join(dir, "agent.sh");
    writeFileSync(
      agent,
      "#!/usr/bin/env bash\nset -e\necho PHASE1\nsleep 2\necho PHASE2\n",
    );
    chmodSync(agent, 0o755);

    let child: ChildProcessWithoutNullStreams | undefined;
    try {
      child = spawn("bash", [RUNNER, agent], {
        env: {
          ...process.env,
          HEPHAESTUS_LOG: log,
          HEPHAESTUS_HEARTBEAT: hb,
          HEPHAESTUS_HEARTBEAT_POLL_SEC: "1",
        },
      });

      await waitFor(
        () => existsSync(log) && readFileSync(log, "utf8").includes("PHASE1"),
        8000,
        "PHASE1 in log",
      );
      await sleep(1200); // allow poll to see growth
      const hbAfterPhase1 = Number(readFileSync(hb, "utf8").trim());
      expect(hbAfterPhase1).toBeGreaterThan(0);

      await waitFor(
        () => readFileSync(log, "utf8").includes("PHASE2"),
        8000,
        "PHASE2 in log",
      );
      await sleep(1200);
      const hbAfterPhase2 = Number(readFileSync(hb, "utf8").trim());
      expect(hbAfterPhase2).toBeGreaterThanOrEqual(hbAfterPhase1);

      const status =
        child.exitCode !== null
          ? child.exitCode
          : await new Promise<number | null>((resolve) => {
              child!.once("exit", (code) => resolve(code));
            });
      expect(status).toBe(0);
    } finally {
      if (child && child.exitCode === null) child.kill("SIGKILL");
      rmSync(dir, { recursive: true, force: true });
    }
  }, 25_000);

  it("documents pipe|while-read hang: mid-run log stays empty under pipe", async () => {
    // Root-cause fixture: block-buffered writer + while-read never sees lines mid-run.
    const dir = mkdtempSync(join(tmpdir(), "heph-pipe-"));
    const pipeLog = join(dir, "pipe.out");
    const writer = join(dir, "writer.py");
    writeFileSync(
      writer,
      [
        "import sys, time",
        "sys.stdout.write('BUFFERED_LINE\\n' * 20)",
        "# intentionally no flush — full buffer when stdout is a pipe",
        "time.sleep(2)",
        "sys.stdout.flush()",
      ].join("\n"),
    );

    const bad = spawn(
      "bash",
      [
        "-c",
        `python3 "$1" 2>&1 | while IFS= read -r line; do printf '%s\\n' "$line" >>"$2"; done`,
        "_",
        writer,
        pipeLog,
      ],
      { stdio: "ignore" },
    );

    try {
      await sleep(800);
      const mid = existsSync(pipeLog) ? readFileSync(pipeLog, "utf8") : "";
      // During sleep (pre-flush), pipe+read typically has written nothing.
      expect(mid.includes("BUFFERED_LINE")).toBe(false);

      await new Promise<void>((resolve) => bad.on("exit", () => resolve()));
      // After flush+exit, lines may appear — hang is the *mid-run* empty window.
    } finally {
      bad.kill("SIGKILL");
      rmSync(dir, { recursive: true, force: true });
    }
  }, 15_000);

  it("our runner captures the same writer mid-run (contrast to pipe hang)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "heph-good-"));
    const log = join(dir, "out");
    const hb = join(dir, "hb");
    const writer = join(dir, "writer.sh");
    // Line-oriented bash under script/stdbuf — appears before long sleep ends.
    writeFileSync(
      writer,
      "#!/usr/bin/env bash\necho STREAM_OK\nsleep 3\necho DONE\n",
    );
    chmodSync(writer, 0o755);

    const child = spawn("bash", [RUNNER, writer], {
      env: {
        ...process.env,
        HEPHAESTUS_LOG: log,
        HEPHAESTUS_HEARTBEAT: hb,
        HEPHAESTUS_HEARTBEAT_POLL_SEC: "1",
      },
    });

    try {
      await waitFor(
        () => existsSync(log) && readFileSync(log, "utf8").includes("STREAM_OK"),
        8000,
        "STREAM_OK mid-run",
      );
      // Still running (sleep 3) — proving capture is not exit-only flush.
      expect(child.exitCode).toBeNull();
      await new Promise<void>((resolve) => child.on("exit", () => resolve()));
      expect(readFileSync(log, "utf8")).toMatch(/DONE/);
    } finally {
      child.kill("SIGKILL");
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);
});

describe("ensure_hephaestus_agent arm wiring (launch trigger)", () => {
  it("arms via runner + stream-json (not text-only pipe)", () => {
    const src = readFileSync(ENSURE, "utf8");
    expect(src).toMatch(/hephaestus_oneshot_runner\.sh/);
    expect(src).toMatch(/--output-format stream-json/);
    expect(src).toMatch(/--stream-partial-output/);
    expect(src).toMatch(/HEPHAESTUS_LOG=/);
    expect(src).toMatch(/HEPHAESTUS_HEARTBEAT=/);
    expect(src).toMatch(/STALL_RECOVERY/);
    expect(src).toMatch(/HEPHAESTUS_ONESHOT_STALLED/);
    // Oneshot launch must not use text format (silent mid-run → false stall).
    expect(src).not.toMatch(
      /hephaestus_oneshot_runner\.sh[\s\S]{0,400}--output-format text/,
    );
  });
});
