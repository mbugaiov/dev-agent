import { describe, expect, it } from "vitest";
import {
  jiraCommentCountPath,
  jiraNewestCommentsPath,
  jiraNewestCommentsWindow,
} from "../../lib/jiraCommentList.ts";

describe("jiraCommentList recency window", () => {
  it("starts at 0 when the ticket has fewer than one page", () => {
    expect(jiraNewestCommentsWindow(0)).toEqual({
      startAt: 0,
      maxResults: 50,
    });
    expect(jiraNewestCommentsWindow(12)).toEqual({
      startAt: 0,
      maxResults: 50,
    });
    expect(jiraNewestCommentsWindow(50)).toEqual({
      startAt: 0,
      maxResults: 50,
    });
  });

  it("skips oldest comments once total exceeds the page (76 → startAt 26)", () => {
    expect(jiraNewestCommentsWindow(76)).toEqual({
      startAt: 26,
      maxResults: 50,
    });
    expect(jiraNewestCommentsPath("TST-9", 76)).toBe(
      "/rest/api/3/issue/TST-9/comment?startAt=26&maxResults=50",
    );
  });

  it("probes total with a 1-row page, not a 50-row oldest slice", () => {
    expect(jiraCommentCountPath("TST-9")).toBe(
      "/rest/api/3/issue/TST-9/comment?startAt=0&maxResults=1",
    );
  });
});
