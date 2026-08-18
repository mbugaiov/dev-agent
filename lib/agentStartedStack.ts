/**
 * One living ### <Seat> started comment per seat+ticket (GitHub/Jira).
 * Identical Mode+Doing within the session is skipped (Kairos K11).
 * A new Mode/Doing PATCHes the same comment and stacks the previous headline.
 */
export const DEFAULT_SESSION_TTL_MS = 6 * 60 * 60 * 1000;
export const DEFAULT_MAX_STACK = 12;

export type AgentStartEvent = {
  seat: string;
  ticketLine: string;
  mode: string;
  doing: string;
  at: Date;
};

export type StackLine = { at: string; mode: string; doing: string };

export type StackDecision =
  | { action: "create"; body: string }
  | { action: "skip"; reason: string; body: string }
  | { action: "patch"; body: string };

export function githubTargetKey(
  kind: "issue" | "pr",
  n: string | number,
): string {
  return `${kind}:${String(n)}`;
}

export function agentStartedMarker(seat: string, targetKey: string): string {
  return `<!-- agent-started:${sanitizeToken(seat)}:${sanitizeToken(targetKey)} -->`;
}

function sanitizeToken(s: string): string {
  return s.replace(/[^\w.#:+-]/g, "_");
}

const HTML_MARKER_RE =
  /<!--\s*agent-started:([^:\s]+):([^\s>]+)\s*-->/;
const CODE_MARKER_RE = /`agent-started:([^:`\s]+):([^`\s]+)`/;

export function parseAgentStartedMarker(
  body: string,
): { seat: string; targetKey: string } | null {
  const m = body.match(HTML_MARKER_RE) ?? body.match(CODE_MARKER_RE);
  if (!m) return null;
  return { seat: m[1]!, targetKey: m[2]! };
}

function lineValue(body: string, label: string): string | null {
  const re = new RegExp(
    String.raw`(?:\*\*)?${label}:(?:\*\*)?\s*(.+)`,
    "im",
  );
  const m = body.match(re);
  return m ? m[1]!.trim() : null;
}

function parseHeadingSeat(body: string): string | null {
  const m = body.match(/^(?:#{1,3}\s+)?(.+?) started\s*$/m);
  return m ? m[1]!.trim() : null;
}

function parseFooterAt(body: string): string | null {
  const m = body.match(
    /(?:post_agent_started|pickup_github_ticket|pickup_jira_ticket)\s*·\s*([0-9T:.\-Z]+)/,
  );
  return m ? m[1]!.trim() : null;
}

function parseStackLines(body: string): StackLine[] {
  const lines: StackLine[] = [];
  const re =
    /^[-\s]*`?(\d{2}:\d{2}Z)`?\s+(.+?)\s+—\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    lines.push({ at: m[1]!, mode: m[2]!.trim(), doing: m[3]!.trim() });
  }
  return lines;
}

export type ParsedBanner = {
  seat: string;
  mode: string;
  doing: string;
  at: string | null;
  stack: StackLine[];
};

export function parseAgentStartedBanner(body: string): ParsedBanner | null {
  const seat = parseHeadingSeat(body);
  const mode = lineValue(body, "Mode");
  const doing = lineValue(body, "Doing");
  if (!seat || mode == null || doing == null) return null;
  return {
    seat,
    mode,
    doing,
    at: parseFooterAt(body),
    stack: parseStackLines(body),
  };
}

export function normalizeStartText(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

export function sameStartEvent(
  a: { mode: string; doing: string },
  b: { mode: string; doing: string },
): boolean {
  return (
    normalizeStartText(a.mode) === normalizeStartText(b.mode) &&
    normalizeStartText(a.doing) === normalizeStartText(b.doing)
  );
}

export function formatStackClock(at: Date): string {
  return `${at.toISOString().slice(11, 16)}Z`;
}

export function buildChatBanner(event: AgentStartEvent): string {
  return [
    `### ${event.seat} started`,
    "",
    event.ticketLine,
    `**Mode:** ${event.mode}`,
    `**Doing:** ${event.doing}`,
    "",
    `\`post_agent_started · ${event.at.toISOString()}\``,
  ].join("\n");
}

function buildTrackerBody(
  event: AgentStartEvent,
  targetKey: string,
  stack: StackLine[],
  maxStack: number,
): string {
  const kept = stack.slice(-maxStack);
  const lines = [
    `### ${event.seat} started`,
    "",
    event.ticketLine,
    `**Mode:** ${event.mode}`,
    `**Doing:** ${event.doing}`,
    "",
    `\`post_agent_started · ${event.at.toISOString()}\``,
  ];
  if (kept.length) {
    lines.push("", `Also started (${kept.length}):`);
    for (const row of kept) {
      lines.push(`- \`${row.at}\` ${row.mode} — ${row.doing}`);
    }
  }
  lines.push("", agentStartedMarker(event.seat, targetKey));
  return lines.join("\n");
}

function previousHeadlineToStack(
  parsed: ParsedBanner,
  fallbackAt: Date,
): StackLine {
  let clock = formatStackClock(fallbackAt);
  if (parsed.at) {
    const d = new Date(parsed.at);
    if (!Number.isNaN(d.getTime())) clock = formatStackClock(d);
  }
  return { at: clock, mode: parsed.mode, doing: parsed.doing };
}

export function findStackableComment<
  T extends { body: string; updatedAt: Date },
>(
  comments: T[],
  seat: string,
  targetKey: string,
  now: Date,
  sessionTtlMs = DEFAULT_SESSION_TTL_MS,
): T | null {
  const marked = comments.filter((c) => {
    const m = parseAgentStartedMarker(c.body);
    return m != null && m.seat === seat && m.targetKey === targetKey;
  });
  const candidates = marked.length
    ? marked
    : comments.filter((c) => {
        const p = parseAgentStartedBanner(c.body);
        return p != null && p.seat === seat;
      });
  if (!candidates.length) return null;
  const newest = [...candidates].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  )[0]!;
  if (now.getTime() - newest.updatedAt.getTime() > sessionTtlMs) return null;
  return newest;
}

export function decideAgentStartStack(opts: {
  existing: { body: string; updatedAt: Date } | null;
  event: AgentStartEvent;
  targetKey: string;
  now?: Date;
  sessionTtlMs?: number;
  maxStack?: number;
}): StackDecision {
  const now = opts.now ?? opts.event.at;
  const sessionTtlMs = opts.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  const maxStack = opts.maxStack ?? DEFAULT_MAX_STACK;
  const createBody = buildTrackerBody(opts.event, opts.targetKey, [], maxStack);

  if (
    !opts.existing ||
    now.getTime() - opts.existing.updatedAt.getTime() > sessionTtlMs
  ) {
    return { action: "create", body: createBody };
  }

  const parsed = parseAgentStartedBanner(opts.existing.body);
  if (!parsed) return { action: "create", body: createBody };
  if (sameStartEvent(parsed, opts.event)) {
    return {
      action: "skip",
      reason: "identical mode+doing within session",
      body: opts.existing.body,
    };
  }

  const nextStack = [
    ...parsed.stack,
    previousHeadlineToStack(parsed, opts.existing.updatedAt),
  ];
  return {
    action: "patch",
    body: buildTrackerBody(opts.event, opts.targetKey, nextStack, maxStack),
  };
}
