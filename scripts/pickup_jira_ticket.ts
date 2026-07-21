#!/usr/bin/env tsx
/**
 * Pick up a dev-factory ticket — transition, assign, estimate, scope comment.
 * Usage: pickup_jira_ticket.ts <slug> <JIRA_KEY> --scope "..." [--points N] [--dry-run]
 *
 * Requires project .secrets/jira.env (source via pickup_jira_ticket.sh).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPickupFieldUpdates,
  inProgressTransitionId,
  needsAssignee,
  resolvePickupStoryPoints,
  shouldTransitionToInProgress,
  storyPointFieldIds,
  type JiraIssuePickupFields,
} from "../lib/jiraPickup.ts";
import { jiraFetch, plainTextToAdf } from "../lib/jiraClient.ts";
import type { ProjectConfig } from "../lib/projectConfig.ts";
import { loadProjectConfig } from "../lib/loadProject.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function usage(): never {
  console.error(`Usage: pickup_jira_ticket.ts <slug> <JIRA_KEY> \\
  --scope "<plan comment>" [--points <n>] [--dry-run]`);
  process.exit(2);
}

function parseArgs(argv: string[]) {
  const slug = argv[0];
  const key = argv[1];
  if (!slug || !key || slug.startsWith("-") || key.startsWith("-")) usage();

  let scope = "";
  let points: number | undefined;
  let dryRun = false;

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => {
      const v = argv[++i];
      if (!v) usage();
      return v;
    };
    switch (a) {
      case "--scope":
        scope = next();
        break;
      case "--points": {
        const n = Number(next());
        if (!Number.isFinite(n) || n <= 0) {
          console.error("--points must be a positive number");
          process.exit(2);
        }
        points = n;
        break;
      }
      case "--dry-run":
        dryRun = true;
        break;
      default:
        console.error(`Unknown arg: ${a}`);
        usage();
    }
  }

  if (!scope.trim()) usage();
  return { slug, key, scope: scope.trim(), points, dryRun };
}

async function fetchIssueFields(
  key: string,
  config: ProjectConfig,
): Promise<JiraIssuePickupFields> {
  const fieldIds = storyPointFieldIds(config.jira?.pickup);
  const fieldList = ["status", "assignee", "timetracking", ...fieldIds].join(
    ",",
  );
  const res = await jiraFetch(
    `/rest/api/3/issue/${key}?fields=${encodeURIComponent(fieldList)}`,
  );
  if (!res.ok) {
    throw new Error(`Jira fetch failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { fields: JiraIssuePickupFields };
  return data.fields;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadProjectConfig(ROOT, args.slug);
  const pickup = config.jira?.pickup;
  const assigneeId = pickup?.assignee_account_id;

  const fields = await fetchIssueFields(args.key, config);
  const statusName = fields.status?.name;
  const actions: string[] = [];

  if (shouldTransitionToInProgress(statusName, pickup)) {
    actions.push(`transition → In Progress (${statusName})`);
    if (!args.dryRun) {
      const transitionId = inProgressTransitionId(config.jira?.transitions);
      const trRes = await jiraFetch(
        `/rest/api/3/issue/${args.key}/transitions`,
        {
          method: "POST",
          body: JSON.stringify({ transition: { id: transitionId } }),
        },
      );
      if (!trRes.ok) {
        console.error(
          "Jira transition failed:",
          trRes.status,
          await trRes.text(),
        );
        process.exit(1);
      }
    }
  }

  if (needsAssignee(fields, assigneeId)) {
    actions.push("assign → maintainer");
    if (!args.dryRun) {
      const assignRes = await jiraFetch(
        `/rest/api/3/issue/${args.key}/assignee`,
        {
          method: "PUT",
          body: JSON.stringify({ accountId: assigneeId }),
        },
      );
      if (!assignRes.ok) {
        console.error(
          "Jira assign failed:",
          assignRes.status,
          await assignRes.text(),
        );
        process.exit(1);
      }
    }
  }

  const resolvedPoints = resolvePickupStoryPoints(fields, args.points, pickup);
  if (resolvedPoints === null && args.points === undefined) {
    const fieldIds = storyPointFieldIds(pickup);
    const missingEstimate =
      fieldIds.some((id) => {
        const val = fields[id];
        return val === null || val === undefined || val === "";
      }) || !fields.timetracking?.originalEstimate;
    if (missingEstimate && fieldIds.length > 0) {
      console.error(
        "PICKUP_NEEDS_POINTS — ticket has empty estimate fields; pass --points or set jira.pickup.default_story_points in project.yaml",
      );
      process.exit(1);
    }
  }

  const pointsToApply =
    resolvedPoints ?? (args.points !== undefined ? args.points : undefined);
  if (pointsToApply !== undefined) {
    const updates = buildPickupFieldUpdates(fields, pointsToApply, pickup);
    if (Object.keys(updates).length > 0) {
      actions.push(`estimate → ${pointsToApply} points`);
      if (!args.dryRun) {
        const putRes = await jiraFetch(`/rest/api/3/issue/${args.key}`, {
          method: "PUT",
          body: JSON.stringify({ fields: updates }),
        });
        if (!putRes.ok) {
          console.error(
            "Jira estimate update failed:",
            putRes.status,
            await putRes.text(),
          );
          process.exit(1);
        }
      }
    }
  }

  actions.push("scope comment");
  if (!args.dryRun) {
    const commentRes = await jiraFetch(`/rest/api/3/issue/${args.key}/comment`, {
      method: "POST",
      body: JSON.stringify({ body: plainTextToAdf(args.scope) }),
    });
    if (!commentRes.ok) {
      console.error(
        "Jira scope comment failed:",
        commentRes.status,
        await commentRes.text(),
      );
      process.exit(1);
    }
  }

  console.log(
    `PICKUP_OK {"issue":"${args.key}","status":"${statusName ?? "?"}","actions":[${actions.map((a) => `"${a}"`).join(",")}]${args.dryRun ? ',"dryRun":true' : ""}}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
