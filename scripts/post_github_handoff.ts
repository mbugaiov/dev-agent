/**
 * Post STG handoff on a GitHub Issue (non-Jira factories).
 * Usage: npx tsx scripts/post_github_handoff.ts <slug> <issue-key-or-number> \
 *   --pr <url> --stg-build <sha> --main <sha>
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { loadProjectConfig } from "../lib/loadProject.ts";
import { parseGithubIssueNumber } from "../lib/githubIssuesBacklog.ts";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { stgBuildIdMatchesMain } from "../lib/projectConfig.ts";
import {
  consumePendingExecuteState,
  PENDING_EXECUTE_PATH,
  shouldConsumePendingOnHandoff,
  type PendingExecuteState,
} from "../lib/devFactoryExecution.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv[2] ?? "";
const issueArg = process.argv[3] ?? "";

function arg(name: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? "") : "";
}

function consumePendingExecuteForHandoff(ticketKey: string) {
  const path = join(ROOT, PENDING_EXECUTE_PATH);
  if (!existsSync(path)) return;
  try {
    const pending = JSON.parse(
      readFileSync(path, "utf8"),
    ) as PendingExecuteState;
    if (!shouldConsumePendingOnHandoff(pending, ticketKey)) return;
    writeFileSync(
      path,
      JSON.stringify(consumePendingExecuteState(pending), null, 2) + "\n",
      "utf8",
    );
    console.log(`PENDING_EXECUTE_CONSUMED {"ticket":"${ticketKey}"}`);
  } catch {
    /* ignore */
  }
}

if (!slug || !issueArg) {
  console.error(
    "Usage: post_github_handoff.ts <slug> <issue#> --pr URL --stg-build SHA --main SHA",
  );
  process.exit(1);
}

const config = loadProjectConfig(ROOT, slug);
const num = parseGithubIssueNumber(issueArg);
if (!num) {
  console.error("Could not parse issue number from", issueArg);
  process.exit(1);
}

const pr = arg("--pr");
const stg = arg("--stg-build");
const main = arg("--main");
if (!pr || !stg || !main) {
  console.error("Required: --pr --stg-build --main");
  process.exit(1);
}

if (!stgBuildIdMatchesMain(stg, main)) {
  console.error(`STG_BUILD_MISMATCH stg=${stg} main=${main}`);
  process.exit(1);
}

const validateLabel =
  config.tracker?.validate_label ?? "validate-testing";
const pickupLabel = config.dev_factory.pickup_label;
const owner = config.git.workspace;
const repo = config.git.repo;
const stgUrl = config.stg.base_url;
const repoRef = `${owner}/${repo}`;
const ticketKey = `${config.slug}#${num}`;

const body = [
  "## STG handoff (Hephaestus)",
  "",
  `- **PR:** ${pr}`,
  `- **main:** \`${main.slice(0, 12)}\``,
  `- **STG buildId:** \`${stg.slice(0, 12)}\` — matches main`,
  `- **STG:** ${stgUrl}`,
  "",
  `Removed \`${pickupLabel}\`; applied \`${validateLabel}\` — QA may validate on STG.`,
  "",
  "Tracker: GitHub Issues (no Jira).",
].join("\n");

execFileSync(
  "gh",
  ["issue", "comment", String(num), "-R", repoRef, "--body", body],
  { stdio: "inherit" },
);
execFileSync(
  "gh",
  [
    "issue",
    "edit",
    String(num),
    "-R",
    repoRef,
    "--add-label",
    validateLabel,
    "--remove-label",
    pickupLabel,
  ],
  { stdio: "inherit" },
);
consumePendingExecuteForHandoff(ticketKey);
console.log(`GITHUB_HANDOFF_OK ${repoRef}#${num} → ${validateLabel} (−${pickupLabel})`);
