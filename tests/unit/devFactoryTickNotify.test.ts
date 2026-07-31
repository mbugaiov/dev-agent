import { describe, expect, it, vi } from "vitest";
import {
  buildTickNotifySummary,
  buildTickNotifyWebhookBody,
  postDevFactoryTickNotify,
} from "../../lib/devFactoryTickNotify.ts";

describe("devFactoryTickNotify", () => {
  it("backlog wake summary lists pick ticket and next wake", () => {
    const text = buildTickNotifySummary({
      slug: "lrm",
      kind: "wake",
      count: 2,
      pickKey: "RQ-1946",
      pickSummary: "Teams tick notify",
      issues: [
        { key: "RQ-1946", summary: "Teams tick notify" },
        { key: "RQ-1947", summary: "Follow-on" },
      ],
      nextWakeUtc: "2026-07-31 03:22:29 UTC",
    });
    expect(text).toContain("RQ-1946");
    expect(text).toContain("Teams tick notify");
    expect(text).toContain("+1 more");
    expect(text).toContain("2026-07-31 03:22:29 UTC");
  });

  it("idle summary states no work and next wake", () => {
    const text = buildTickNotifySummary({
      slug: "lrm",
      kind: "idle",
      nextWakeUtc: "2026-07-31 03:37:29 UTC",
    });
    expect(text).toContain("idle");
    expect(text).toContain("no impl-dev tickets");
    expect(text).toContain("2026-07-31 03:37:29 UTC");
  });

  it("webhook body includes pick and backlog facts for wake", () => {
    const body = buildTickNotifyWebhookBody({
      slug: "lrm",
      kind: "wake",
      count: 1,
      pickKey: "RQ-1",
      pickSummary: "Example",
      issues: [{ key: "RQ-1", summary: "Example" }],
      nextWakeUtc: "2026-07-31 04:00:00 UTC",
    }) as {
      summary: string;
      attachments: { content: { body: { facts?: { title: string }[] }[] } }[];
    };
    expect(body.summary).toContain("RQ-1");
    const factSet = body.attachments[0]?.content.body.find(
      (b) => b.facts !== undefined,
    );
    expect(factSet?.facts?.some((f) => f.title === "Pick")).toBe(true);
    expect(factSet?.facts?.some((f) => f.title === "Backlog")).toBe(true);
  });

  it("postDevFactoryTickNotify skips when webhook URL unset", async () => {
    const fetchMock = vi.fn();
    const posted = await postDevFactoryTickNotify(
      { slug: "lrm", kind: "idle" },
      { fetchImpl: fetchMock, webhookUrl: undefined },
    );
    expect(posted).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("postDevFactoryTickNotify POSTs when webhook URL set", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 202 }));
    const posted = await postDevFactoryTickNotify(
      {
        slug: "lrm",
        kind: "idle",
        nextWakeUtc: "2026-07-31 04:00:00 UTC",
      },
      { fetchImpl: fetchMock, webhookUrl: "https://example.test/hook" },
    );
    expect(posted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
