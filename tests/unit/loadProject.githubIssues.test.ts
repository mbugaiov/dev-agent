import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadProjectConfig } from "../../lib/loadProject.ts";

describe("loadProjectConfig github_issues", () => {
  it("accepts jira factory with jql and no epic_key", () => {
    const root = mkdtempSync(join(tmpdir(), "dev-agent-proj-"));
    const dir = join(root, "projects", "webapp");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "project.yaml"),
      `
name: My Solark QA
slug: webapp
dev_factory:
  jql: 'project = RQ AND labels = impl-dev AND status in ("To Do") ORDER BY created ASC'
  pickup_label: impl-dev
  excluded_labels: [impl-qa]
  excluded_issue_keys: []
  statuses: ["To Do", "In Progress"]
  handoff_status: Validate/Testing
  forbidden_target_statuses: ["Done"]
  order_by: created ASC
git:
  provider: bitbucket
  workspace: example-corp
  repo: qa_webapp_regressiontest
  default_branch: main
  branch_prefixes: [feat]
  ticket_key_pattern: "RQ-\\\\d+"
stg:
  base_url: https://stg.example.com
app:
  repo_path: ../qa_webapp_regressiontest
  gate_command: make check
  mr_push_command: echo skip
  openspec_enabled: false
  openspec_specs_dir: openspec/specs
loop:
  purpose: webappdev
  interval_sec_default: 300
jira:
  enabled: true
`,
    );
    try {
      const cfg = loadProjectConfig(root, "webapp");
      expect(cfg.dev_factory.epic_key).toBeUndefined();
      expect(cfg.dev_factory.jql).toContain("project = RQ");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

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
