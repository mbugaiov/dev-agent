// Jira comment gates — respect QA agent returns before Validate/Testing.

export type JiraCommentLike = {
  created: string;
  body: string;
  author?: string;
};

export function jiraAdfToPlainText(body: unknown): string {
  if (typeof body === "string") return body;
  if (!body || typeof body !== "object") return "";
  const doc = body as { content?: unknown[] };
  const lines: string[] = [];
  for (const block of doc.content ?? []) {
    if (!block || typeof block !== "object") continue;
    const b = block as { type?: string; content?: unknown[] };
    if (b.type === "paragraph" || b.type === "heading") {
      let line = "";
      for (const item of b.content ?? []) {
        if (item && typeof item === "object" && "text" in item) {
          line += String((item as { text?: string }).text ?? "");
        }
      }
      lines.push(line);
    }
  }
  return lines.join("\n").trim();
}

export function qaReturnedToDev(commentText: string): boolean {
  if (isDevHandoffComment(commentText)) return false;
  const trimmed = commentText.trim();
  if (/^qa\s*return\s*\(/i.test(trimmed)) return true;
  const t = trimmed.toLowerCase();
  return (
    (/blocked/.test(t) && /cannot stay in validate\/testing/.test(t)) ||
    /^returned?\s+to\s+dev\b/i.test(trimmed)
  );
}

export function isDevHandoffComment(commentText: string): boolean {
  return (
    /what was implemented:/i.test(commentText) &&
    /merged pr:/i.test(commentText) &&
    /pipeline build:/i.test(commentText)
  );
}

function sortByCreated(comments: JiraCommentLike[]): JiraCommentLike[] {
  return [...comments].sort((a, b) => a.created.localeCompare(b.created));
}

export function latestCommentBody(comments: JiraCommentLike[]): string {
  const sorted = sortByCreated(comments);
  return sorted[sorted.length - 1]?.body ?? "";
}

export function qaReturnBlocksValidateTesting(comments: JiraCommentLike[]): {
  blocked: boolean;
  reason?: string;
  latestReturnBody?: string;
} {
  const sorted = sortByCreated(comments);
  let lastHandoffAt = "";
  let lastReturnAt = "";
  let lastReturnBody = "";

  for (const c of sorted) {
    if (isDevHandoffComment(c.body)) lastHandoffAt = c.created;
    if (qaReturnedToDev(c.body)) {
      lastReturnAt = c.created;
      lastReturnBody = c.body;
    }
  }

  if (lastReturnAt && (!lastHandoffAt || lastReturnAt > lastHandoffAt)) {
    return {
      blocked: true,
      reason:
        "QA RETURN is newer than the last dev handoff — fix dev-owned blockers, merge, then hand off.",
      latestReturnBody: lastReturnBody,
    };
  }

  const latest = sorted[sorted.length - 1];
  if (
    latest &&
    !isDevHandoffComment(latest.body) &&
    qaReturnedToDev(latest.body)
  ) {
    return {
      blocked: true,
      reason:
        "Latest Jira comment is a QA RETURN — read qa-agent notes before Validate/Testing.",
      latestReturnBody: latest.body,
    };
  }

  return { blocked: false };
}

/** ticketKeyPattern e.g. "TST-\\d+" */
export function extractDevFollowOnTicketKeys(
  commentText: string,
  ticketKeyPattern: string,
): string[] {
  const key = ticketKeyPattern.replace(/^\^/, "").replace(/\$$/, "");
  const keys = new Set<string>();
  const patterns = [
    new RegExp(`dev\\s*ticket:\\s*(${key})`, "gi"),
    new RegExp(`follow-on:\\s*(${key})`, "gi"),
    new RegExp(`fix\\s+in\\s+(${key})`, "gi"),
  ];
  for (const re of patterns) {
    for (const m of commentText.matchAll(re)) {
      if (m[1]) keys.add(m[1].toUpperCase());
    }
  }
  return [...keys];
}

export type FollowOnBacklogPlan = {
  pickKey: string;
  blockedByFollowOn: Record<string, string>;
  orderedIssues: { key: string; summary: string; status: string }[];
};

export function planBacklogWithFollowOns(
  issues: { key: string; summary: string; status: string }[],
  commentsByKey: Record<string, JiraCommentLike[]>,
  ticketKeyPattern: string,
): FollowOnBacklogPlan {
  const keys = new Set(issues.map((i) => i.key));
  const blockedByFollowOn: Record<string, string> = {};
  const followOnPriority: string[] = [];

  for (const issue of issues) {
    const comments = commentsByKey[issue.key] ?? [];
    for (const c of comments) {
      if (!qaReturnedToDev(c.body)) continue;
      for (const followKey of extractDevFollowOnTicketKeys(
        c.body,
        ticketKeyPattern,
      )) {
        if (!keys.has(followKey) || followKey === issue.key) continue;
        blockedByFollowOn[issue.key] = followKey;
        if (!followOnPriority.includes(followKey)) {
          followOnPriority.push(followKey);
        }
      }
    }
  }

  const ordered: typeof issues = [];
  for (const key of followOnPriority) {
    const issue = issues.find((i) => i.key === key);
    if (issue) ordered.push(issue);
  }
  for (const issue of issues) {
    if (blockedByFollowOn[issue.key]) continue;
    if (ordered.some((o) => o.key === issue.key)) continue;
    ordered.push(issue);
  }
  for (const issue of issues) {
    if (!blockedByFollowOn[issue.key]) continue;
    if (ordered.some((o) => o.key === issue.key)) continue;
    ordered.push(issue);
  }

  const pickKey = ordered[0]?.key ?? issues[0]?.key ?? "";
  return { pickKey, blockedByFollowOn, orderedIssues: ordered };
}

export function mayTransitionAfterHandoffPost(
  comments: JiraCommentLike[],
): boolean {
  const sorted = sortByCreated(comments);
  const latest = sorted[sorted.length - 1];
  if (!latest) return true;
  return isDevHandoffComment(latest.body);
}
