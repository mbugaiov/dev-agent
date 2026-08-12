import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { buildBacklogWakePayload } from "../../lib/devFactoryLoop.ts";
import { buildPendingExecuteState } from "../../lib/devFactoryExecution.ts";
import {
  decideDevFactorySessionStart,
  decideDevFactoryStopHook,
  inferSlugFromTicketKey,
  isDevFactoryEngineRoot,
  resolveDevFactoryEngineRoot,
  resolveHookSlug,
} from "../../lib/devFactoryHookRuntime.ts";
import { FIXTURE_CONFIG, FIXTURE_ISSUES } from "../fixtures/projectFixture.ts";

const REAL_ENGINE = join(dirname(fileURLToPath(import.meta.url)), "../..");

const temps: string[] = [];
afterEach(() => {
  while (temps.length) {
    const d = temps.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

function writeProjectYaml(root: string, slug: string, pattern: string): void {
  const dir = join(root, "projects", slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "project.yaml"),
    [
      `name: "Fixture ${slug}"`,
      `slug: "${slug}"`,
      "dev_factory:",
      '  epic_key: "TST-1"',
      '  pickup_label: "impl-dev"',
      "  excluded_labels: []",
      "  excluded_issue_keys: []",
      '  statuses: ["To Do"]',
      '  handoff_status: "Validate/Testing"',
      "  forbidden_target_statuses: []",
      '  order_by: "created ASC"',
      "git:",
      '  provider: "bitbucket"',
      '  workspace: "example"',
      '  repo: "app"',
      '  default_branch: "main"',
      '  branch_prefixes: ["feat", "fix"]',
      `  ticket_key_pattern: "${pattern}"`,
      "stg:",
      '  base_url: "https://staging.example.com"',
      "app:",
      '  repo_path: "../app"',
      '  gate_command: "npm test"',
      '  mr_push_command: "npm run push-mr"',
      "loop:",
      '  purpose: "fixture"',
      "  interval_sec_default: 300",
      "",
    ].join("\n"),
  );
}

function fakeEngine(opts?: {
  pending?: object;
  argus?: object;
  projects?: Array<{ slug: string; pattern: string }>;
}): string {
  const root = mkdtempSync(join(tmpdir(), "dev-factory-hook-"));
  temps.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "lib"), { recursive: true });
  writeFileSync(join(root, "scripts/dev_factory_stop_hook.ts"), "// marker\n");
  writeFileSync(join(root, "lib/devFactoryExecution.ts"), "// marker\n");
  mkdirSync(join(root, ".cursor"), { recursive: true });
  for (const p of opts?.projects ?? []) {
    writeProjectYaml(root, p.slug, p.pattern);
  }
  if (opts?.pending) {
    writeFileSync(
      join(root, ".cursor/dev-factory-pending-execute.json"),
      JSON.stringify(opts.pending, null, 2),
    );
  }
  if (opts?.argus) {
    writeFileSync(
      join(root, ".cursor/dev-factory-pending-argus-kick.json"),
      JSON.stringify(opts.argus, null, 2),
    );
  }
  return root;
}

describe("devFactoryHookRuntime", () => {
  const payload = buildBacklogWakePayload(FIXTURE_CONFIG, [...FIXTURE_ISSUES]);
  const pending = buildPendingExecuteState(
    payload,
    FIXTURE_CONFIG.git.branch_prefixes,
    "jira",
    "selftest",
  );

  it("HK-01 resolves engine from workspace/dev-agent child", () => {
    expect(isDevFactoryEngineRoot(REAL_ENGINE)).toBe(true);
    const ws = dirname(REAL_ENGINE);
    expect(
      resolveDevFactoryEngineRoot(ws, { ...process.env, DEV_FACTORY_ENGINE_ROOT: "" }),
    ).toBe(REAL_ENGINE);
    expect(
      resolveDevFactoryEngineRoot(REAL_ENGINE, {
        ...process.env,
        DEV_FACTORY_ENGINE_ROOT: "",
      }),
    ).toBe(REAL_ENGINE);
  });

  it("HK-02 honors DEV_FACTORY_ENGINE_ROOT override", () => {
    const fake = fakeEngine();
    expect(
      resolveDevFactoryEngineRoot("/tmp/not-an-engine", {
        DEV_FACTORY_ENGINE_ROOT: fake,
      }),
    ).toBe(fake);
  });

  it("HK-03 infers slug from ticket key pattern without env slug", () => {
    const root = fakeEngine({
      projects: [
        { slug: "selftest", pattern: "TST-\\\\d+" },
        { slug: "other", pattern: "other#\\\\d+" },
      ],
    });
    expect(inferSlugFromTicketKey(root, "TST-105")).toBe("selftest");
    expect(inferSlugFromTicketKey(root, "other#9")).toBe("other");
  });

  it("HK-04 resolveHookSlug prefers latch slug then ticket infer then env", () => {
    const root = fakeEngine({
      projects: [{ slug: "selftest", pattern: "TST-\\\\d+" }],
    });
    expect(
      resolveHookSlug({
        engineRoot: root,
        pending: { ...pending, slug: "selftest" },
        envSlug: "other",
      }),
    ).toBe("selftest");
    expect(
      resolveHookSlug({
        engineRoot: root,
        pending: { ...pending, slug: undefined, oldest: "TST-105" },
        envSlug: "other",
      }),
    ).toBe("selftest");
    expect(
      resolveHookSlug({
        engineRoot: root,
        pending: null,
        envSlug: "selftest",
      }),
    ).toBe("selftest");
  });

  it("HK-05 stop hook forces followup with no DEV_AGENT_SLUG", () => {
    const root = fakeEngine({
      projects: [{ slug: "selftest", pattern: "TST-\\\\d+" }],
    });
    const res = decideDevFactoryStopHook({
      engineRoot: root,
      status: "completed",
      loopCount: 0,
      envSlug: "",
      currentBranch: "main",
      hasWorkingTreeChanges: false,
      hasOpenPr: false,
      pending: { ...pending, slug: undefined, oldest: "TST-105" },
      argusPending: null,
    });
    expect(res.followup_message).toContain("TST-105");
    expect(res.followup_message).toContain("BACKLOG_WAKE_EXECUTE");
  });

  it("HK-06 stop hook is silent when latch consumed", () => {
    const res = decideDevFactoryStopHook({
      engineRoot: REAL_ENGINE,
      status: "completed",
      loopCount: 0,
      envSlug: "",
      pending: { ...pending, consumed: true },
      argusPending: null,
    });
    expect(res).toEqual({});
  });

  it("HK-07 stop hook skips aborted turns", () => {
    const res = decideDevFactoryStopHook({
      engineRoot: REAL_ENGINE,
      status: "aborted",
      loopCount: 0,
      pending,
      argusPending: null,
    });
    expect(res).toEqual({});
  });

  it("HK-08 sessionStart injects pending execute from engine root", () => {
    const root = fakeEngine({
      pending: {
        oldest: "TST-105",
        count: 2,
        consumed: false,
        executePrompt: "BACKLOG_WAKE_EXECUTE: Start TST-105 NOW",
      },
    });
    const res = decideDevFactorySessionStart(root);
    expect(res.additional_context).toContain("TST-105");
    expect(res.additional_context).toContain("DEV FACTORY EXECUTION PENDING");
  });

  it("HK-09 stop hook still forces when project yaml cannot load", () => {
    const root = fakeEngine({
      pending: {
        oldest: "ZZ-1",
        count: 1,
        consumed: false,
        executePrompt: "BACKLOG_WAKE_EXECUTE: Start ZZ-1 NOW",
      },
    });
    const res = decideDevFactoryStopHook({
      engineRoot: root,
      status: "completed",
      loopCount: 0,
      envSlug: "",
      pending: {
        oldest: "ZZ-1",
        count: 1,
        branchPrefix: "feat/ZZ-1",
        issuedAt: new Date().toISOString(),
        consumed: false,
        executePrompt: "BACKLOG_WAKE_EXECUTE: Start ZZ-1 NOW",
      },
      argusPending: null,
    });
    expect(res.followup_message).toContain("ZZ-1");
  });
});
