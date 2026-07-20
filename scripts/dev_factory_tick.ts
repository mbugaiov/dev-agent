/**
 * Dev factory tick — query Jira and emit BACKLOG_WAKE or DEV_FACTORY_IDLE.
 * Usage: npx tsx scripts/dev_factory_tick.ts <slug>
 */
import {
  buildBacklogWakePayload,
  devFactoryShouldWake,
  formatBacklogWakeLine,
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
import { devFactoryJql } from "../lib/devFactoryLoop.ts";
import { loadProjectConfig } from "../lib/loadProject.ts";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

function fallbackTick() {
  console.log(formatJiraUnavailableTick(config));
}

async function main() {
  try {
    const issues = await fetchDevFactoryIssues();
    if (devFactoryShouldWake(issues.length)) {
      const commentsByKey: Record<string, JiraCommentLike[]> = {};
      await Promise.all(
        issues.map(async (issue) => {
          commentsByKey[issue.key] = await fetchIssueComments(issue.key);
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
      console.log(formatBacklogWakeLine(payload));
      console.log(
        formatBacklogWakeExecuteLine(payload, config.git.branch_prefixes),
      );
      process.exit(0);
    }
    await clearPendingExecute();
    console.log(formatDevFactoryIdleLine(config, 0));
  } catch (err) {
    console.error("dev_factory_tick:", err);
    fallbackTick();
    process.exit(0);
  }
}

main();
