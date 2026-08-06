import { describe, expect, it } from "vitest";
import {
  cloudReposForProject,
  hourlyIdempotencyKey,
  oldestKeyFromWakeLine,
  parseTickStdout,
  planCloudWake,
} from "../../lib/cloudFactoryWake.ts";
import type { ProjectConfig } from "../../lib/projectConfig.ts";

const sampleConfig = {
  name: "Sample",
  slug: "sampleapp",
  dev_factory: {
    epic_key: "github:acme/sampleapp",
    pickup_label: "impl-dev",
    excluded_labels: [],
    excluded_issue_keys: [],
    statuses: ["open"],
    handoff_status: "validate-testing",
    forbidden_target_statuses: ["closed"],
    order_by: "created ASC",
  },
  git: {
    provider: "github" as const,
    workspace: "acme",
    repo: "sampleapp",
    default_branch: "main",
    branch_prefixes: ["feat"],
    ticket_key_pattern: "sampleapp#\\d+",
  },
  stg: { base_url: "https://example.test" },
  app: {
    repo_path: "../sampleapp",
    gate_command: "npm test",
    mr_push_command: "bash scripts/mr_push.sh",
    openspec_enabled: true,
    openspec_specs_dir: "openspec/specs",
  },
  loop: { purpose: "sampledev", interval_sec_default: 300 },
} satisfies ProjectConfig;

describe("parseTickStdout", () => {
  it("finds wake as last matching line", () => {
    const parsed = parseTickStdout(
      "noise\nBACKLOG_WAKE_EXECUTE count=2 oldest=sampleapp#9\n",
    );
    expect(parsed.kind).toBe("wake");
    expect(parsed.line).toContain("BACKLOG_WAKE_EXECUTE");
  });

  it("finds idle", () => {
    expect(parseTickStdout("DEV_FACTORY_IDLE count=0\n").kind).toBe("idle");
  });
});

describe("oldestKeyFromWakeLine", () => {
  it("parses JSON oldest field from tick line", () => {
    expect(
      oldestKeyFromWakeLine(
        `BACKLOG_WAKE_EXECUTE ${JSON.stringify({ oldest: "sampleapp#12", count: 1 })}`,
      ),
    ).toBe("sampleapp#12");
  });

  it("parses oldest=", () => {
    expect(
      oldestKeyFromWakeLine("BACKLOG_WAKE_EXECUTE oldest=sampleapp#12 count=1"),
    ).toBe("sampleapp#12");
  });
});

describe("cloudReposForProject", () => {
  it("includes app + engine + siblings", () => {
    const urls = cloudReposForProject(sampleConfig).map((r) => r.url);
    expect(urls).toEqual([
      "https://github.com/acme/sampleapp",
      "https://github.com/acme/dev-agent",
      "https://github.com/acme/qa-agent",
      "https://github.com/acme/ux-agent",
      "https://github.com/acme/ba-agent",
    ]);
  });
});

describe("hourlyIdempotencyKey", () => {
  it("buckets by UTC hour", () => {
    const d = new Date(Date.UTC(2026, 7, 6, 15, 42, 0));
    expect(hourlyIdempotencyKey("sampleapp", "sampleapp#3", d)).toBe(
      "cloud-factory-sampleapp-sampleapp#3-2026080615",
    );
  });
});

describe("planCloudWake", () => {
  it("idles on DEV_FACTORY_IDLE", () => {
    const plan = planCloudWake({
      parsed: { kind: "idle", line: "DEV_FACTORY_IDLE count=0" },
      config: sampleConfig,
      dryRun: false,
    });
    expect(plan.action).toBe("idle");
  });

  it("dry_run does not request spawn", () => {
    const plan = planCloudWake({
      parsed: {
        kind: "wake",
        line: "BACKLOG_WAKE_EXECUTE oldest=sampleapp#7 count=1",
      },
      config: sampleConfig,
      dryRun: true,
      now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
    });
    expect(plan.action).toBe("dry_run");
    if (plan.action !== "dry_run") return;
    expect(plan.issueKey).toBe("sampleapp#7");
    expect(plan.prompt).toContain("BACKLOG_WAKE_EXECUTE");
    expect(plan.prompt).toContain("Cloud factory wake");
    expect(plan.repos[0]?.url).toContain("/acme/sampleapp");
  });
});
