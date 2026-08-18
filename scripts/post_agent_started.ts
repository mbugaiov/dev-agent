#!/usr/bin/env tsx
/**
 * Post ### <Seat> started on the tracker (GitHub Issues/PR or Jira) and print
 * the same markdown for Cursor chat.
 *
 * One living comment per seat+ticket: identical Mode+Doing is skipped;
 * a new plan PATCHes and stacks onto the same comment (session TTL 6h).
 *
 * Usage:
 *   npx tsx scripts/post_agent_started.ts <slug> <KEY|N|pr:N> <Seat> "<Mode>" "<Doing>"
 *   npx tsx scripts/post_agent_started.ts --repo owner/repo pr:<N> <Seat> "<Mode>" "<Doing>"
 *   AGENT_START_DRY_RUN=1 …  (print only)
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildChatBanner,
  githubTargetKey,
  type AgentStartEvent,
} from "../lib/agentStartedStack.ts";
import {
  upsertGithubAgentStarted,
  upsertJiraAgentStarted,
} from "../lib/agentStartedTracker.ts";
import { loadProjectConfig } from "../lib/loadProject.ts";
import { resolveTrackerProvider } from "../lib/projectConfig.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function usage(): never {
  console.error(
    `Usage: post_agent_started.ts <slug> <KEY|issueN|pr:N> <Seat> "<Mode>" "<Doing>"
   or: post_agent_started.ts --repo owner/repo <issueN|pr:N> <Seat> "<Mode>" "<Doing>"`,
  );
  process.exit(2);
}

async function postGithub(opts: {
  owner: string;
  repo: string;
  target: string;
  slug: string;
  event: AgentStartEvent;
  extraOk?: Record<string, string>;
}): Promise<void> {
  const isPr = opts.target.startsWith("pr:");
  const num = isPr ? opts.target.slice(3) : opts.target;
  // PRs share the issue comment thread — one Hephaestus banner per number.
  const targetKey = githubTargetKey("issue", num);
  const result = upsertGithubAgentStarted({
    owner: opts.owner,
    repo: opts.repo,
    issueNumber: num,
    event: opts.event,
    targetKey,
  });
  console.log(
    `AGENT_START_OK ${JSON.stringify({
      repo: `${opts.owner}/${opts.repo}`,
      target: opts.target,
      seat: opts.event.seat,
      action: result.action,
      ...opts.extraOk,
    })}`,
  );
}

async function main() {
  const argv = process.argv.slice(2);
  let owner = "";
  let repo = "";
  let slug = "";
  let target = "";
  let seat = "";
  let mode = "";
  let doing = "";

  if (argv[0] === "--repo") {
    const rr = argv[1] ?? "";
    const slash = rr.indexOf("/");
    if (slash < 1) usage();
    owner = rr.slice(0, slash);
    repo = rr.slice(slash + 1);
    target = argv[2] ?? "";
    seat = argv[3] ?? "";
    mode = argv[4] ?? "";
    doing = argv[5] ?? "";
    slug = repo || "engine";
  } else {
    slug = argv[0] ?? "";
    target = argv[1] ?? "";
    seat = argv[2] ?? "";
    mode = argv[3] ?? "";
    doing = argv[4] ?? "";
  }

  if (!target || !seat || !mode || !doing) usage();
  if (!slug && !owner) usage();

  const dry = process.env.AGENT_START_DRY_RUN === "1";
  const isPr = target.startsWith("pr:");
  const at = new Date();

  const ticketLineFor = (ownerName: string, repoName: string, slugName: string) =>
    isPr
      ? `**PR:** ${ownerName}/${repoName}#${target.slice(3)}`
      : `**Ticket:** ${slugName}#${target}`;

  // Explicit --repo → always GitHub
  if (owner && repo) {
    const event: AgentStartEvent = {
      seat,
      ticketLine: ticketLineFor(owner, repo, slug),
      mode,
      doing,
      at,
    };
    console.log(buildChatBanner(event));
    console.log("-----");
    if (dry) {
      console.log("AGENT_START_DRY_RUN ok");
      return;
    }
    await postGithub({ owner, repo, target, slug, event });
    return;
  }

  const config = loadProjectConfig(ROOT, slug);
  const tracker = resolveTrackerProvider(config);

  if (tracker === "github_issues") {
    owner = config.git.workspace;
    repo = config.git.repo;
    const event: AgentStartEvent = {
      seat,
      ticketLine: ticketLineFor(owner, repo, slug),
      mode,
      doing,
      at,
    };
    console.log(buildChatBanner(event));
    console.log("-----");
    if (dry) {
      console.log("AGENT_START_DRY_RUN ok");
      return;
    }
    await postGithub({
      owner,
      repo,
      target,
      slug,
      event,
      extraOk: { tracker },
    });
    return;
  }

  // Jira — target must be issue KEY (e.g. TST-123), not pr:
  if (target.startsWith("pr:")) {
    console.error(
      "AGENT_START_FAIL Jira tracker: use issue KEY (not pr:N). Comment on the Jira ticket; mention the MR URL in Doing.",
    );
    process.exit(1);
  }
  const event: AgentStartEvent = {
    seat,
    ticketLine: `**Ticket:** ${target}`,
    mode,
    doing,
    at,
  };
  console.log(buildChatBanner(event));
  console.log("-----");
  if (dry) {
    console.log("AGENT_START_DRY_RUN ok");
    return;
  }
  const result = await upsertJiraAgentStarted({
    issueKey: target,
    event,
    targetKey: target,
  });
  console.log(
    `AGENT_START_OK ${JSON.stringify({
      tracker: "jira",
      key: target,
      seat,
      action: result.action,
    })}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
