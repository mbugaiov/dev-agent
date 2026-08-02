import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadProjectConfig } from "../../lib/loadProject.ts";

describe("loadProjectConfig github_issues", () => {
  it("defaults epic_key for github_issues when omitted", () => {
    const root = mkdtempSync(join(tmpdir(), "dev-agent-proj-"));
    const dir = join(root, "projects", "myapp");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "project.yaml"),
      `
name: My App
slug: myapp
tracker:
  provider: github_issues
dev_factory:
  pickup_label: impl-dev
  excluded_labels: []
  excluded_issue_keys: []
  statuses: ["open"]
  handoff_status: validate-testing
  forbidden_target_statuses: ["closed"]
  order_by: created ASC
git:
  provider: github
  workspace: example-corp
  repo: my-app
  default_branch: main
  branch_prefixes: [feat]
  ticket_key_pattern: "my-app#\\\\d+"
stg:
  base_url: https://stg.example.com
app:
  repo_path: ../my-app
  gate_command: npm test
  mr_push_command: npm run mr:push
  openspec_enabled: true
  openspec_specs_dir: openspec/specs
loop:
  purpose: myappdev
  interval_sec_default: 300
jira:
  enabled: false
`,
    );
    try {
      const cfg = loadProjectConfig(root, "myapp");
      expect(cfg.dev_factory.epic_key).toBe("github:example-corp/my-app");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
