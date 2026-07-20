#!/usr/bin/env tsx
/**
 * Preflight before Validate/Testing — block if QA RETURN unresolved.
 * Usage: preflight_jira_handoff.ts <slug> <JIRA_KEY> [--json]
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  jiraAdfToPlainText,
  qaReturnBlocksValidateTesting,
  type JiraCommentLike,
} from "../lib/jiraCommentGate.ts";
import { jiraFetch } from "../lib/jiraClient.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function usage(): never {
  console.error("Usage: preflight_jira_handoff.ts <slug> <JIRA_KEY> [--json]");
  process.exit(2);
}

async function fetchComments(key: string): Promise<JiraCommentLike[]> {
  const res = await jiraFetch(`/rest/api/3/issue/${key}?fields=comment,status`);
  if (!res.ok) {
    throw new Error(`Jira fetch failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    fields: {
      comment?: {
        comments?: {
          created: string;
          body: unknown;
          author?: { displayName?: string };
        }[];
      };
    };
  };
  return (data.fields.comment?.comments ?? []).map((c) => ({
    created: c.created,
    author: c.author?.displayName,
    body: jiraAdfToPlainText(c.body),
  }));
}

async function main() {
  const slug = process.argv[2];
  const key = process.argv[3];
  const jsonOut = process.argv.includes("--json");
  if (!slug || !key || key.startsWith("-")) usage();
  void ROOT;
  void slug;

  const comments = await fetchComments(key);
  const gate = qaReturnBlocksValidateTesting(comments);

  if (jsonOut) {
    console.log(JSON.stringify({ issue: key, commentCount: comments.length, ...gate }));
    process.exit(gate.blocked ? 1 : 0);
  }

  console.log(`PREFLIGHT_COMMENTS {"issue":"${key}","count":${comments.length}}`);
  for (const c of comments.slice(-5)) {
    console.log(`--- ${c.created.slice(0, 19)} ${c.author ?? "?"} ---`);
    console.log(c.body.replace(/\s+/g, " ").slice(0, 200));
    console.log();
  }

  if (gate.blocked) {
    console.error("HANDOFF_BLOCKED_QA_RETURN", gate.reason);
    if (gate.latestReturnBody) {
      console.error(gate.latestReturnBody.slice(0, 800));
    }
    process.exit(1);
  }
  console.log("PREFLIGHT_OK — no unresolved QA RETURN blocking Validate/Testing");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
