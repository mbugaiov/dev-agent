/**
 * Dev factory tick — query Jira and emit BACKLOG_WAKE_EXECUTE or DEV_FACTORY_IDLE.
 * Usage: npx tsx scripts/dev_factory_tick.ts <slug>
 */
import {
  buildBacklogWakePayload,
  devFactoryShouldWake,
  formatDevFactoryIdleLine,
  formatJiraUnavailableTick,
  type DevFactoryIssue,
} from "../lib/devFactoryLoop.ts";
import {
  jiraAdfToPlainText,
  planBacklogWithFollowOns,
  type JiraCommentLike,
} from "../lib/jiraCommentGate.ts";
import {
  buildPendingExecuteState,
  formatBacklogWakeExecuteLine,
  PENDING_EXECUTE_PATH,
} from "../lib/devFactoryExecution.ts";
import { assertValidTickLine } from "../lib/devFactoryExecutionOnly.ts";
import { devFactoryJql } from "../lib/devFactoryLoop.ts";
import { loadProjectConfig, resolveAppRoot } from "../lib/loadProject.ts";
import {
  filterExcludedIssueNumbers,
  githubIssuesSearchUrl,
  mapGithubSearchItem,
  type GithubIssueLike,
} from "../lib/githubIssuesBacklog.ts";
import { resolveTrackerProvider } from "../lib/projectConfig.ts";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv[2] ?? process.env.DEV_AGENT_SLUG ?? "";

if (!slug) {
  console.error("Usage: dev_factory_tick.ts <slug>");
  process.exit(1);
}

const config = loadProjectConfig(ROOT, slug);

async function readPendingExecute() {
  const path = join(ROOT, PENDING_EXECUTE_PATH);
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as ReturnType<typeof buildPendingExecuteState>;
  } catch {
    return null;
  }
}

async function writePendingExecute(
  payload: ReturnType<typeof buildBacklogWakePayload>,
) {
  const existing = await readPendingExecute();
  const state = buildPendingExecuteState(payload, config.git.branch_prefixes);
  if (
    existing?.consumed &&
    existing.oldest === payload.oldest &&
    payload.oldest === state.oldest
  ) {
    return;
  }
  const path = join(ROOT, PENDING_EXECUTE_PATH);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2) + "\n", "utf8");
}

async function clearPendingExecute() {
  const path = join(ROOT, PENDING_EXECUTE_PATH);
  try {
    await unlink(path);
  } catch {
    /* no pending file */
  }
}

function jiraAuth(): { base: string; email: string; token: string } {
  const base = process.env.JIRA_BASE_URL ?? "";
  const email = process.env.JIRA_EMAIL ?? process.env.BITBUCKET_USERNAME ?? "";
  const token = process.env.JIRA_API_TOKEN ?? process.env.ATLASSIAN_TOKEN ?? "";
  if (!base || !email || !token) {
    throw new Error(
      "JIRA_BASE_URL + JIRA_EMAIL + JIRA_API_TOKEN required in project .secrets/jira.env",
    );
  }
  return { base, email, token };
}

async function jiraFetch(path: string): Promise<Response> {
  const { base, email, token } = jiraAuth();
  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  return fetch(`${base}${path}`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
}

async function fetchDevFactoryIssues(): Promise<DevFactoryIssue[]> {
  const { base } = jiraAuth();
  const jql = devFactoryJql(config);
  const url = new URL(`${base}/rest/api/3/search/jql`);
  url.searchParams.set("jql", jql);
  url.searchParams.set("fields", "summary,status");
  url.searchParams.set("maxResults", "10");

  const res = await jiraFetch(`${url.pathname}${url.search}`);
  if (!res.ok) {
    throw new Error(`Jira search failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as {
    issues?: {
      key: string;
      fields: { summary: string; status: { name: string } };
    }[];
  };

  return (data.issues ?? []).map((i) => ({
    key: i.key,
    summary: i.fields.summary,
    status: i.fields.status.name,
  }));
}

function githubToken(): string {
  return (
    process.env.GITHUB_TOKEN?.trim() ||
    process.env.GH_TOKEN?.trim() ||
    ""
  );
}

async function fetchGithubDevFactoryIssues(): Promise<DevFactoryIssue[]> {
  const owner = config.git.workspace;
  const repo = config.git.repo;
  const searchUrl = githubIssuesSearchUrl({
    owner,
    repo,
    pickupLabel: config.dev_factory.pickup_label,
    excludedLabels: config.dev_factory.excluded_labels,
  });

  const token = githubToken();
  let items: {
    number: number;
    title: string;
    state: string;
    labels?: { name: string }[];
  }[] = [];

  if (token) {
    const res = await fetch(searchUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) {
      throw new Error(`GitHub search failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { items?: typeof items };
    items = data.items ?? [];
  } else {
    // Prefer authenticated `gh` CLI (local agent sessions).
    const labelArgs = [
      "issue",
      "list",
      "-R",
      `${owner}/${repo}`,
      "--state",
      "open",
      "--label",
      config.dev_factory.pickup_label,
      "--json",
      "number,title,state,labels",
      "--limit",
      "20",
    ];
    const raw = execFileSync("gh", labelArgs, { encoding: "utf8" });
    const listed = JSON.parse(raw) as {
      number: number;
      title: string;
      state: string;
      labels: { name: string }[];
    }[];
    const excluded = new Set(config.dev_factory.excluded_labels);
    items = listed
      .filter((i) => i.state.toLowerCase() === "open")
      .filter((i) => !i.labels.some((l) => excluded.has(l.name)))
      .map((i) => ({
        number: i.number,
        title: i.title,
        state: i.state.toLowerCase(),
        labels: i.labels,
      }));
  }

  const mapped: GithubIssueLike[] = items.map((i) =>
    mapGithubSearchItem(i, config.slug),
  );
  const excludedNums = (config.dev_factory.excluded_issue_keys ?? [])
    .map((k) => {
      const m = String(k).match(/(\d+)$/);
      return m ? Number(m[1]) : NaN;
    })
    .filter((n) => Number.isFinite(n));
  return filterExcludedIssueNumbers(mapped, excludedNums).map((i) => ({
    key: i.key,
    summary: i.summary,
    status: i.status,
  }));
}

async function fetchGithubIssueComments(
  issueNumber: number,
): Promise<JiraCommentLike[]> {
  const owner = config.git.workspace;
  const repo = config.git.repo;
  const raw = execFileSync(
    "gh",
    ["api", `repos/${owner}/${repo}/issues/${issueNumber}/comments`],
    { encoding: "utf8" },
  );
  try {
    const arr = JSON.parse(raw) as { created_at: string; body: string }[];
    return arr.map((c) => ({ created: c.created_at, body: c.body ?? "" }));
  } catch {
    return [];
  }
}

async function fetchIssueComments(key: string): Promise<JiraCommentLike[]> {
  const res = await jiraFetch(`/rest/api/3/issue/${key}?fields=comment`);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    fields: {
      comment?: {
        comments?: { created: string; body: unknown }[];
      };
    };
  };
  return (data.fields.comment?.comments ?? []).map((c) => ({
    created: c.created,
    body: jiraAdfToPlainText(c.body),
  }));
}

function emitTickLine(line: string) {
  assertValidTickLine(line);
  console.log(line);
}

function fallbackTick() {
  emitTickLine(formatJiraUnavailableTick(config));
}

function formatNextWakeFromEnv(): string | undefined {
  const raw = process.env.DEV_FACTORY_NEXT_WAKE_EPOCH?.trim();
  if (!raw) return undefined;
  const epoch = Number(raw);
  if (!Number.isFinite(epoch) || epoch <= 0) return undefined;
  return new Date(epoch * 1000).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

async function notifyTick(
  input:
    | {
        kind: "wake";
        payload: ReturnType<typeof buildBacklogWakePayload>;
      }
    | { kind: "idle" },
) {
  const {
    formatTickNotifyFailure,
    postDevFactoryTickNotify,
    shouldReportTickNotifyOutcome,
  } = await import("../lib/devFactoryTickNotify.ts");
  const nextWakeUtc = formatNextWakeFromEnv();

  const notifyInput =
    input.kind === "wake"
      ? {
          slug: config.slug,
          kind: "wake" as const,
          count: input.payload.count,
          pickKey: input.payload.oldest,
          pickSummary:
            input.payload.issues.find((i) => i.key === input.payload.oldest)
              ?.summary ?? input.payload.oldest,
          issues: input.payload.issues.map((i) => ({
            key: i.key,
            summary: i.summary,
          })),
          nextWakeUtc,
        }
      : { slug: config.slug, kind: "idle" as const, nextWakeUtc };

  let outcome: Awaited<ReturnType<typeof postDevFactoryTickNotify>>;
  try {
    outcome = await postDevFactoryTickNotify(notifyInput);
  } catch (err) {
    outcome = {
      delivered: false,
      reason: "exception",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  // Unconfigured webhook stays quiet; real delivery failures are always reported.
  if (shouldReportTickNotifyOutcome(outcome)) {
    console.error(formatTickNotifyFailure(config.slug, notifyInput.kind, outcome));
  }
}

async function main() {
  const tracker = resolveTrackerProvider(config);
  if (config.dev_factory.enabled === false) {
    await clearPendingExecute();
    emitTickLine(formatDevFactoryIdleLine(config, 0));
    await notifyTick({ kind: "idle" });
    return;
  }

  try {
    const issues =
      tracker === "github_issues"
        ? await fetchGithubDevFactoryIssues()
        : await fetchDevFactoryIssues();

    if (devFactoryShouldWake(issues.length)) {
      const commentsByKey: Record<string, JiraCommentLike[]> = {};
      await Promise.all(
        issues.map(async (issue) => {
          if (tracker === "github_issues") {
            const num = Number(issue.key.split("#").pop());
            commentsByKey[issue.key] = Number.isFinite(num)
              ? await fetchGithubIssueComments(num)
              : [];
          } else {
            commentsByKey[issue.key] = await fetchIssueComments(issue.key);
          }
        }),
      );
      const plan = planBacklogWithFollowOns(
        issues,
        commentsByKey,
        config.git.ticket_key_pattern,
      );
      const payload = buildBacklogWakePayload(config, plan.orderedIssues, {
        pickKey: plan.pickKey,
        blockedByFollowOn: plan.blockedByFollowOn,
      });
      await writePendingExecute(payload);
      emitTickLine(
        formatBacklogWakeExecuteLine(payload, config.git.branch_prefixes),
      );
      await notifyTick({ kind: "wake", payload });
      // Touch app root so resolve stays warm (github path)
      try {
        resolveAppRoot(ROOT, config);
      } catch {
        /* ignore */
      }
      process.exit(0);
    }
    await clearPendingExecute();
    emitTickLine(formatDevFactoryIdleLine(config, 0));
    await notifyTick({ kind: "idle" });
  } catch (err) {
    console.error("dev_factory_tick:", err);
    fallbackTick();
    process.exit(0);
  }
}

main();
