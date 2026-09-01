/**
 * Bitbucket Cloud REST helpers for Hephaestus factories (git.provider: bitbucket).
 * Auth: BITBUCKET_USERNAME + BITBUCKET_TOKEN (write scope needed for PR comment upsert).
 */
export type BitbucketAuth = {
  username: string;
  token: string;
};

export function bitbucketAuthFromEnv(): BitbucketAuth {
  const username = (process.env.BITBUCKET_USERNAME ?? "").trim();
  const token = (process.env.BITBUCKET_TOKEN ?? "").trim();
  if (!username || !token) {
    throw new Error("BITBUCKET_USERNAME and BITBUCKET_TOKEN required");
  }
  return { username, token };
}

export function bitbucketAuthHeader(auth: BitbucketAuth): string {
  return `Basic ${Buffer.from(`${auth.username}:${auth.token}`).toString("base64")}`;
}

export async function bitbucketFetch(
  path: string,
  init: RequestInit = {},
  auth = bitbucketAuthFromEnv(),
): Promise<Response> {
  const url = path.startsWith("http")
    ? path
    : `https://api.bitbucket.org/2.0${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init.headers);
  headers.set("Authorization", bitbucketAuthHeader(auth));
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(url, { ...init, headers });
}

export function bitbucketPrCommentsPath(
  workspace: string,
  repo: string,
  prId: string | number,
): string {
  return `/repositories/${workspace}/${repo}/pullrequests/${prId}/comments`;
}

export function bitbucketPrCommentPath(
  workspace: string,
  repo: string,
  prId: string | number,
  commentId: string | number,
): string {
  return `${bitbucketPrCommentsPath(workspace, repo, prId)}/${commentId}`;
}
