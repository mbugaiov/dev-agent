import { describe, expect, it } from "vitest";
import {
  buildPickupFieldUpdates,
  DEFAULT_ESTIMATE_SCALE,
  needsAssignee,
  originalEstimateForPoints,
  resolvePickupStoryPoints,
  shouldTransitionToInProgress,
} from "../../lib/jiraPickup.ts";

const PICKUP = {
  assignee_account_id: "acc-1",
  story_point_fields: ["customfield_10016", "customfield_10033"],
  default_story_points: 2,
};

describe("jiraPickup", () => {
  it("transitions only from configured statuses", () => {
    expect(shouldTransitionToInProgress("To Do", PICKUP)).toBe(true);
    expect(shouldTransitionToInProgress("In Progress", PICKUP)).toBe(false);
  });

  it("needs assign when unassigned and config has account id", () => {
    expect(needsAssignee({ assignee: null }, PICKUP.assignee_account_id)).toBe(
      true,
    );
    expect(
      needsAssignee(
        { assignee: { accountId: "other" } },
        PICKUP.assignee_account_id,
      ),
    ).toBe(false);
  });

  it("maps story points to original estimate on house scale", () => {
    expect(originalEstimateForPoints(2, DEFAULT_ESTIMATE_SCALE)).toBe("2h");
    expect(originalEstimateForPoints(5, DEFAULT_ESTIMATE_SCALE)).toBe("8h");
  });

  it("buildPickupFieldUpdates only fills empty fields", () => {
    const updates = buildPickupFieldUpdates(
      {
        customfield_10016: 3,
        customfield_10033: null,
        timetracking: { originalEstimate: "4h" },
      },
      2,
      PICKUP,
    );
    expect(updates).toEqual({ customfield_10033: 2 });
  });

  it("buildPickupFieldUpdates sets all estimate fields when blank", () => {
    const updates = buildPickupFieldUpdates({}, 2, PICKUP);
    expect(updates).toEqual({
      customfield_10016: 2,
      customfield_10033: 2,
      timetracking: { originalEstimate: "2h" },
    });
  });

  it("resolvePickupStoryPoints uses CLI points, then default, then null", () => {
    const empty = {};
    expect(resolvePickupStoryPoints(empty, 3, PICKUP)).toBe(3);
    expect(resolvePickupStoryPoints(empty, undefined, PICKUP)).toBe(2);
    expect(
      resolvePickupStoryPoints(
        { customfield_10016: 1, customfield_10033: 1, timetracking: { originalEstimate: "1h" } },
        undefined,
        PICKUP,
      ),
    ).toBe(null);
  });
});
