// Shared Jira REST helpers — env from projects/<slug>/.secrets/jira.env

export type JiraAuth = { base: string; email: string; token: string };

export function jiraAuthFromEnv(): JiraAuth {
  const base = process.env.JIRA_BASE_URL ?? "";
  const email = process.env.JIRA_EMAIL ?? process.env.BITBUCKET_USERNAME ?? "";
  const token = process.env.JIRA_API_TOKEN ?? process.env.ATLASSIAN_TOKEN ?? "";
  if (!base || !email || !token) {
    throw new Error(
      "JIRA_BASE_URL + JIRA_EMAIL + JIRA_API_TOKEN required (project .secrets/jira.env)",
    );
  }
  return { base: base.replace(/\/$/, ""), email, token };
}

export async function jiraFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const { base, email, token } = jiraAuthFromEnv();
  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export function plainTextToAdf(text: string) {
  return {
    type: "doc",
    version: 1,
    content: text.split("\n").map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : [],
    })),
  };
}

export function validateTestingTransitionId(
  transitions?: { validate_testing?: string },
): string {
  return (
    process.env.JIRA_VALIDATE_TESTING_TRANSITION ??
    transitions?.validate_testing ??
    "51"
  );
}
