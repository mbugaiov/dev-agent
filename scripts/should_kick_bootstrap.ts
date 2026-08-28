#!/usr/bin/env npx tsx
/**
 * Exit 0 if Hephaestus should demux project-bootstrap (wake Chronos, strip pickup);
 * exit 1 if skip; 2 on usage error.
 *
 * Usage:
 *   npx tsx scripts/should_kick_bootstrap.ts <slug> [--labels a,b] [--wbs-ready]
 *     [--wbs-draft-ready] [--ticket KEY] [--pickup-label impl-dev]
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectConfig } from "../lib/loadProject.ts";
import { jiraFetch } from "../lib/jiraClient.ts";
import { jiraAdfToPlainText } from "../lib/jiraCommentGate.ts";
import { parseGithubIssueNumber } from "../lib/githubIssuesBacklog.ts";
import { resolveTrackerProvider } from "../lib/projectConfig.ts";
import {
  commentsHaveWbsDraftReady,
  commentsHaveWbsReady,
  resolveBootstrapDemux,
  resolveBootstrapKickSentinel,
} from "../lib/bootstrapKick.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadSecretsEnv(slug: string): void {
  const p = join(ROOT, "projects", slug, ".secrets", "jira.env");
  if (!existsSync(p)) return;
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

function parseArgs(argv: string[]) {
  const slug = argv[2];
  if (!slug || slug.startsWith("-")) {
    console.error(
      "Usage: should_kick_bootstrap.ts <slug> [--labels a,b] [--wbs-ready] [--wbs-draft-ready] [--ticket KEY] [--pickup-label L]",
    );
    process.exit(2);
  }
  let labels: string[] = [];
  let wbsReady = false;
  let wbsDraftReady = false;
  let ticket: string | undefined;
  let pickupLabel: string | undefined;
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--labels") labels = (argv[++i] ?? "").split(",").map((s) => s.trim());
    else if (a === "--wbs-ready") wbsReady = true;
    else if (a === "--wbs-draft-ready") wbsDraftReady = true;
    else if (a === "--ticket") ticket = argv[++i];
    else if (a === "--pickup-label") pickupLabel = argv[++i];
  }
  return { slug, labels, wbsReady, wbsDraftReady, ticket, pickupLabel };
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
  if (num === null) {
    throw new Error(`Invalid GitHub issue key for bootstrap check: ${ticket}`);
  }
  const raw = execFileSync(
    "gh",
    ["api", `repos/${owner}/${repo}/issues/${num}/comments`],
    { encoding: "utf8" },
  );
  const arr = JSON.parse(raw) as { body?: string }[];
  return arr.map((c) => ({ body: c.body ?? "" }));
}

const {
  slug,
  labels,
  wbsReady: flagReady,
  wbsDraftReady: flagDraft,
  ticket,
  pickupLabel: pickupArg,
} = parseArgs(process.argv);
loadSecretsEnv(slug);

let config;
try {
  config = loadProjectConfig(ROOT, slug);
} catch (err) {
  console.error(String(err));
  process.exit(2);
}

const pickupLabel = pickupArg ?? config.dev_factory.pickup_label ?? "impl-dev";

let wbsReady = flagReady;
let wbsDraftReady = flagDraft;
if (ticket && (!flagReady || !flagDraft)) {
  try {
    const tracker = resolveTrackerProvider(config);
    const comments =
      tracker === "github_issues"
        ? fetchCommentsGithub(
            config.git.workspace,
            config.git.repo,
            ticket,
            slug,
          )
        : await fetchCommentsJira(ticket);
    if (!flagReady) wbsReady = commentsHaveWbsReady(comments);
    if (!flagDraft) wbsDraftReady = commentsHaveWbsDraftReady(comments);
  } catch (err) {
    console.error(String(err));
    process.exit(2);
  }
}

const result = resolveBootstrapDemux({
  labels,
  pickupLabel,
  wbsReady,
  wbsDraftReady,
});

console.log(
  JSON.stringify({
    slug,
    phase: result.phase,
    demux: result.demux,
    stripPickup: result.stripPickup,
    reasons: result.reasons,
    wbsReady,
    wbsDraftReady,
    pickupLabel,
    labels,
  }),
);

const kick = resolveBootstrapKickSentinel(result);
console.log(`${kick.sentinel} — ${kick.detail}`);
process.exit(kick.exitCode);
