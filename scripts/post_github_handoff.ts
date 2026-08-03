/**
 * Post STG handoff on a GitHub Issue (non-Jira factories).
 * Usage: npx tsx scripts/post_github_handoff.ts <slug> <issue-key-or-number> \
 *   --pr <url> --stg-build <sha> --main <sha> [--pipeline N] [--summary "..."]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { loadProjectConfig } from "../lib/loadProject.ts";
import { parseGithubIssueNumber } from "../lib/githubIssuesBacklog.ts";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  buildPrUrlPattern,
  formatHandoffComment,
  handoffCommentValid,
  stgBuildIdMatchesMain,
} from "../lib/projectConfig.ts";
import {
  qaReturnBlocksValidateTesting,
  type JiraCommentLike,
} from "../lib/jiraCommentGate.ts";
import {
  consumePendingExecuteState,
  PENDING_EXECUTE_PATH,
  shouldConsumePendingOnHandoff,
  type PendingExecuteState,
} from "../lib/devFactoryExecution.ts";
import { QA_KICK_YES, resolveQaHandoffKick } from "../lib/qaSubagentKick.ts";

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

function fetchGithubComments(
  owner: string,
  repo: string,
  num: number,
): JiraCommentLike[] {
  const raw = execFileSync(
    "gh",
    ["api", `repos/${owner}/${repo}/issues/${num}/comments`],
    { encoding: "utf8" },
  );
  try {
    const arr = JSON.parse(raw) as { created_at: string; body: string }[];
    return arr.map((c) => ({ created: c.created_at, body: c.body ?? "" }));
  } catch {
    return [];
  }
}

if (!slug || !issueArg) {
  console.error(
    "Usage: post_github_handoff.ts <slug> <issue#> --pr URL --stg-build SHA --main SHA [--pipeline N] [--summary text]",
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
const pipeline = arg("--pipeline") || "0";
const summary =
  arg("--summary") || `STG handoff for ${config.slug}#${num}`;
if (!pr || !stg || !main) {
  console.error("Required: --pr --stg-build --main");
  process.exit(1);
}

if (!stgBuildIdMatchesMain(stg, main)) {
  console.error(`STG_BUILD_MISMATCH stg=${stg} main=${main}`);
  process.exit(1);
}

const owner = config.git.workspace;
const repo = config.git.repo;
const repoRef = `${owner}/${repo}`;
const ticketKey = `${config.slug}#${num}`;

const comments = fetchGithubComments(owner, repo, num);
const gate = qaReturnBlocksValidateTesting(comments);
if (gate.blocked) {
  console.error(
    `QA_RETURN_BLOCKS_HANDOFF ${ticketKey}: ${gate.reason ?? "unresolved QA RETURN"}`,
  );
  process.exit(1);
}

const body = formatHandoffComment({
  mergedPrUrl: pr,
  pipelineBuildNumber: pipeline,
  stgBuildId: stg,
  mainCommit: main,
  summary,
  acceptanceSteps: [
    `Validate on STG: ${config.stg.base_url}`,
    "Tracker: GitHub Issues — close issue after QA pass (or add done label).",
  ],
});

const prPattern = buildPrUrlPattern(config.git);
if (!handoffCommentValid(body, prPattern)) {
  console.error("HANDOFF_COMMENT_INVALID — formatHandoffComment failed validation");
  process.exit(1);
}

const validateLabel =
  config.tracker?.validate_label ?? "validate-testing";
const pickupLabel = config.dev_factory.pickup_label;

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
const qaKick = resolveQaHandoffKick({ handoffOk: true });
if (qaKick.kick) {
  console.log(
    `${QA_KICK_YES} ${JSON.stringify({
      slug: config.slug,
      ticket: ticketKey,
      reasons: qaKick.reasons,
    })}`,
  );
  console.log(
    `ARGUS_KICK → wake qa-agent for ${config.slug} (${ticketKey}) — skill dev-qa-subagent / BACKLOG_WAKE_EXECUTE`,
  );
}
