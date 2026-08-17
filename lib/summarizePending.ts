/** Latch — Cursor stop hook must auto-submit `/summarize` after oneshot drain. */

export const PENDING_SUMMARIZE_PATH =
  ".cursor/dev-factory-pending-summarize.json" as const;

export const SUMMARIZE_FOLLOWUP_SENTINEL = "/summarize" as const;

export type PendingSummarizeState = {
  reason: string;
  issuedAt: string;
  consumed: boolean;
  slug?: string;
  ticket?: string;
};

/** Assistant text that means the Kairos/Hephaestus oneshot drain finished. */
const DONE_MARKERS = /\b(DEV_FACTORY_IDLE|LOOP_EXIT_IDLE)\b/;

/** Do not re-arm summarize from the summarize turn itself. */
const SKIP_MARKERS =
  /(\/summarize\b|SUMMARIZE_FOLLOWUP_DONE|context (was )?summar)/i;

export function buildPendingSummarizeState(input: {
  reason: string;
  slug?: string;
  ticket?: string;
}): PendingSummarizeState {
  return {
    reason: input.reason,
    issuedAt: new Date().toISOString(),
    consumed: false,
    ...(input.slug ? { slug: input.slug } : {}),
    ...(input.ticket ? { ticket: input.ticket } : {}),
  };
}

export function consumePendingSummarizeState(
  state: PendingSummarizeState,
): PendingSummarizeState {
  return { ...state, consumed: true };
}

export function shouldArmSummarizeFromAgentText(text: string): boolean {
  if (!text.trim()) return false;
  if (SKIP_MARKERS.test(text)) return false;
  return DONE_MARKERS.test(text);
}

export function formatSummarizeFollowup(state: PendingSummarizeState): string {
  const who = [state.slug, state.ticket].filter(Boolean).join(" ");
  const tail = who ? ` (${who})` : "";
  // Submitted as the next user message — Cursor treats leading /summarize as the slash command.
  return (
    `${SUMMARIZE_FOLLOWUP_SENTINEL}\n\n` +
    `Kairos/Hephaestus oneshot done${tail} — compact this chat now (token hygiene). ` +
    `No status essay. SUMMARIZE_FOLLOWUP_DONE`
  );
}

export function shouldForceSummarizeFollowup(input: {
  pending: PendingSummarizeState | null;
  loopCount: number;
  maxFollowups?: number;
}): { force: true; message: string } | { force: false } {
  const max = input.maxFollowups ?? 6;
  if (!input.pending || input.pending.consumed) return { force: false };
  if (input.loopCount >= max) return { force: false };
  return { force: true, message: formatSummarizeFollowup(input.pending) };
}
