#!/usr/bin/env tsx
/**
 * Post ### <Seat> progress on the tracker (GitHub Issues/PR, Jira, and/or Bitbucket PR).
 * Living comment per seat+ticket — mid-flight MR/pipeline/STG/handoff visibility.
 *
 * Usage:
 *   npx tsx scripts/post_agent_progress.ts <slug> <KEY|N|pr:N> <Seat> <milestone> "<Detail>"
 *   npx tsx scripts/post_agent_progress.ts --repo owner/repo <N|pr:N> <Seat> <milestone> "<Detail>"
 *   AGENT_PROGRESS_DRY_RUN=1 …
 *
 * Milestones: mr_opened | pipeline_waiting | pipeline_failed | pipeline_retry |
 *             pipeline_green | stg_verify | handoff
 *
 * Jira + git.provider bitbucket dual-write:
 *   KEY → Jira; also Bitbucket when progress-pr.key / DEV_PROGRESS_PR set
 *   pr:N → Bitbucket only (and latches progress-pr.key)
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
  buildProgressChatBanner,
  humanizeMilestone,
  isProgressMilestone,
  type AgentProgressEvent,
} from "../lib/agentProgressStack.ts";
import {
  upsertBitbucketAgentProgress,
  upsertGithubAgentProgress,
  upsertJiraAgentProgress,
} from "../lib/agentProgressTracker.ts";
import { githubTargetKey } from "../lib/agentStartedStack.ts";
import { loadProjectConfig } from "../lib/loadProject.ts";
import {
  readProgressPrKey,
  writeProgressPrKey,
} from "../lib/progressTicketLatch.ts";
import { resolveTrackerProvider, type ProjectConfig } from "../lib/projectConfig.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function usage(): never {
  console.error(
    `Usage: post_agent_progress.ts <slug> <KEY|issueN|pr:N> <Seat> <milestone> "<Detail>"
   or: post_agent_progress.ts --repo owner/repo <issueN|pr:N> <Seat> <milestone> "<Detail>"`,
  );
  process.exit(2);
}

async function postGithub(opts: {
  owner: string;
  repo: string;
  target: string;
  slug: string;
  event: AgentProgressEvent;
  extraOk?: Record<string, string>;
}): Promise<void> {
  const isPr = opts.target.startsWith("pr:");
  const num = isPr ? opts.target.slice(3) : opts.target;
  const targetKey = githubTargetKey("issue", num);
  const result = upsertGithubAgentProgress({
    owner: opts.owner,
    repo: opts.repo,
    issueNumber: num,
    event: opts.event,
    targetKey,
  });
  console.log(
    `AGENT_PROGRESS_OK ${JSON.stringify({
      repo: `${opts.owner}/${opts.repo}`,
      target: opts.target,
      seat: opts.event.seat,
      status: opts.event.status,
      action: result.action,
      ...opts.extraOk,
    })}`,
  );
}

async function postBitbucketPr(
  config: ProjectConfig,
  prId: string,
  event: AgentProgressEvent,
  slug: string,
): Promise<void> {
  writeProgressPrKey(ROOT, slug, prId);
  const result = await upsertBitbucketAgentProgress({
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
    `AGENT_PROGRESS_OK ${JSON.stringify({
      tracker: "bitbucket",
      pr: prId,
      seat: event.seat,
      status: event.status,
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
  let milestone = "";
  let detail = "";

  if (argv[0] === "--repo") {
    const rr = argv[1] ?? "";
    const slash = rr.indexOf("/");
    if (slash < 1) usage();
    owner = rr.slice(0, slash);
    repo = rr.slice(slash + 1);
    target = argv[2] ?? "";
    seat = argv[3] ?? "";
    milestone = argv[4] ?? "";
    detail = argv[5] ?? "";
    slug = repo || "engine";
  } else {
    slug = argv[0] ?? "";
    target = argv[1] ?? "";
    seat = argv[2] ?? "";
    milestone = argv[3] ?? "";
    detail = argv[4] ?? "";
  }

  if (!target || !seat || !milestone || !detail) usage();
  if (!slug && !owner) usage();

  const status = isProgressMilestone(milestone)
    ? humanizeMilestone(milestone)
    : milestone;
  const dry = process.env.AGENT_PROGRESS_DRY_RUN === "1";
  const isPr = target.startsWith("pr:");
  const at = new Date();

  const ticketLineFor = (
    ownerName: string,
    repoName: string,
    slugName: string,
  ) =>
    isPr
      ? `**PR:** ${ownerName}/${repoName}#${target.slice(3)}`
      : /^\d+$/.test(target)
        ? `**Ticket:** ${slugName}#${target}`
        : `**Ticket:** ${target}`;

  if (owner && repo) {
    const event: AgentProgressEvent = {
      seat,
      ticketLine: ticketLineFor(owner, repo, slug),
      status,
      detail,
      at,
    };
    console.log(buildProgressChatBanner(event));
    console.log("-----");
    if (dry) {
      console.log("AGENT_PROGRESS_DRY_RUN ok");
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
    const event: AgentProgressEvent = {
      seat,
      ticketLine: ticketLineFor(owner, repo, slug),
      status,
      detail,
      at,
    };
    console.log(buildProgressChatBanner(event));
    console.log("-----");
    if (dry) {
      console.log("AGENT_PROGRESS_DRY_RUN ok");
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

  const event: AgentProgressEvent = {
    seat,
    ticketLine: isPr
      ? `**PR:** ${config.git.workspace}/${config.git.repo}#${target.slice(3)}`
      : `**Ticket:** ${target}`,
    status,
    detail,
    at,
  };
  console.log(buildProgressChatBanner(event));
  console.log("-----");
  if (dry) {
    console.log("AGENT_PROGRESS_DRY_RUN ok");
    return;
  }

  const prId = resolveDualWritePrId(slug, target);
  const wantBb = shouldDualWriteBitbucketPr(config) && Boolean(prId);

  if (isPr) {
    if (!wantBb || !prId) {
      console.error(
        "AGENT_PROGRESS_FAIL pr:N requires git.provider=bitbucket and Bitbucket credentials",
      );
      process.exit(1);
    }
    await postBitbucketPr(config, prId, event, slug);
    return;
  }

  if (!isJiraIssueKey(target)) {
    console.error(
      "AGENT_PROGRESS_FAIL Jira tracker: use issue KEY (e.g. TST-123) or pr:N for Bitbucket MR",
    );
    process.exit(1);
  }

  const result = await upsertJiraAgentProgress({
    issueKey: target,
    event,
    targetKey: target,
  });
  console.log(
    `AGENT_PROGRESS_OK ${JSON.stringify({
      tracker: "jira",
      key: target,
      seat,
      status,
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
