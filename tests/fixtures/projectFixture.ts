import type { ProjectConfig } from "../../lib/projectConfig.ts";

/** Generic selftest fixture — not a live project. */
export const FIXTURE_CONFIG: ProjectConfig = {
  name: "Self Test App",
  slug: "selftest",
  dev_factory: {
    epic_key: "TST-1",
    pickup_label: "impl-dev",
    excluded_labels: ["impl-qa", "human-required", "factory-pause", "needs-human"],
    excluded_issue_keys: ["TST-99", "TST-100"],
    statuses: ["To Do", "In Progress"],
    handoff_status: "Validate/Testing",
    forbidden_target_statuses: ["Done"],
    order_by: "created ASC",
  },
  git: {
    provider: "bitbucket",
    workspace: "example-corp",
    repo: "my-app",
    default_branch: "main",
    branch_prefixes: ["feat", "fix", "chore"],
    ticket_key_pattern: "TST-\\d+",
  },
  stg: { base_url: "https://staging.example.com" },
  app: {
    repo_path: "../my-app",
    gate_command: "npm test",
    mr_push_command: "npm run push-mr",
    openspec_enabled: true,
    openspec_specs_dir: "openspec/specs",
  },
  loop: { purpose: "selftestdev", interval_sec_default: 300 },
};

export const FIXTURE_ISSUES = [
  { key: "TST-105", summary: "edit request", status: "To Do" },
  { key: "TST-106", summary: "next", status: "To Do" },
] as const;
