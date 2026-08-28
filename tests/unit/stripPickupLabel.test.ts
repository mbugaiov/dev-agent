import { describe, expect, it } from "vitest";
import { buildJiraLabelRemoveBody } from "../../lib/stripPickupLabel";

describe("stripPickupLabel", () => {
  it("builds Jira update body for remove", () => {
    expect(buildJiraLabelRemoveBody("impl-dev")).toEqual({
      update: { labels: [{ remove: "impl-dev" }] },
    });
  });
});
