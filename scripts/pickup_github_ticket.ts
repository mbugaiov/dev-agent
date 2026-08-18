#!/usr/bin/env tsx
/**
 * Pick up a GitHub Issues factory ticket — ensure pickup label, scope comment.
 * Usage: pickup_github_ticket.ts <slug> <issue-key-or-number> --scope "..." [--dry-run]
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { githubTargetKey } from "../lib/agentStartedStack.ts";
import { upsertGithubAgentStarted } from "../lib/agentStartedTracker.ts";
import { parseGithubIssueNumber } from "../lib/githubIssuesBacklog.ts";
import { loadProjectConfig } from "../lib/loadProject.ts";
import { resolveTrackerProvider } from "../lib/projectConfig.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function usage(): never {
  console.error(
    `Usage: pickup_github_ticket.ts <slug> <issue#> --scope "<plan comment>" [--dry-run]`,
  );
  process.exit(2);
}

function parseArgs(argv: string[]) {
  const slug = argv[0];
  const key = argv[1];
  if (!slug || !key || slug.startsWith("-") || key.startsWith("-")) usage();

  let scope = "";
  let dryRun = false;

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--scope") {
      const v = argv[++i];
      if (!v) usage();
      scope = v;
    } else if (a === "--dry-run") {
      dryRun = true;
    } else if (a === "--points") {
      // Accepted for CLI parity with Jira pickup; ignored on GitHub Issues.
      i++;
    } else {
      console.error(`Unknown arg: ${a}`);
      usage();
    }
  }

  if (!scope.trim()) usage();
  return { slug, key, scope: scope.trim(), dryRun };
}

function ghJson(args: string[]): unknown {
  const raw = execFileSync("gh", args, { encoding: "utf8" });
  return JSON.parse(raw);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadProjectConfig(ROOT, args.slug);
  if (resolveTrackerProvider(config) !== "github_issues") {
    console.error(
      `PICKUP_WRONG_TRACKER — slug "${args.slug}" is not tracker.provider=github_issues; use pickup_jira_ticket.sh`,
    );
    process.exit(1);
  }

  const owner = config.git.workspace;
  const repo = config.git.repo;
  const num = parseGithubIssueNumber(args.key, config.slug);
  if (num === null) {
    console.error(`Invalid GitHub issue key: ${args.key}`);
    process.exit(1);
  }

  const pickupLabel = config.dev_factory.pickup_label;
  const validateLabel = config.tracker?.validate_label ?? "validate-testing";
  const actions: string[] = [];

  const issue = ghJson([
    "issue",
    "view",
    String(num),
    "-R",
    `${owner}/${repo}`,
    "--json",
    "number,title,state,labels",
  ]) as {
    number: number;
    title: string;
    state: string;
    labels: { name: string }[];
  };

  if (String(issue.state).toLowerCase() !== "open") {
    console.error(`PICKUP_CLOSED — ${owner}/${repo}#${num} is ${issue.state}`);
    process.exit(1);
  }

  const labels = new Set((issue.labels ?? []).map((l) => l.name));
  if (!labels.has(pickupLabel)) {
    actions.push(`label +${pickupLabel}`);
    if (!args.dryRun) {
      execFileSync(
        "gh",
        ["issue", "edit", String(num), "-R", `${owner}/${repo}`, "--add-label", pickupLabel],
        { stdio: "inherit" },
      );
    }
  }

  if (labels.has(validateLabel)) {
    actions.push(`label -${validateLabel}`);
    if (!args.dryRun) {
      execFileSync(
        "gh",
        [
          "issue",
          "edit",
          String(num),
          "-R",
          `${owner}/${repo}`,
          "--remove-label",
          validateLabel,
        ],
        { stdio: "inherit" },
      );
    }
  }

  actions.push("scope comment");
  if (!args.dryRun) {
    const result = upsertGithubAgentStarted({
      owner,
      repo,
      issueNumber: String(num),
      targetKey: githubTargetKey("issue", num),
      event: {
        seat: "Hephaestus",
        ticketLine: `**Ticket:** ${config.slug}#${num}`,
        mode: "pickup / implement",
        doing: args.scope,
        at: new Date(),
      },
    });
    actions.push(`banner ${result.action}`);
  }

  const key = `${config.slug}#${num}`;
  console.log(
    `PICKUP_OK {"issue":"${key}","status":"${issue.state}","actions":[${actions
      .map((a) => `"${a}"`)
      .join(",")}]${args.dryRun ? ',"dryRun":true' : ""}}`,
  );
}

main();
