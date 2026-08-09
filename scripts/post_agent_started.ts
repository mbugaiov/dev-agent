#!/usr/bin/env tsx
/**
 * Post ### <Seat> started on the tracker (GitHub Issues/PR or Jira) and print
 * the same markdown for Cursor chat.
 *
 * Usage:
 *   npx tsx scripts/post_agent_started.ts <slug> <KEY|N|pr:N> <Seat> "<Mode>" "<Doing>"
 *   npx tsx scripts/post_agent_started.ts --repo owner/repo pr:<N> <Seat> "<Mode>" "<Doing>"
 *   AGENT_START_DRY_RUN=1 …  (print only)
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { jiraFetch, plainTextToAdf } from "../lib/jiraClient.ts";
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

function buildBody(opts: {
  seat: string;
  ticketLine: string;
  mode: string;
  doing: string;
}): string {
  return [
    `### ${opts.seat} started`,
    "",
    opts.ticketLine,
    `**Mode:** ${opts.mode}`,
    `**Doing:** ${opts.doing}`,
    "",
    `\`post_agent_started · ${new Date().toISOString()}\``,
  ].join("\n");
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
  let ticketLine = "";
  let body = "";

  // Explicit --repo → always GitHub
  if (owner && repo) {
    if (target.startsWith("pr:")) {
      const num = target.slice(3);
      ticketLine = `**PR:** ${owner}/${repo}#${num}`;
      body = buildBody({ seat, ticketLine, mode, doing });
      console.log(body);
      console.log("-----");
      if (dry) {
        console.log("AGENT_START_DRY_RUN ok");
        return;
      }
      execFileSync(
        "gh",
        ["pr", "comment", num, "-R", `${owner}/${repo}`, "--body", body],
        { stdio: "inherit" },
      );
    } else {
      ticketLine = `**Ticket:** ${slug}#${target}`;
      body = buildBody({ seat, ticketLine, mode, doing });
      console.log(body);
      console.log("-----");
      if (dry) {
        console.log("AGENT_START_DRY_RUN ok");
        return;
      }
      execFileSync(
        "gh",
        ["issue", "comment", target, "-R", `${owner}/${repo}`, "--body", body],
        { stdio: "inherit" },
      );
    }
    console.log(
      `AGENT_START_OK ${JSON.stringify({ repo: `${owner}/${repo}`, target, seat })}`,
    );
    return;
  }

  const config = loadProjectConfig(ROOT, slug);
  const tracker = resolveTrackerProvider(config);

  if (tracker === "github_issues") {
    owner = config.git.workspace;
    repo = config.git.repo;
    if (target.startsWith("pr:")) {
      const num = target.slice(3);
      ticketLine = `**PR:** ${owner}/${repo}#${num}`;
      body = buildBody({ seat, ticketLine, mode, doing });
      console.log(body);
      console.log("-----");
      if (dry) {
        console.log("AGENT_START_DRY_RUN ok");
        return;
      }
      execFileSync(
        "gh",
        ["pr", "comment", num, "-R", `${owner}/${repo}`, "--body", body],
        { stdio: "inherit" },
      );
    } else {
      ticketLine = `**Ticket:** ${slug}#${target}`;
      body = buildBody({ seat, ticketLine, mode, doing });
      console.log(body);
      console.log("-----");
      if (dry) {
        console.log("AGENT_START_DRY_RUN ok");
        return;
      }
      execFileSync(
        "gh",
        ["issue", "comment", target, "-R", `${owner}/${repo}`, "--body", body],
        { stdio: "inherit" },
      );
    }
    console.log(
      `AGENT_START_OK ${JSON.stringify({ tracker, repo: `${owner}/${repo}`, target, seat })}`,
    );
    return;
  }

  // Jira — target must be issue KEY (e.g. RQ-123), not pr:
  if (target.startsWith("pr:")) {
    console.error(
      "AGENT_START_FAIL Jira tracker: use issue KEY (not pr:N). Comment on the Jira ticket; mention the MR URL in Doing.",
    );
    process.exit(1);
  }
  ticketLine = `**Ticket:** ${target}`;
  body = buildBody({ seat, ticketLine, mode, doing });
  console.log(body);
  console.log("-----");
  if (dry) {
    console.log("AGENT_START_DRY_RUN ok");
    return;
  }
  const commentRes = await jiraFetch(`/rest/api/3/issue/${target}/comment`, {
    method: "POST",
    body: JSON.stringify({ body: plainTextToAdf(body) }),
  });
  if (!commentRes.ok) {
    console.error(
      "AGENT_START_FAIL Jira comment:",
      commentRes.status,
      await commentRes.text(),
    );
    process.exit(1);
  }
  console.log(
    `AGENT_START_OK ${JSON.stringify({ tracker: "jira", key: target, seat })}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
