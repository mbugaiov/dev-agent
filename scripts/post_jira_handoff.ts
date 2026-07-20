#!/usr/bin/env tsx
/**
 * Post Validate/Testing handoff comment; optionally transition.
 * Usage: post_jira_handoff.ts <slug> <JIRA_KEY> --pr-url ... --transition
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPrUrlPattern,
  formatHandoffComment,
  formatStgRetestHandoffComment,
  handoffCommentValid,
} from "../lib/projectConfig.ts";
import {
  jiraAdfToPlainText,
  mayTransitionAfterHandoffPost,
  type JiraCommentLike,
} from "../lib/jiraCommentGate.ts";
import {
  consumePendingExecuteState,
  PENDING_EXECUTE_PATH,
  shouldConsumePendingOnHandoff,
  type PendingExecuteState,
} from "../lib/devFactoryExecution.ts";
import {
  jiraFetch,
  plainTextToAdf,
  validateTestingTransitionId,
} from "../lib/jiraClient.ts";
import { loadProjectConfig } from "../lib/loadProject.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function usage(): never {
  console.error(`Usage: post_jira_handoff.ts <slug> <JIRA_KEY> \\
  --pr-url <url> --pipeline-build <n> --stg-build-id <hash> --main-commit <hash> \\
  --summary <text> [--kind initial|stg-retest] [--feature-commit <hash>] \\
  [--follow-on <note>]... [--acceptance-step <step>]... [--transition] [--dry-run]`);
  process.exit(2);
}

function parseArgs(argv: string[]) {
  const slug = argv[0];
  const key = argv[1];
  if (!slug || !key || slug.startsWith("-") || key.startsWith("-")) usage();

  let prUrl = "";
  let pipelineBuild = "";
  let stgBuildId = "";
  let mainCommit = "";
  let summary = "";
  let kind: "initial" | "stg-retest" = "initial";
  let featureCommit: string | undefined;
  const followOn: string[] = [];
  const acceptanceSteps: string[] = [];
  let transition = false;
  let dryRun = false;

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => {
      const v = argv[++i];
      if (!v) usage();
      return v;
    };
    switch (a) {
      case "--pr-url":
        prUrl = next();
        break;
      case "--pipeline-build":
        pipelineBuild = next();
        break;
      case "--stg-build-id":
        stgBuildId = next();
        break;
      case "--main-commit":
        mainCommit = next();
        break;
      case "--summary":
        summary = next();
        break;
      case "--kind":
        kind = next() as "initial" | "stg-retest";
        break;
      case "--feature-commit":
        featureCommit = next();
        break;
      case "--follow-on":
        followOn.push(next());
        break;
      case "--acceptance-step":
      case "--acceptance-steps":
        acceptanceSteps.push(next());
        break;
      case "--transition":
        transition = true;
        break;
      case "--dry-run":
        dryRun = true;
        break;
      default:
        console.error(`Unknown arg: ${a}`);
        usage();
    }
  }

  if (!prUrl || !pipelineBuild || !stgBuildId || !mainCommit || !summary) {
    usage();
  }

  return {
    slug,
    key,
    prUrl,
    pipelineBuild,
    stgBuildId,
    mainCommit,
    summary,
    kind,
    featureCommit,
    followOn,
    acceptanceSteps,
    transition,
    dryRun,
  };
}

function consumePendingExecuteForHandoff(ticketKey: string) {
  const path = join(ROOT, PENDING_EXECUTE_PATH);
  if (!existsSync(path)) return;
  try {
    const pending = JSON.parse(
      readFileSync(path, "utf8"),
    ) as PendingExecuteState;
    if (!shouldConsumePendingOnHandoff(pending, ticketKey)) return;
    writeFileSync(
      path,
      JSON.stringify(consumePendingExecuteState(pending), null, 2) + "\n",
      "utf8",
    );
    console.log(`PENDING_EXECUTE_CONSUMED {"ticket":"${ticketKey}"}`);
  } catch {
    /* ignore */
  }
}

async function fetchIssueComments(key: string): Promise<JiraCommentLike[]> {
  const res = await jiraFetch(`/rest/api/3/issue/${key}?fields=comment`);
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
  const args = parseArgs(process.argv.slice(2));
  const config = loadProjectConfig(ROOT, args.slug);
  const prPattern = buildPrUrlPattern(config.git);

  const body =
    args.kind === "stg-retest"
      ? formatStgRetestHandoffComment({
          mergedPrUrl: args.prUrl,
          pipelineBuildNumber: args.pipelineBuild,
          stgBuildId: args.stgBuildId,
          mainCommit: args.mainCommit,
          summary: args.summary,
          featureMainCommit: args.featureCommit,
          followOnNotes: args.followOn.length ? args.followOn : undefined,
          acceptanceSteps: args.acceptanceSteps.length
            ? args.acceptanceSteps
            : undefined,
        })
      : formatHandoffComment({
          mergedPrUrl: args.prUrl,
          pipelineBuildNumber: args.pipelineBuild,
          stgBuildId: args.stgBuildId,
          mainCommit: args.mainCommit,
          summary: args.summary,
          acceptanceSteps: args.acceptanceSteps.length
            ? args.acceptanceSteps
            : undefined,
        });

  if (!handoffCommentValid(body, prPattern)) {
    console.error(
      "HANDOFF_INVALID — comment missing PR link, pipeline build #, or buildId",
    );
    console.error(body);
    process.exit(1);
  }

  console.log("--- Handoff comment ---");
  console.log(body);
  console.log("-----------------------");

  if (args.dryRun) {
    console.log("DRY_RUN — not posting to Jira");
    return;
  }

  const commentRes = await jiraFetch(`/rest/api/3/issue/${args.key}/comment`, {
    method: "POST",
    body: JSON.stringify({ body: plainTextToAdf(body) }),
  });
  if (!commentRes.ok) {
    console.error("Jira comment failed:", commentRes.status, await commentRes.text());
    process.exit(1);
  }
  console.log(`HANDOFF_POSTED {"issue":"${args.key}"}`);

  if (args.transition) {
    const afterPost = await fetchIssueComments(args.key);
    if (!mayTransitionAfterHandoffPost(afterPost)) {
      console.error(
        "HANDOFF_TRANSITION_BLOCKED — latest comment must be dev handoff (not QA RETURN).",
      );
      process.exit(1);
    }
    const transitionId = validateTestingTransitionId(config.jira?.transitions);
    const trRes = await jiraFetch(`/rest/api/3/issue/${args.key}/transitions`, {
      method: "POST",
      body: JSON.stringify({ transition: { id: transitionId } }),
    });
    if (!trRes.ok) {
      console.error("Jira transition failed:", trRes.status, await trRes.text());
      process.exit(1);
    }
    console.log(
      `HANDOFF_TRANSITION {"issue":"${args.key}","status":"${config.dev_factory.handoff_status}"}`,
    );
  }

  consumePendingExecuteForHandoff(args.key);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
