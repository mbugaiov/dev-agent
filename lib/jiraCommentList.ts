/** Recency window for Jira issue comments (oldest-first, default page 50). */

export const JIRA_COMMENT_PAGE_SIZE = 50;

export function jiraNewestCommentsWindow(
  total: number,
  pageSize = JIRA_COMMENT_PAGE_SIZE,
): { startAt: number; maxResults: number } {
  const maxResults = Math.max(1, pageSize);
  const startAt = Math.max(0, Math.max(0, total) - maxResults);
  return { startAt, maxResults };
}

/** Cheap total probe — Jira ignores order; we only need `total`. */
export function jiraCommentCountPath(issueKey: string): string {
  return `/rest/api/3/issue/${issueKey}/comment?startAt=0&maxResults=1`;
}

/** Last page of comments (newest when the API is oldest-first). */
export function jiraNewestCommentsPath(
  issueKey: string,
  total: number,
  pageSize = JIRA_COMMENT_PAGE_SIZE,
): string {
  const { startAt, maxResults } = jiraNewestCommentsWindow(total, pageSize);
  return `/rest/api/3/issue/${issueKey}/comment?startAt=${startAt}&maxResults=${maxResults}`;
}
