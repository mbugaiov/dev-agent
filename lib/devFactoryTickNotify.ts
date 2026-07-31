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
  return `[${input.slug}] Dev factory wake — pick ${input.pickKey}: ${input.pickSummary}${others}. Next tick: ${next}`;
}

export function buildTickNotifyWebhookBody(input: TickNotifyInput): object {
  const summary = buildTickNotifySummary(input);
  const title =
    input.kind === "idle" ? "Dev factory idle" : "Dev factory backlog wake";

  const facts: { title: string; value: string }[] = [
    { title: "Project", value: input.slug },
    { title: "Tick", value: input.kind === "idle" ? "idle" : "backlog wake" },
    { title: "Next tick (UTC)", value: formatNextWake(input.nextWakeUtc) },
  ];

  if (input.kind === "wake") {
    facts.unshift(
      { title: "Pick", value: `${input.pickKey} — ${input.pickSummary}` },
      { title: "Backlog", value: String(input.count) },
    );
    if (input.issues.length > 1) {
      facts.push({
        title: "Queue",
        value: input.issues
          .slice(0, 5)
          .map((i) => `${i.key}: ${i.summary}`)
          .join(" · "),
      });
    }
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
          body: [
            {
              type: "TextBlock",
              text: title,
              weight: "Bolder",
              size: "Medium",
              color: input.kind === "idle" ? "Default" : "Accent",
              wrap: true,
            },
            { type: "FactSet", facts, spacing: "Medium" },
          ],
        },
      },
    ],
  };
}

export function getDevFactoryTeamsWebhookUrl(): string | undefined {
  const url = process.env.DEV_FACTORY_TEAMS_WEBHOOK_URL?.trim();
  return url || undefined;
}

export async function postDevFactoryTickNotify(
  input: TickNotifyInput,
  opts: { fetchImpl?: typeof fetch; webhookUrl?: string } = {},
): Promise<boolean> {
  const url = opts.webhookUrl ?? getDevFactoryTeamsWebhookUrl();
  if (!url) return false;

  const fetchImpl = opts.fetchImpl ?? fetch;
  const body = buildTickNotifyWebhookBody(input);
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok;
}
