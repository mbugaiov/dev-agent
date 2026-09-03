/**
 * Living ### <Seat> progress comment per seat+ticket (GitHub/Jira).
 * Mid-flight milestones: MR opened, pipeline waiting/failed/retry/green, STG, handoff.
 * Identical status+detail within session is skipped; new status PATCHes and stacks.
 */
export const DEFAULT_PROGRESS_SESSION_TTL_MS = 6 * 60 * 60 * 1000;
export const DEFAULT_PROGRESS_MAX_STACK = 16;

/** Canonical milestone ids used by wait scripts + skills. */
export const PROGRESS_MILESTONES = [
  "mr_opened",
  "pipeline_waiting",
  "pipeline_failed",
  "pipeline_retry",
  "pipeline_green",
  "stg_verify",
  "handoff",
] as const;

export type ProgressMilestone = (typeof PROGRESS_MILESTONES)[number];

export type AgentProgressEvent = {
  seat: string;
  ticketLine: string;
  /** Short status label (often the milestone id or humanized). */
  status: string;
  detail: string;
  at: Date;
};

export type ProgressStackLine = { at: string; status: string; detail: string };

export type ProgressStackDecision =
  | { action: "create"; body: string }
  | { action: "skip"; reason: string; body: string }
  | { action: "patch"; body: string };

export type MarkerStyle = "html" | "code";

function sanitizeToken(s: string): string {
  return s.replace(/[^\w.#:+-]/g, "_");
}

export function agentProgressMarker(
  seat: string,
  targetKey: string,
  style: MarkerStyle = "html",
): string {
  const token = `agent-progress:${sanitizeToken(seat)}:${sanitizeToken(targetKey)}`;
  return style === "code" ? `\`${token}\`` : `<!-- ${token} -->`;
}

const HTML_MARKER_RE =
  /<!--\s*agent-progress:([^:\s]+):([^\s>]+)\s*-->/;
const CODE_MARKER_RE = /`agent-progress:([^:`\s]+):([^`\s]+)`/;
const BARE_MARKER_RE = /(?:^|\n)agent-progress:([^:\s]+):([^\s]+)(?:\n|$)/;

export function parseAgentProgressMarker(
  body: string,
): { seat: string; targetKey: string } | null {
  const m =
    body.match(HTML_MARKER_RE) ??
    body.match(CODE_MARKER_RE) ??
    body.match(BARE_MARKER_RE);
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
  const m = body.match(/^(?:#{1,3}\s+)?(.+?) progress\s*$/m);
  return m ? m[1]!.trim() : null;
}

function parseFooterAt(body: string): string | null {
  const m = body.match(/post_agent_progress\s*·\s*([0-9T:.\-Z]+)/);
  return m ? m[1]!.trim() : null;
}

function parseStackLines(body: string): ProgressStackLine[] {
  const lines: ProgressStackLine[] = [];
  const re = /^[-\s]*`?(\d{2}:\d{2}Z)`?\s+(.+?)\s+—\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    lines.push({ at: m[1]!, status: m[2]!.trim(), detail: m[3]!.trim() });
  }
  return lines;
}

export type ParsedProgressBanner = {
  seat: string;
  status: string;
  detail: string;
  at: string | null;
  stack: ProgressStackLine[];
};

export function parseAgentProgressBanner(
  body: string,
): ParsedProgressBanner | null {
  const seat = parseHeadingSeat(body);
  const status = lineValue(body, "Status");
  const detail = lineValue(body, "Detail");
  if (!seat || status == null || detail == null) return null;
  return {
    seat,
    status,
    detail,
    at: parseFooterAt(body),
    stack: parseStackLines(body),
  };
}

export function normalizeProgressText(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

export function sameProgressEvent(
  a: { status: string; detail: string },
  b: { status: string; detail: string },
): boolean {
  return (
    normalizeProgressText(a.status) === normalizeProgressText(b.status) &&
    normalizeProgressText(a.detail) === normalizeProgressText(b.detail)
  );
}

export function formatProgressStackClock(at: Date): string {
  return `${at.toISOString().slice(11, 16)}Z`;
}

export function humanizeMilestone(m: string): string {
  return m.replace(/_/g, " ");
}

export function isProgressMilestone(s: string): s is ProgressMilestone {
  return (PROGRESS_MILESTONES as readonly string[]).includes(s);
}

export function buildProgressChatBanner(event: AgentProgressEvent): string {
  return [
    `### ${event.seat} progress`,
    "",
    event.ticketLine,
    `**Status:** ${event.status}`,
    `**Detail:** ${event.detail}`,
    "",
    `\`post_agent_progress · ${event.at.toISOString()}\``,
  ].join("\n");
}

function buildTrackerBody(
  event: AgentProgressEvent,
  targetKey: string,
  stack: ProgressStackLine[],
  maxStack: number,
  markerStyle: MarkerStyle,
): string {
  const kept = stack.slice(-maxStack);
  const lines = [
    `### ${event.seat} progress`,
    "",
    event.ticketLine,
    `**Status:** ${event.status}`,
    `**Detail:** ${event.detail}`,
    "",
    `\`post_agent_progress · ${event.at.toISOString()}\``,
  ];
  if (kept.length) {
    // Bitbucket Python-Markdown needs a blank line before a list (unlike
    // GitHub/CommonMark). Without it, "- …" collapses into one paragraph.
    lines.push("", `Earlier (${kept.length}):`, "");
    for (const row of kept) {
      lines.push(`- \`${row.at}\` ${row.status} — ${row.detail}`);
    }
  }
  lines.push("", agentProgressMarker(event.seat, targetKey, markerStyle));
  return lines.join("\n");
}

function previousHeadlineToStack(
  parsed: ParsedProgressBanner,
  fallbackAt: Date,
): ProgressStackLine {
  let clock = formatProgressStackClock(fallbackAt);
  if (parsed.at) {
    const d = new Date(parsed.at);
    if (!Number.isNaN(d.getTime())) clock = formatProgressStackClock(d);
  }
  return { at: clock, status: parsed.status, detail: parsed.detail };
}

export function findProgressStackableComment<
  T extends { body: string; updatedAt: Date },
>(
  comments: T[],
  seat: string,
  targetKey: string,
  now: Date,
  sessionTtlMs = DEFAULT_PROGRESS_SESSION_TTL_MS,
): T | null {
  const marked = comments.filter((c) => {
    const m = parseAgentProgressMarker(c.body);
    return m != null && m.seat === seat && m.targetKey === targetKey;
  });
  const candidates = marked.length
    ? marked
    : comments.filter((c) => {
        const p = parseAgentProgressBanner(c.body);
        return p != null && p.seat === seat;
      });
  if (!candidates.length) return null;
  const newest = [...candidates].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  )[0]!;
  if (now.getTime() - newest.updatedAt.getTime() > sessionTtlMs) return null;
  return newest;
}

export function decideAgentProgressStack(opts: {
  existing: { body: string; updatedAt: Date } | null;
  event: AgentProgressEvent;
  targetKey: string;
  now?: Date;
  sessionTtlMs?: number;
  maxStack?: number;
  markerStyle?: MarkerStyle;
}): ProgressStackDecision {
  const now = opts.now ?? opts.event.at;
  const sessionTtlMs = opts.sessionTtlMs ?? DEFAULT_PROGRESS_SESSION_TTL_MS;
  const maxStack = opts.maxStack ?? DEFAULT_PROGRESS_MAX_STACK;
  const markerStyle = opts.markerStyle ?? "html";
  const createBody = buildTrackerBody(
    opts.event,
    opts.targetKey,
    [],
    maxStack,
    markerStyle,
  );

  if (
    !opts.existing ||
    now.getTime() - opts.existing.updatedAt.getTime() > sessionTtlMs
  ) {
    return { action: "create", body: createBody };
  }

  const parsed = parseAgentProgressBanner(opts.existing.body);
  if (!parsed) return { action: "create", body: createBody };
  if (parsed.seat !== opts.event.seat) {
    return { action: "create", body: createBody };
  }
  if (sameProgressEvent(parsed, opts.event)) {
    return {
      action: "skip",
      reason: "identical status+detail within session",
      body: opts.existing.body,
    };
  }

  const nextStack = [
    ...parsed.stack,
    previousHeadlineToStack(parsed, opts.existing.updatedAt),
  ];
  return {
    action: "patch",
    body: buildTrackerBody(
      opts.event,
      opts.targetKey,
      nextStack,
      maxStack,
      markerStyle,
    ),
  };
}
