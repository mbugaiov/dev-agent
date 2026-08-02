/**
 * GitHub Issues backlog for factories that do not use Jira.
 * Mirrors Jira pickup labels: impl-dev, exclude human-required / factory-pause / etc.
 */

export type GithubIssueLike = {
  key: string; // e.g. "my-app#12"
  number: number;
  summary: string;
  status: string; // "open" | "closed"
  labels: string[];
};

export type GithubBacklogQuery = {
  owner: string;
  repo: string;
  pickupLabel: string;
  excludedLabels: readonly string[];
  excludedIssueNumbers?: readonly number[];
};

/** Build REST search URL for open issues with pickup label. */
export function githubIssuesSearchUrl(q: GithubBacklogQuery): string {
  const parts = [
    `repo:${q.owner}/${q.repo}`,
    "is:issue",
    "is:open",
    `label:${q.pickupLabel}`,
  ];
  for (const lab of q.excludedLabels) {
    parts.push(`-label:${lab}`);
  }
  const query = parts.join(" ");
  return `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&sort=created&order=asc&per_page=10`;
}

export function mapGithubSearchItem(
  item: {
    number: number;
    title: string;
    state: string;
    labels?: { name: string }[];
  },
  repoSlug: string,
): GithubIssueLike {
  return {
    key: `${repoSlug}#${item.number}`,
    number: item.number,
    summary: item.title,
    status: item.state,
    labels: (item.labels ?? []).map((l) => l.name),
  };
}

export function filterExcludedIssueNumbers(
  issues: GithubIssueLike[],
  excluded: readonly number[],
): GithubIssueLike[] {
  if (!excluded.length) return issues;
  const ban = new Set(excluded);
  return issues.filter((i) => !ban.has(i.number));
}

/** Parse "owner/repo#12" or "repo#12" or "#12" → number. */
export function parseGithubIssueNumber(
  key: string,
  fallbackRepo?: string,
): number | null {
  const m = key.match(/(?:^|\/|#)(\d+)$/);
  if (m) return Number(m[1]);
  if (fallbackRepo && key.startsWith(fallbackRepo)) {
    const n = key.split("#")[1];
    return n ? Number(n) : null;
  }
  return null;
}

export function commentsHaveUxCharterReady(
  comments: { body?: string | null }[],
): boolean {
  return comments.some((c) => (c.body ?? "").includes("UX_CHARTER_READY"));
}
