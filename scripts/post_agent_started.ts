#!/usr/bin/env tsx
/**
 * Post ### <Seat> started on the tracker (GitHub Issues/PR, Jira, and/or Bitbucket PR)
 * and print the same markdown for Cursor chat.
 *
 * One living comment per seat+ticket: identical Mode+Doing is skipped;
 * a new plan PATCHes and stacks onto the same comment (session TTL 6h).
 *
 * Usage:
 *   npx tsx scripts/post_agent_started.ts <slug> <KEY|N|pr:N> <Seat> "<Mode>" "<Doing>"
 *   npx tsx scripts/post_agent_started.ts --repo owner/repo pr:<N> <Seat> "<Mode>" "<Doing>"
 *   AGENT_START_DRY_RUN=1 …  (print only)
 *
 * Jira + git.provider bitbucket:
 *   KEY → Jira upsert; also Bitbucket PR when progress-pr.key / DEV_PROGRESS_PR set
 *   pr:N → Bitbucket PR upsert only
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bitbucketPrTargetKey,
  isJiraIssueKey,
  parsePrId,
  shouldDualWriteBitbucketPr,
} from "../lib/agentCommentRouting.ts";
import {
  buildChatBanner,
  githubTargetKey,
  type AgentStartEvent,
} from "../lib/agentStartedStack.ts";
import {
  upsertBitbucketAgentStarted,
  upsertGithubAgentStarted,
  upsertJiraAgentStarted,
} from "../lib/agentStartedTracker.ts";
import { loadProjectConfig } from "../lib/loadProject.ts";
import {
  readProgressPrKey,
  writeProgressPrKey,
} from "../lib/progressTicketLatch.ts";
import { resolveTrackerProvider, type ProjectConfig } from "../lib/projectConfig.ts";

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

async function postBitbucketPr(
  config: ProjectConfig,
  prId: string,
  event: AgentStartEvent,
  slug: string,
): Promise<void> {
  writeProgressPrKey(ROOT, slug, prId);
  const result = await upsertBitbucketAgentStarted({
    workspace: config.git.workspace,
    repo: config.git.repo,
    prId,
    event: {
      ...event,
      ticketLine: `**PR:** ${config.git.workspace}/${config.git.repo}#${prId}`,
    },
    targetKey: bitbucketPrTargetKey(prId),
  });
  console.log(
    `AGENT_START_OK ${JSON.stringify({
      tracker: "bitbucket",
      pr: prId,
      seat: event.seat,
      action: result.action,
    })}`,
  );
}

function resolveDualWritePrId(slug: string, target: string): string | undefined {
  const fromTarget = target.startsWith("pr:") ? parsePrId(target) : undefined;
  if (fromTarget) return fromTarget;
  const envPr = (process.env.DEV_PROGRESS_PR ?? "").trim();
  if (/^\d+$/.test(envPr)) return envPr;
  return readProgressPrKey(ROOT, slug);
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

  // Jira tracker (+ optional Bitbucket PR dual-write)
  const event: AgentStartEvent = {
    seat,
    ticketLine: isPr
      ? `**PR:** ${config.git.workspace}/${config.git.repo}#${target.slice(3)}`
      : `**Ticket:** ${target}`,
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

  const prId = resolveDualWritePrId(slug, target);
  const wantBb = shouldDualWriteBitbucketPr(config) && Boolean(prId);

  if (isPr) {
    if (!wantBb || !prId) {
      console.error(
        "AGENT_START_FAIL pr:N requires git.provider=bitbucket and Bitbucket credentials",
      );
      process.exit(1);
    }
    await postBitbucketPr(config, prId, event, slug);
    return;
  }

  if (!isJiraIssueKey(target)) {
    console.error(
      "AGENT_START_FAIL Jira tracker: use issue KEY (e.g. TST-123) or pr:N for Bitbucket MR",
    );
    process.exit(1);
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

  if (wantBb && prId) {
    await postBitbucketPr(config, prId, event, slug);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
