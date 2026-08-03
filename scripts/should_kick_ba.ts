#!/usr/bin/env npx tsx
/**
 * Exit 0 if Hephaestus should wake Hermes BA; 1 if skip; 2 on usage error.
 *
 * Usage:
 *   npx tsx scripts/should_kick_ba.ts <slug> [--labels a,b] [--spec-ready] [--ticket KEY]
 *
 * ba-spec-first + !BA_SPEC_READY → kick. No human approval wait.
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
  resolveBaFactoryPhase,
  commentsHaveBaSpecReady,
} from "../lib/baSubagentKick.ts";

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
      "Usage: should_kick_ba.ts <slug> [--labels a,b] [--spec-ready] [--ticket KEY]",
    );
    process.exit(2);
  }
  let labels: string[] = [];
  let specReady = false;
  let ticket: string | undefined;
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--labels") labels = (argv[++i] ?? "").split(",").map((s) => s.trim());
    else if (a === "--spec-ready") specReady = true;
    else if (a === "--ticket") ticket = argv[++i];
  }
  return { slug, labels, specReady, ticket };
}

async function fetchSpecReadyJira(ticket: string): Promise<boolean> {
  const res = await jiraFetch(
    `/rest/api/3/issue/${encodeURIComponent(ticket)}/comment?maxResults=100`,
  );
  if (!res.ok) throw new Error(`Jira comments ${ticket}: HTTP ${res.status}`);
  const data = (await res.json()) as { comments?: Array<{ body?: unknown }> };
  const comments = (data.comments ?? []).map((c) => ({
    body: jiraAdfToPlainText(c.body),
  }));
  return commentsHaveBaSpecReady(comments);
}

function fetchSpecReadyGithub(
  owner: string,
  repo: string,
  ticket: string,
  slug: string,
): boolean {
  const num = parseGithubIssueNumber(ticket, slug);
  if (num === null) {
    throw new Error(`Invalid GitHub issue key for BA check: ${ticket}`);
  }
  const raw = execFileSync(
    "gh",
    ["api", `repos/${owner}/${repo}/issues/${num}/comments`],
    { encoding: "utf8" },
  );
  const arr = JSON.parse(raw) as { body?: string }[];
  return commentsHaveBaSpecReady(arr.map((c) => ({ body: c.body ?? "" })));
}

const { slug, labels, specReady: flagReady, ticket } = parseArgs(process.argv);
loadSecretsEnv(slug);

let config;
try {
  config = loadProjectConfig(ROOT, slug);
} catch (err) {
  console.error(String(err));
  process.exit(2);
}

let ready = flagReady;
if (ticket && !flagReady) {
  try {
    const tracker = resolveTrackerProvider(config);
    if (tracker === "github_issues") {
      ready = fetchSpecReadyGithub(
        config.git.workspace,
        config.git.repo,
        ticket,
        slug,
      );
    } else {
      ready = await fetchSpecReadyJira(ticket);
    }
  } catch (err) {
    console.error(String(err));
    process.exit(2);
  }
}

const result = resolveBaFactoryPhase({ labels, specReady: ready });
console.log(
  JSON.stringify({
    slug,
    phase: result.phase,
    kick: result.kick,
    reasons: result.reasons,
    specReady: ready,
    labels,
  }),
);

if (result.kick) {
  console.log(
    "BA_KICK_YES — wake Hermes (ba-agent ba-loop). Block implement until BA_SPEC_READY. " +
      "No human approval — lint + skeptical review is the gate.",
  );
} else if (result.reasons.includes("spec:ready")) {
  console.log(
    "BA_KICK_NO — ba-spec-first satisfied (BA_SPEC_READY); proceed to OpenSpec / UX / implement",
  );
} else {
  console.log("BA_KICK_NO — skip BA subagent");
}

process.exit(result.kick ? 0 : 1);
