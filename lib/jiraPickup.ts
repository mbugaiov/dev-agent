// Jira ticket pickup — assign, estimate, transition (pure helpers).

import type { JiraPickupConfig, JiraTransitions } from "./projectConfig.ts";

export const DEFAULT_ESTIMATE_SCALE: Readonly<Record<number, string>> = {
  1: "1h",
  2: "2h",
  3: "4h",
  5: "8h",
  8: "16h",
};

export const DEFAULT_IN_PROGRESS_TRANSITION = "21";

export const DEFAULT_TRANSITION_FROM_STATUSES = ["To Do"] as const;

export type JiraIssuePickupFields = {
  status?: { name?: string };
  assignee?: { accountId?: string } | null;
  timetracking?: { originalEstimate?: string | null } | null;
  [customField: string]: unknown;
};

export function resolveEstimateScale(
  pickup?: JiraPickupConfig,
): Readonly<Record<number, string>> {
  return pickup?.estimate_scale ?? DEFAULT_ESTIMATE_SCALE;
}

export function originalEstimateForPoints(
  points: number,
  scale: Readonly<Record<number, string>>,
): string {
  const estimate = scale[points];
  if (!estimate) {
    throw new Error(
      `No original estimate mapping for ${points} story points — extend jira.pickup.estimate_scale`,
    );
  }
  return estimate;
}

export function inProgressTransitionId(
  transitions?: JiraTransitions,
): string {
  return (
    process.env.JIRA_IN_PROGRESS_TRANSITION ??
    transitions?.in_progress ??
    DEFAULT_IN_PROGRESS_TRANSITION
  );
}

export function transitionFromStatuses(
  pickup?: JiraPickupConfig,
): readonly string[] {
  return pickup?.transition_from_statuses ?? DEFAULT_TRANSITION_FROM_STATUSES;
}

export function shouldTransitionToInProgress(
  statusName: string | undefined,
  pickup?: JiraPickupConfig,
): boolean {
  if (!statusName) return false;
  return transitionFromStatuses(pickup).includes(statusName);
}

export function needsAssignee(
  fields: JiraIssuePickupFields,
  assigneeAccountId: string | undefined,
): boolean {
  if (!assigneeAccountId) return false;
  const current = fields.assignee?.accountId;
  return !current;
}

export function storyPointFieldIds(
  pickup?: JiraPickupConfig,
): readonly string[] {
  return pickup?.story_point_fields ?? [];
}

export function estimateFieldsEmpty(
  fields: JiraIssuePickupFields,
  fieldIds: readonly string[],
): boolean {
  for (const id of fieldIds) {
    const val = fields[id];
    if (val !== null && val !== undefined && val !== "") return false;
  }
  const original = fields.timetracking?.originalEstimate;
  if (original) return false;
  return fieldIds.length > 0 || !fields.timetracking?.originalEstimate;
}

export function buildPickupFieldUpdates(
  fields: JiraIssuePickupFields,
  points: number,
  pickup?: JiraPickupConfig,
): Record<string, unknown> {
  const fieldIds = storyPointFieldIds(pickup);
  const scale = resolveEstimateScale(pickup);
  const updates: Record<string, unknown> = {};

  for (const id of fieldIds) {
    const val = fields[id];
    if (val === null || val === undefined || val === "") {
      updates[id] = points;
    }
  }

  const original = fields.timetracking?.originalEstimate;
  if (!original) {
    updates.timetracking = {
      originalEstimate: originalEstimateForPoints(points, scale),
    };
  }

  return updates;
}

export function resolvePickupStoryPoints(
  fields: JiraIssuePickupFields,
  requestedPoints: number | undefined,
  pickup?: JiraPickupConfig,
): number | null {
  const fieldIds = storyPointFieldIds(pickup);
  const needsEstimate =
    fieldIds.length > 0
      ? fieldIds.some((id) => {
          const val = fields[id];
          return val === null || val === undefined || val === "";
        }) || !fields.timetracking?.originalEstimate
      : !fields.timetracking?.originalEstimate;

  if (!needsEstimate) return null;
  if (requestedPoints !== undefined) return requestedPoints;
  if (pickup?.default_story_points !== undefined) {
    return pickup.default_story_points;
  }
  return null;
}
