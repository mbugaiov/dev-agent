/**
 * Upsert ### <Seat> started on GitHub Issues/PR comments or Jira.
 * Decision logic lives in agentStartedStack.ts (unit-tested).
 *
 * List failure is fail-closed (skip tracker write) so a transient API error
 * cannot recreate the duplicate-banner flood this helper exists to stop.
 */
import { execFileSync } from "node:child_process";
import { adfToPlainText, jiraFetch, markdownToAdf } from "./jiraClient.ts";
import {
  jiraCommentCountPath,
  jiraNewestCommentsPath,
} from "./jiraCommentList.ts";
import {
  DEFAULT_SESSION_TTL_MS,
  decideAgentStartStack,
  findStackableComment,
  type AgentStartEvent,
} from "./agentStartedStack.ts";

export type AgentStartUpsertResult = {
  action: "create" | "patch" | "skip";
  body: string;
  commentId?: string;
  reason?: string;
};

function sessionTtlMs(): number {
  const v = Number(process.env.AGENT_START_SESSION_TTL_MS);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_SESSION_TTL_MS;
}

function ghJson(args: string[], input?: string): unknown {
  const raw = execFileSync("gh", args, {
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const trimmed = raw.trim();
  return trimmed ? JSON.parse(trimmed) : null;
}

type GhComment = {
  id: number;
  body?: string;
  updated_at?: string;
  created_at?: string;
};

function listGithubComments(
  owner: string,
  repo: string,
  issueNumber: string,
  sinceIso: string,
): GhComment[] {
  const data = ghJson([
    "api",
    "--paginate",
    "-H",
    "Accept: application/vnd.github+json",
    `repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100&since=${sinceIso}`,
  ]);
  return Array.isArray(data) ? (data as GhComment[]) : [];
}

export function upsertGithubAgentStarted(opts: {
  owner: string;
  repo: string;
  issueNumber: string;
  event: AgentStartEvent;
  targetKey: string;
}): AgentStartUpsertResult {
  const ttl = sessionTtlMs();
  const since = new Date(opts.event.at.getTime() - ttl).toISOString();
  let existing: { body: string; updatedAt: Date; id: string } | null = null;
  try {
    const comments = listGithubComments(
      opts.owner,
      opts.repo,
      opts.issueNumber,
      since,
    ).map((c) => ({
      id: String(c.id),
      body: c.body ?? "",
      updatedAt: new Date(c.updated_at ?? c.created_at ?? 0),
    }));
    const hit = findStackableComment(
      comments,
      opts.event.seat,
      opts.targetKey,
      opts.event.at,
      ttl,
    );
    if (hit) existing = hit;
  } catch (e) {
    console.error(
      "AGENT_START_WARN list comments failed — skip tracker write:",
      e instanceof Error ? e.message : e,
    );
    return {
      action: "skip",
      body: "",
      reason: "list failed",
    };
  }

  return applyGithubDecision(opts, existing, ttl);
}

function applyGithubDecision(
  opts: {
    owner: string;
    repo: string;
    issueNumber: string;
    event: AgentStartEvent;
    targetKey: string;
  },
  existing: { body: string; updatedAt: Date; id: string } | null,
  ttl: number,
): AgentStartUpsertResult {
  const decision = decideAgentStartStack({
    existing,
    event: opts.event,
    targetKey: opts.targetKey,
    now: opts.event.at,
    sessionTtlMs: ttl,
    markerStyle: "html",
  });

  if (decision.action === "skip") {
    return {
      action: "skip",
      body: decision.body,
      commentId: existing?.id,
    };
  }

  if (decision.action === "patch" && existing) {
    const updated = ghJson(
      [
        "api",
        "-X",
        "PATCH",
        "-H",
        "Accept: application/vnd.github+json",
        `repos/${opts.owner}/${opts.repo}/issues/comments/${existing.id}`,
        "--input",
        "-",
      ],
      JSON.stringify({ body: decision.body }),
    ) as { id?: number } | null;
    return {
      action: "patch",
      body: decision.body,
      commentId: String(updated?.id ?? existing.id),
    };
  }

  const created = ghJson(
    [
      "api",
      "-X",
      "POST",
      "-H",
      "Accept: application/vnd.github+json",
      `repos/${opts.owner}/${opts.repo}/issues/${opts.issueNumber}/comments`,
      "--input",
      "-",
    ],
    JSON.stringify({ body: decision.body }),
  ) as { id?: number } | null;
  return {
    action: "create",
    body: decision.body,
    commentId: created?.id != null ? String(created.id) : undefined,
  };
}

type JiraComment = {
  id?: string;
  updated?: string;
  created?: string;
  body?: unknown;
};

type JiraCommentPage = {
  total?: number;
  comments?: JiraComment[];
};

function mapJiraComments(comments: JiraComment[]) {
  return comments.map((c) => ({
    id: String(c.id ?? ""),
    body: adfToPlainText(c.body),
    updatedAt: new Date(c.updated ?? c.created ?? 0),
  }));
}

export async function upsertJiraAgentStarted(opts: {
  issueKey: string;
  event: AgentStartEvent;
  targetKey: string;
}): Promise<AgentStartUpsertResult> {
  const ttl = sessionTtlMs();
  let existing: { body: string; updatedAt: Date; id: string } | null = null;
  try {
    const countRes = await jiraFetch(jiraCommentCountPath(opts.issueKey));
    if (!countRes.ok) {
      console.error(
        "AGENT_START_WARN list Jira comments failed — skip tracker write:",
        countRes.status,
        await countRes.text(),
      );
      return { action: "skip", body: "", reason: "list failed" };
    }
    const countPage = (await countRes.json()) as JiraCommentPage;
    const total = Number(countPage.total ?? 0);
    if (total > 0) {
      const pageRes = await jiraFetch(
        jiraNewestCommentsPath(opts.issueKey, total),
      );
      if (!pageRes.ok) {
        console.error(
          "AGENT_START_WARN list Jira comments failed — skip tracker write:",
          pageRes.status,
          await pageRes.text(),
        );
        return { action: "skip", body: "", reason: "list failed" };
      }
      const page = (await pageRes.json()) as JiraCommentPage;
      const comments = mapJiraComments(page.comments ?? []);
      const hit = findStackableComment(
        comments.filter((c) => c.id),
        opts.event.seat,
        opts.targetKey,
        opts.event.at,
        ttl,
      );
      if (hit) existing = hit;
    }
  } catch (e) {
    console.error(
      "AGENT_START_WARN list Jira comments failed — skip tracker write:",
      e instanceof Error ? e.message : e,
    );
    return { action: "skip", body: "", reason: "list failed" };
  }

  const decision = decideAgentStartStack({
    existing,
    event: opts.event,
    targetKey: opts.targetKey,
    now: opts.event.at,
    sessionTtlMs: ttl,
    markerStyle: "code",
  });

  if (decision.action === "skip") {
    return {
      action: "skip",
      body: decision.body,
      commentId: existing?.id,
    };
  }

  const adf = JSON.stringify({ body: markdownToAdf(decision.body) });

  if (decision.action === "patch" && existing) {
    const putRes = await jiraFetch(
      `/rest/api/3/issue/${opts.issueKey}/comment/${existing.id}`,
      { method: "PUT", body: adf },
    );
    if (!putRes.ok) {
      throw new Error(
        `Jira comment PATCH failed: ${putRes.status} ${await putRes.text()}`,
      );
    }
    return { action: "patch", body: decision.body, commentId: existing.id };
  }

  const postRes = await jiraFetch(
    `/rest/api/3/issue/${opts.issueKey}/comment`,
    { method: "POST", body: adf },
  );
  if (!postRes.ok) {
    throw new Error(
      `Jira comment POST failed: ${postRes.status} ${await postRes.text()}`,
    );
  }
  const created = (await postRes.json()) as { id?: string };
  return {
    action: "create",
    body: decision.body,
    commentId: created.id,
  };
}
