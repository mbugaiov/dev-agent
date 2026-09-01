/**
 * List Bitbucket PR comments (paginated) for agent started/progress stacking.
 */
import {
  bitbucketFetch,
  bitbucketPrCommentPath,
  bitbucketPrCommentsPath,
} from "./bitbucketClient.ts";

export type BitbucketPrComment = {
  id: string;
  body: string;
  updatedAt: Date;
};

type BbCommentRow = {
  id?: number;
  created_on?: string;
  updated_on?: string;
  content?: { raw?: string };
};

type BbCommentPage = {
  values?: BbCommentRow[];
  next?: string | null;
};

export function mapBitbucketPrComment(row: BbCommentRow): BitbucketPrComment | null {
  if (row.id == null) return null;
  return {
    id: String(row.id),
    body: row.content?.raw ?? "",
    updatedAt: new Date(row.updated_on ?? row.created_on ?? 0),
  };
}

/** Fetch all PR comments (follow `next`), newest-last order as returned. */
export async function listBitbucketPrComments(
  workspace: string,
  repo: string,
  prId: string | number,
): Promise<BitbucketPrComment[]> {
  const out: BitbucketPrComment[] = [];
  let path: string | null =
    `${bitbucketPrCommentsPath(workspace, repo, prId)}?pagelen=100`;
  while (path) {
    const res = await bitbucketFetch(path);
    if (!res.ok) {
      throw new Error(
        `Bitbucket list comments ${res.status}: ${(await res.text()).slice(0, 200)}`,
      );
    }
    const page = (await res.json()) as BbCommentPage;
    for (const row of page.values ?? []) {
      const mapped = mapBitbucketPrComment(row);
      if (mapped) out.push(mapped);
    }
    path = page.next ?? null;
  }
  return out;
}

export async function createBitbucketPrComment(
  workspace: string,
  repo: string,
  prId: string | number,
  rawMarkdown: string,
): Promise<{ id: string }> {
  const res = await bitbucketFetch(bitbucketPrCommentsPath(workspace, repo, prId), {
    method: "POST",
    body: JSON.stringify({ content: { raw: rawMarkdown } }),
  });
  if (!res.ok) {
    throw new Error(
      `Bitbucket create comment ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  }
  const row = (await res.json()) as BbCommentRow;
  return { id: String(row.id ?? "") };
}

export async function updateBitbucketPrComment(
  workspace: string,
  repo: string,
  prId: string | number,
  commentId: string,
  rawMarkdown: string,
): Promise<{ id: string }> {
  const res = await bitbucketFetch(
    bitbucketPrCommentPath(workspace, repo, prId, commentId),
    {
      method: "PUT",
      body: JSON.stringify({ content: { raw: rawMarkdown } }),
    },
  );
  if (!res.ok) {
    throw new Error(
      `Bitbucket update comment ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  }
  const row = (await res.json()) as BbCommentRow;
  return { id: String(row.id ?? commentId) };
}
