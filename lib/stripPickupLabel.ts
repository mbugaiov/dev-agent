/** Strip factory pickup label (impl-dev) from GitHub Issues or Jira. Pure helpers + I/O wrappers. */

import { execFileSync } from "node:child_process";
import { jiraFetch } from "./jiraClient.ts";
import { parseGithubIssueNumber } from "./githubIssuesBacklog.ts";

export function buildJiraLabelRemoveBody(label: string): {
  update: { labels: Array<{ remove: string }> };
} {
  return { update: { labels: [{ remove: label }] } };
}

export async function stripJiraPickupLabel(
  issueKey: string,
  label: string,
): Promise<void> {
  const res = await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
    method: "PUT",
    body: JSON.stringify(buildJiraLabelRemoveBody(label)),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Jira remove label ${label} on ${issueKey}: HTTP ${res.status} ${text.slice(0, 200)}`,
    );
  }
}

export function stripGithubPickupLabel(input: {
  owner: string;
  repo: string;
  ticket: string;
  slug: string;
  label: string;
}): void {
  const num = parseGithubIssueNumber(input.ticket, input.slug);
  if (num === null) {
    throw new Error(`Invalid GitHub issue for strip pickup: ${input.ticket}`);
  }
  execFileSync(
    "gh",
    [
      "issue",
      "edit",
      String(num),
      "-R",
      `${input.owner}/${input.repo}`,
      "--remove-label",
      input.label,
    ],
    { stdio: "inherit" },
  );
}
