/** Teams notification for dev factory tick (wake / idle). */

export type TickIssueSummary = {
  key: string;
  summary: string;
};

export type TickNotifyWakeInput = {
  slug: string;
  kind: "wake";
  count: number;
  pickKey: string;
  pickSummary: string;
  issues: TickIssueSummary[];
  nextWakeUtc?: string;
};

export type TickNotifyIdleInput = {
  slug: string;
  kind: "idle";
  nextWakeUtc?: string;
};

export type TickNotifyInput = TickNotifyWakeInput | TickNotifyIdleInput;

function formatNextWake(nextWakeUtc?: string): string {
  return nextWakeUtc?.trim() || "not scheduled";
}

export function buildTickNotifySummary(input: TickNotifyInput): string {
  const next = formatNextWake(input.nextWakeUtc);
  if (input.kind === "idle") {
    return `[${input.slug}] Dev factory idle — no impl-dev tickets. Next tick: ${next}`;
  }
  const others =
    input.count > 1
      ? ` (+${input.count - 1} more in backlog)`
      : "";
  return `[${input.slug}] Dev factory execute — pick ${input.pickKey}: ${input.pickSummary}${others}. Next tick: ${next}`;
}

/** Adaptive Card title colour for Hephaestus / Dev (distinct from Athena/Argus). */
export const DEV_FACTORY_CARD_COLOR = "Accent" as const;
export const DEV_FACTORY_AGENT_ID = "Hephaestus / Dev";

const QUEUE_MAX = 5;

/**
 * Remaining backlog lines for the Adaptive Card (excludes the current pick).
 * One ticket per line so Teams FactSet does not collapse the queue into a blob.
 */
export function formatQueueLines(
  issues: TickIssueSummary[],
  pickKey: string,
  max = QUEUE_MAX,
): string[] {
  return issues
    .filter((i) => i.key !== pickKey)
    .slice(0, max)
    .map((i) => `• ${i.key} — ${i.summary}`);
}

export function buildTickNotifyWebhookBody(input: TickNotifyInput): object {
  const summary = buildTickNotifySummary(input);
  const title =
    input.kind === "idle"
      ? "Hephaestus · Dev factory idle"
      : "Hephaestus · Dev factory execute";

  const facts: { title: string; value: string }[] = [
    { title: "Agent", value: DEV_FACTORY_AGENT_ID },
    { title: "Project", value: input.slug },
    { title: "Tick", value: input.kind === "idle" ? "idle" : "backlog execute" },
    { title: "Next tick (UTC)", value: formatNextWake(input.nextWakeUtc) },
  ];

  let queueLines: string[] = [];
  if (input.kind === "wake") {
    facts.unshift(
      { title: "Pick", value: `${input.pickKey} — ${input.pickSummary}` },
      { title: "Backlog", value: String(input.count) },
    );
    queueLines = formatQueueLines(input.issues, input.pickKey);
  }

  const body: object[] = [
    {
      type: "TextBlock",
      text: title,
      weight: "Bolder",
      size: "Medium",
      color: DEV_FACTORY_CARD_COLOR,
      wrap: true,
    },
    { type: "FactSet", facts, spacing: "Medium" },
  ];

  if (queueLines.length > 0) {
    body.push(
      {
        type: "TextBlock",
        text: "Queue",
        weight: "Bolder",
        spacing: "Medium",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: queueLines.join("\n"),
        wrap: true,
        spacing: "Small",
      },
    );
  }

  return {
    type: "message",
    summary,
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          msteams: { width: "Full" },
          body,
        },
      },
    ],
  };
}
export function getDevFactoryTeamsWebhookUrl(): string | undefined {
  const url = process.env.DEV_FACTORY_TEAMS_WEBHOOK_URL?.trim();
  return url || undefined;
}

export type WebhookUrlProblem =
  /** Feature not enabled — the variable is absent. Not an error. */
  | "not_configured"
  | "not_absolute"
  | "not_https"
  | "missing_signature";

export type WebhookUrlCheck =
  | { ok: true; url: string }
  | { ok: false; problem: WebhookUrlProblem; detail: string };

/**
 * Validate webhook URL shape.
 *
 * Teams notification is optional, so an absent variable reports `not_configured`
 * and is handled quietly. A value that is present but malformed — e.g. truncated
 * by unquoted shell metacharacters, which drops the `sig` param — is a real error.
 */
export function checkWebhookUrl(raw: string | undefined): WebhookUrlCheck {
  const url = raw?.trim();
  if (!url) {
    return {
      ok: false,
      problem: "not_configured",
      detail:
        "DEV_FACTORY_TEAMS_WEBHOOK_URL is not set — Teams tick notification disabled",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {
      ok: false,
      problem: "not_absolute",
      detail: `not a valid absolute URL (length ${url.length}) — likely truncated`,
    };
  }

  if (parsed.protocol !== "https:") {
    return {
      ok: false,
      problem: "not_https",
      detail: `expected https, got ${parsed.protocol}`,
    };
  }

  // Power Automate / Logic Apps URLs are unusable without the signature param.
  const needsSignature = /logic\.azure\.com$|azure\.com$/.test(parsed.hostname);
  if (needsSignature && !parsed.searchParams.get("sig")) {
    return {
      ok: false,
      problem: "missing_signature",
      detail:
        "missing sig query parameter — value was truncated (quote the URL in .secrets/jira.env)",
    };
  }

  return { ok: true, url };
}

export type TickNotifyFailureReason =
  | "invalid_webhook_url"
  | "http_error"
  | "exception";

export type TickNotifyOutcome =
  | { delivered: true; status: number }
  /** Optional feature disabled — intentionally silent. */
  | { delivered: false; reason: "not_configured"; detail: string }
  | {
      delivered: false;
      reason: TickNotifyFailureReason;
      detail: string;
      status?: number;
    };

export const TICK_NOTIFY_FAILED_SENTINEL = "TICK_NOTIFY_FAILED" as const;

/**
 * True when an outcome represents a genuine delivery failure that must be
 * reported. An unconfigured webhook is not a failure.
 */
export function shouldReportTickNotifyOutcome(
  outcome: TickNotifyOutcome,
): boolean {
  return !outcome.delivered && outcome.reason !== "not_configured";
}

/** Loud, structured failure line — real notify problems must never be swallowed. */
export function formatTickNotifyFailure(
  slug: string,
  kind: TickNotifyInput["kind"],
  outcome: TickNotifyOutcome,
): string {
  if (!shouldReportTickNotifyOutcome(outcome)) {
    throw new Error(
      "formatTickNotifyFailure called on a delivered or unconfigured outcome",
    );
  }
  return `${TICK_NOTIFY_FAILED_SENTINEL} ${JSON.stringify({
    slug,
    tick: kind,
    reason: outcome.reason,
    detail: outcome.detail,
    ...("status" in outcome && outcome.status !== undefined
      ? { status: outcome.status }
      : {}),
    remediation:
      "Teams tick notification was NOT delivered. Verify DEV_FACTORY_TEAMS_WEBHOOK_URL is quoted in projects/<slug>/.secrets/jira.env, then run npx tsx scripts/lint_secrets_env.ts <file>.",
  })}`;
}

export async function postDevFactoryTickNotify(
  input: TickNotifyInput,
  opts: { fetchImpl?: typeof fetch; webhookUrl?: string } = {},
): Promise<TickNotifyOutcome> {
  const check = checkWebhookUrl(opts.webhookUrl ?? getDevFactoryTeamsWebhookUrl());
  if (!check.ok) {
    return check.problem === "not_configured"
      ? { delivered: false, reason: "not_configured", detail: check.detail }
      : {
          delivered: false,
          reason: "invalid_webhook_url",
          detail: `${check.problem}: ${check.detail}`,
        };
  }

  const fetchImpl = opts.fetchImpl ?? fetch;
  const body = buildTickNotifyWebhookBody(input);

  let res: Response;
  try {
    res = await fetchImpl(check.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      delivered: false,
      reason: "exception",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (!res.ok) {
    let detail = `webhook responded ${res.status}`;
    try {
      const text = (await res.text()).trim();
      if (text) detail += `: ${text.slice(0, 300)}`;
    } catch {
      /* body already consumed or unreadable */
    }
    return {
      delivered: false,
      reason: "http_error",
      detail,
      status: res.status,
    };
  }

  return { delivered: true, status: res.status };
}
