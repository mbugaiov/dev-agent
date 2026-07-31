import { describe, expect, it, vi } from "vitest";
import {
  buildTickNotifySummary,
  buildTickNotifyWebhookBody,
  checkWebhookUrl,
  formatTickNotifyFailure,
  postDevFactoryTickNotify,
} from "../../lib/devFactoryTickNotify.ts";

describe("devFactoryTickNotify", () => {
  it("backlog execute summary lists pick ticket and next wake", () => {
    const text = buildTickNotifySummary({
      slug: "selftest",
      kind: "wake",
      count: 2,
      pickKey: "TST-109",
      pickSummary: "Teams tick notify",
      issues: [
        { key: "TST-109", summary: "Teams tick notify" },
        { key: "TST-110", summary: "Follow-on" },
      ],
      nextWakeUtc: "2026-07-31 03:22:29 UTC",
    });
    expect(text).toContain("TST-109");
    expect(text).toContain("Teams tick notify");
    expect(text).toContain("+1 more");
    expect(text).toContain("2026-07-31 03:22:29 UTC");
  });

  it("idle summary states no work and next wake", () => {
    const text = buildTickNotifySummary({
      slug: "selftest",
      kind: "idle",
      nextWakeUtc: "2026-07-31 03:37:29 UTC",
    });
    expect(text).toContain("idle");
    expect(text).toContain("no impl-dev tickets");
    expect(text).toContain("2026-07-31 03:37:29 UTC");
  });

  it("webhook body includes pick and backlog facts for wake", () => {
    const body = buildTickNotifyWebhookBody({
      slug: "selftest",
      kind: "wake",
      count: 1,
      pickKey: "TST-105",
      pickSummary: "Example",
      issues: [{ key: "TST-105", summary: "Example" }],
      nextWakeUtc: "2026-07-31 04:00:00 UTC",
    }) as {
      summary: string;
      attachments: { content: { body: { facts?: { title: string }[] }[] } }[];
    };
    expect(body.summary).toContain("TST-105");
    const factSet = body.attachments[0]?.content.body.find(
      (b) => b.facts !== undefined,
    );
    expect(factSet?.facts?.some((f) => f.title === "Pick")).toBe(true);
    expect(factSet?.facts?.some((f) => f.title === "Backlog")).toBe(true);
  });

  it("reports missing webhook URL instead of failing silently", async () => {
    const fetchMock = vi.fn();
    const outcome = await postDevFactoryTickNotify(
      { slug: "selftest", kind: "idle" },
      { fetchImpl: fetchMock, webhookUrl: "" },
    );
    expect(outcome.delivered).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    if (!outcome.delivered) {
      expect(outcome.reason).toBe("invalid_webhook_url");
      expect(outcome.detail).toContain("missing");
    }
  });

  it("postDevFactoryTickNotify POSTs when webhook URL set", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 202 }));
    const outcome = await postDevFactoryTickNotify(
      {
        slug: "selftest",
        kind: "idle",
        nextWakeUtc: "2026-07-31 04:00:00 UTC",
      },
      { fetchImpl: fetchMock, webhookUrl: "https://example.test/hook" },
    );
    expect(outcome).toEqual({ delivered: true, status: 202 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces HTTP error status and body", async () => {
    const fetchMock = vi.fn(
      async () => new Response("workflow trigger disabled", { status: 403 }),
    );
    const outcome = await postDevFactoryTickNotify(
      { slug: "selftest", kind: "idle" },
      { fetchImpl: fetchMock, webhookUrl: "https://example.test/hook" },
    );
    expect(outcome.delivered).toBe(false);
    if (!outcome.delivered) {
      expect(outcome.reason).toBe("http_error");
      expect(outcome.status).toBe(403);
      expect(outcome.detail).toContain("workflow trigger disabled");
    }
  });

  it("surfaces network exceptions", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("ENOTFOUND prod-1.westus.logic.azure.com");
    });
    const outcome = await postDevFactoryTickNotify(
      { slug: "selftest", kind: "wake", count: 1, pickKey: "TST-1", pickSummary: "x", issues: [] },
      { fetchImpl: fetchMock, webhookUrl: "https://example.test/hook" },
    );
    expect(outcome.delivered).toBe(false);
    if (!outcome.delivered) {
      expect(outcome.reason).toBe("exception");
      expect(outcome.detail).toContain("ENOTFOUND");
    }
  });

  it("checkWebhookUrl detects truncation that drops the sig param", () => {
    const truncated =
      "https://prod-1.westus.logic.azure.com/workflows/abc/triggers/manual/paths/invoke?api-version=2016-06-01";
    const result = checkWebhookUrl(truncated);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem).toBe("missing_signature");

    const full = `${truncated}&sig=abc123`;
    expect(checkWebhookUrl(full)).toEqual({ ok: true, url: full });
  });

  it("checkWebhookUrl rejects empty, relative, and non-https URLs", () => {
    expect(checkWebhookUrl(undefined).ok).toBe(false);
    expect(checkWebhookUrl("   ").ok).toBe(false);
    expect(checkWebhookUrl("/relative/path").ok).toBe(false);
    expect(checkWebhookUrl("http://example.test/hook").ok).toBe(false);
  });

  it("formatTickNotifyFailure emits loud sentinel without leaking the URL", () => {
    const line = formatTickNotifyFailure("selftest", "wake", {
      delivered: false,
      reason: "http_error",
      detail: "webhook responded 403",
      status: 403,
    });
    expect(line).toMatch(/^TICK_NOTIFY_FAILED /);
    expect(line).toContain("selftest");
    expect(line).toContain("403");
    expect(line).toContain("remediation");
  });
});
