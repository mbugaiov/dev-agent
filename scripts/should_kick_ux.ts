#!/usr/bin/env npx tsx
/**
 * Exit 0 if Hephaestus should wake Athena UX subagent; 1 if skip; 2 on usage error.
 *
 * Usage:
 *   npx tsx scripts/should_kick_ux.ts <slug> [--labels a,b] [--surfaces "a,b"] [--diff]
 *     [--when before-implement|after-implement] [--charter-ready] [--ticket KEY]
 *
 * before-implement + label ux-charter-first:
 *   kicks Mode B charter unless Jira has UX_CHARTER_READY (--charter-ready or --ticket fetch).
 * after-implement (default): Mode A polish when needs-ux-pass / impl-ux / UI surfaces/diff.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectConfig, resolveAppRoot } from "../lib/loadProject.ts";
import { jiraFetch } from "../lib/jiraClient.ts";
import { jiraAdfToPlainText } from "../lib/jiraCommentGate.ts";
import { parseGithubIssueNumber } from "../lib/githubIssuesBacklog.ts";
import { resolveTrackerProvider } from "../lib/projectConfig.ts";
import {
  resolveUxFactoryPhase,
  commentsHaveUxCharterReady,
  DEFAULT_UI_PATH_GLOBS,
  type UxKickWhen,
} from "../lib/uxSubagentKick.ts";

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
      "Usage: should_kick_ux.ts <slug> [--labels a,b] [--surfaces path,path] [--diff] " +
        "[--when before-implement|after-implement] [--charter-ready] [--ticket KEY]",
    );
    process.exit(2);
  }
  let labels: string[] = [];
  let surfaces: string[] = [];
  let useDiff = false;
  let when: UxKickWhen = "after-implement";
  let charterReady = false;
  let ticket = "";
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--labels" && argv[i + 1]) {
      labels = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    } else if (a === "--surfaces" && argv[i + 1]) {
      surfaces = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    } else if (a === "--diff") {
      useDiff = true;
    } else if (a === "--when" && argv[i + 1]) {
      const w = argv[++i];
      if (w !== "before-implement" && w !== "after-implement") {
        console.error(`Invalid --when ${w}`);
        process.exit(2);
      }
      when = w;
    } else if (a === "--charter-ready") {
      charterReady = true;
    } else if (a === "--ticket" && argv[i + 1]) {
      ticket = argv[++i];
    }
  }
  return { slug, labels, surfaces, useDiff, when, charterReady, ticket };
}

function diffPaths(repoPath: string, defaultBranch: string): string[] {
  try {
    const out = execFileSync(
      "git",
      ["diff", "--name-only", `origin/${defaultBranch}...HEAD`],
      { cwd: repoPath, encoding: "utf8" },
    );
    return out.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchCharterReadyJira(ticket: string): Promise<boolean> {
  const res = await jiraFetch(
    `/rest/api/3/issue/${encodeURIComponent(ticket)}/comment?maxResults=100`,
  );
  if (!res.ok) {
    throw new Error(`Jira comments ${ticket}: HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    comments?: Array<{ body?: unknown }>;
  };
  const comments = (data.comments ?? []).map((c) => ({
    body: jiraAdfToPlainText(c.body),
  }));
  return commentsHaveUxCharterReady(comments);
}

function fetchCharterReadyGithub(
  owner: string,
  repo: string,
  ticket: string,
  slug: string,
): boolean {
  const num = parseGithubIssueNumber(ticket, slug);
  if (num === null) {
    throw new Error(`Invalid GitHub issue key for charter check: ${ticket}`);
  }
  const raw = execFileSync(
    "gh",
    ["api", `repos/${owner}/${repo}/issues/${num}/comments`],
    { encoding: "utf8" },
  );
  const arr = JSON.parse(raw) as { body?: string }[];
  const comments = arr.map((c) => ({ body: c.body ?? "" }));
  return commentsHaveUxCharterReady(comments);
}

type UxKickYaml = {
  ui_path_globs?: string[];
};

const { slug, labels, surfaces, useDiff, when, charterReady, ticket } =
  parseArgs(process.argv);

loadSecretsEnv(slug);

let config;
try {
  config = loadProjectConfig(ROOT, slug);
} catch (err) {
  console.error(String(err));
  process.exit(2);
}
const repoPath = resolveAppRoot(ROOT, config);
const defaultBranch = config.git.default_branch;
const uxKick = (config as { ux_kick?: UxKickYaml }).ux_kick;
const uiGlobs =
  uxKick?.ui_path_globs?.length ? uxKick.ui_path_globs : [...DEFAULT_UI_PATH_GLOBS];
const diffs = useDiff ? diffPaths(repoPath, defaultBranch) : [];

let ready = charterReady;
if (when === "before-implement" && ticket && !charterReady) {
  try {
    const tracker = resolveTrackerProvider(config);
    if (tracker === "github_issues") {
      ready = fetchCharterReadyGithub(
        config.git.workspace,
        config.git.repo,
        ticket,
        slug,
      );
    } else {
      ready = await fetchCharterReadyJira(ticket);
    }
  } catch (err) {
    console.error(String(err));
    process.exit(2);
  }
}

const result = resolveUxFactoryPhase({
  labels,
  surfaces,
  diffPaths: diffs,
  uiPathGlobs: uiGlobs,
  when,
  charterReady: ready,
});

const payload = {
  slug,
  when,
  phase: result.phase,
  kick: result.kick,
  mode: result.mode,
  reasons: result.reasons,
  charterReady: ready,
  labels,
  surfaces,
  diffHits: diffs.filter((d) =>
    result.reasons.some((r) => r === `diff:${d}` || r.startsWith("diff:")),
  ),
};
console.log(JSON.stringify(payload));

if (result.phase === "charter" && result.kick) {
  console.log(
    "UX_KICK_YES — wake Athena Mode B CHARTER on current feature branch " +
      "(skill dev-ux-subagent; notify --mode charter). Do not implement UI until UX_CHARTER_READY.",
  );
} else if (result.phase === "polish" && result.kick) {
  console.log(
    "UX_KICK_YES — wake Athena Mode A polish on current feature branch (skill dev-ux-subagent)",
  );
} else if (
  when === "before-implement" &&
  result.reasons.includes("charter:ready")
) {
  console.log(
    "UX_KICK_NO — ux-charter-first satisfied (UX_CHARTER_READY); proceed to implement",
  );
} else {
  console.log("UX_KICK_NO — skip UX subagent");
}

process.exit(result.kick ? 0 : 1);
