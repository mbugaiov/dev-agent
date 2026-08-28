#!/usr/bin/env npx tsx
/**
 * Hephaestus project-bootstrap demux:
 *   decide → strip pickup (impl-dev) → ensure_chronos oneshot → comment
 *
 * Usage:
 *   npx tsx scripts/demux_project_bootstrap.ts <slug> <TICKET> --labels a,b[,…]
 *     [--dry-run] [--skip-chronos]
 *
 * Exit 0 on demux attempted/completed; 1 if no demux needed; 2 usage/config error.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectConfig } from "../lib/loadProject.ts";
import { jiraFetch, plainTextToAdf } from "../lib/jiraClient.ts";
import { jiraAdfToPlainText } from "../lib/jiraCommentGate.ts";
import { parseGithubIssueNumber } from "../lib/githubIssuesBacklog.ts";
import { resolveTrackerProvider } from "../lib/projectConfig.ts";
import {
  commentsHaveWbsDraftReady,
  commentsHaveWbsReady,
  resolveBootstrapDemux,
} from "../lib/bootstrapKick.ts";
import { fireChronosBootstrapKick } from "../lib/chronosKickBridge.ts";
import {
  stripGithubPickupLabel,
  stripJiraPickupLabel,
} from "../lib/stripPickupLabel.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadSecretsEnv(slug: string): void {
  for (const name of ["jira.env", "bitbucket.env", "github.env"]) {
    const p = join(ROOT, "projects", slug, ".secrets", name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 1) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!(k in process.env) || !process.env[k]) process.env[k] = v;
    }
  }
}

function usage(): never {
  console.error(
    `Usage: demux_project_bootstrap.ts <slug> <TICKET> --labels a,b [--dry-run] [--skip-chronos]`,
  );
  process.exit(2);
}

function parseArgs(argv: string[]) {
  const slug = argv[2];
  const ticket = argv[3];
  if (!slug || !ticket || slug.startsWith("-") || ticket.startsWith("-")) {
    usage();
  }
  let labels: string[] = [];
  let dryRun = false;
  let skipChronos = false;
  for (let i = 4; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--labels") labels = (argv[++i] ?? "").split(",").map((s) => s.trim());
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--skip-chronos") skipChronos = true;
    else usage();
  }
  if (!labels.length) usage();
  return { slug, ticket, labels, dryRun, skipChronos };
}

async function fetchCommentsJira(ticket: string): Promise<{ body: string }[]> {
  const res = await jiraFetch(
    `/rest/api/3/issue/${encodeURIComponent(ticket)}/comment?maxResults=100`,
  );
  if (!res.ok) throw new Error(`Jira comments ${ticket}: HTTP ${res.status}`);
  const data = (await res.json()) as { comments?: Array<{ body?: unknown }> };
  return (data.comments ?? []).map((c) => ({
    body: jiraAdfToPlainText(c.body),
  }));
}

function fetchCommentsGithub(
  owner: string,
  repo: string,
  ticket: string,
  slug: string,
): { body: string }[] {
  const num = parseGithubIssueNumber(ticket, slug);
  if (num === null) throw new Error(`Invalid GitHub issue: ${ticket}`);
  const raw = execFileSync(
    "gh",
    ["api", `repos/${owner}/${repo}/issues/${num}/comments`],
    { encoding: "utf8" },
  );
  return (JSON.parse(raw) as { body?: string }[]).map((c) => ({
    body: c.body ?? "",
  }));
}

async function postCommentGithub(
  owner: string,
  repo: string,
  ticket: string,
  slug: string,
  body: string,
): Promise<void> {
  const num = parseGithubIssueNumber(ticket, slug);
  if (num === null) throw new Error(`Invalid GitHub issue: ${ticket}`);
  execFileSync(
    "gh",
    ["issue", "comment", String(num), "-R", `${owner}/${repo}`, "--body", body],
    { stdio: "inherit" },
  );
}

async function postCommentJira(ticket: string, body: string): Promise<void> {
  const res = await jiraFetch(
    `/rest/api/3/issue/${encodeURIComponent(ticket)}/comment`,
    {
      method: "POST",
      body: JSON.stringify({ body: plainTextToAdf(body) }),
    },
  );
  if (!res.ok) {
    throw new Error(`Jira comment ${ticket}: HTTP ${res.status}`);
  }
}

const args = parseArgs(process.argv);
loadSecretsEnv(args.slug);

let config;
try {
  config = loadProjectConfig(ROOT, args.slug);
} catch (err) {
  console.error(String(err));
  process.exit(2);
}

const pickupLabel = config.dev_factory.pickup_label ?? "impl-dev";
const tracker = resolveTrackerProvider(config);

let comments: { body: string }[] = [];
try {
  comments =
    tracker === "github_issues"
      ? fetchCommentsGithub(
          config.git.workspace,
          config.git.repo,
          args.ticket,
          args.slug,
        )
      : await fetchCommentsJira(args.ticket);
} catch (err) {
  console.error(String(err));
  process.exit(2);
}

const decision = resolveBootstrapDemux({
  labels: args.labels,
  pickupLabel,
  wbsReady: commentsHaveWbsReady(comments),
  wbsDraftReady: commentsHaveWbsDraftReady(comments),
});

console.log(
  JSON.stringify({
    slug: args.slug,
    ticket: args.ticket,
    ...decision,
    pickupLabel,
    dryRun: args.dryRun,
  }),
);

if (!decision.demux && decision.phase !== "done") {
  console.log("BOOTSTRAP_DEMUX_SKIP — not a project-bootstrap demux ticket");
  process.exit(1);
}

if (decision.phase === "done" && !decision.stripPickup) {
  console.log("BOOTSTRAP_DEMUX_DONE — WBS_READY; nothing to strip");
  process.exit(1);
}

const actions: string[] = [];

if (decision.stripPickup) {
  if (args.dryRun) {
    actions.push(`dry-run strip ${pickupLabel}`);
  } else {
    try {
      if (tracker === "github_issues") {
        stripGithubPickupLabel({
          owner: config.git.workspace,
          repo: config.git.repo,
          ticket: args.ticket,
          slug: args.slug,
          label: pickupLabel,
        });
      } else {
        await stripJiraPickupLabel(args.ticket, pickupLabel);
      }
      actions.push(`stripped ${pickupLabel}`);
    } catch (err) {
      console.error(String(err));
      console.log(
        `BOOTSTRAP_DEMUX_FAIL ${JSON.stringify({ reason: "strip-pickup-failed" })}`,
      );
      process.exit(2);
    }
  }
}

let chronosOk = false;
let chronosDetail = "";

if (decision.demux && !args.skipChronos) {
  if (args.dryRun) {
    actions.push("dry-run ensure_chronos");
    chronosOk = true;
    chronosDetail = "dry-run";
  } else {
    const kick = fireChronosBootstrapKick({
      engineRoot: ROOT,
      slug: args.slug,
      ticketKey: args.ticket,
      config: config as { pm_kick?: { pm_agent_path?: string } },
    });
    if (kick.ok) {
      chronosOk = true;
      chronosDetail = kick.oneshot;
      actions.push(`chronos ${kick.oneshot}`);
      if (kick.stdout.trim()) console.log(kick.stdout.trim());
    } else {
      chronosDetail = kick.reason;
      actions.push(`chronos-fail ${kick.reason}`);
      if (kick.stdout?.trim()) console.log(kick.stdout.trim());
    }
  }
} else if (decision.demux && args.skipChronos) {
  actions.push("skip-chronos");
  chronosOk = true;
  chronosDetail = "skipped-by-flag";
}

const commentBody = [
  "### Hephaestus bootstrap demux",
  "",
  decision.demux
    ? "Parent has **project-bootstrap** — not implementing as a single `impl-dev` MR."
    : "Parent has **WBS_READY** — stripped leftover pickup label only.",
  "",
  decision.stripPickup
    ? `- Removed pickup label \`${pickupLabel}\` so Kairos will not re-arm Hephaestus on this parent.`
    : "- No pickup label to strip.",
  decision.demux
    ? chronosOk
      ? `- Woke **Chronos** (\`pm-bootstrap\`) via ensure_chronos — status: \`${chronosDetail}\`.`
      : `- **Chronos wake failed:** ${chronosDetail}. Re-run: \`bash ../pm-agent/scripts/ensure_chronos.sh ${args.slug} --ticket ${args.ticket}\`.`
    : "- Chronos not kicked (bootstrap already WBS_READY).",
  "",
  "Next: Chronos → Hermes `ba-wbs` → child tickets with `impl-dev` → Hephaestus drain.",
].join("\n");

if (!args.dryRun) {
  try {
    if (tracker === "github_issues") {
      await postCommentGithub(
        config.git.workspace,
        config.git.repo,
        args.ticket,
        args.slug,
        commentBody,
      );
    } else {
      await postCommentJira(args.ticket, commentBody);
    }
    actions.push("comment");
  } catch (err) {
    console.error(`comment failed: ${String(err)}`);
    actions.push("comment-failed");
  }
} else {
  actions.push("dry-run comment");
}

if (decision.demux && !chronosOk) {
  console.log(
    `BOOTSTRAP_DEMUX_PARTIAL ${JSON.stringify({ actions, chronos: chronosDetail })}`,
  );
  process.exit(2);
}

console.log(
  `BOOTSTRAP_DEMUX_OK ${JSON.stringify({ actions, chronos: chronosDetail, demux: decision.demux })}`,
);
process.exit(0);
