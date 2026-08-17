/** Hephaestus latch — Argus oneshot after handoff until acked. */

export const PENDING_ARGUS_KICK_PATH = ".cursor/dev-factory-pending-argus-kick.json";

export type PendingArgusKickState = {
  slug: string;
  ticket: string;
  issuedAt: string;
  consumed: boolean;
  /** Path to qa-agent root used for the hard kick (informational). */
  qaAgentRoot?: string;
  executePrompt: string;
};

export function buildPendingArgusKickState(input: {
  slug: string;
  ticket: string;
  qaAgentRoot?: string;
}): PendingArgusKickState {
  return {
    slug: input.slug,
    ticket: input.ticket,
    issuedAt: new Date().toISOString(),
    consumed: false,
    qaAgentRoot: input.qaAgentRoot,
    executePrompt: formatArgusKickPrompt(input),
  };
}

export function formatArgusKickPrompt(input: {
  slug: string;
  ticket: string;
}): string {
  return (
    `ARGUS_KICK_EXECUTE: After handoff, ensure isolated Argus oneshot for ${input.ticket} ` +
    `(slug ${input.slug}) via qa-agent scripts/ensure_argus.sh — NOT Task/hooks in ambient IDE chats. ` +
    `Pending latch is auto-acked when oneshot arms (or ack: npx tsx scripts/ack_argus_kick.ts --ticket ${input.ticket}). ` +
    `Forbidden: end turn on GITHUB_HANDOFF_OK / label-only without ensure_argus; ` +
    `forbidden: inject ARGUS_KICK into personal/neighbor Composer sessions.`
  );
}

export function consumePendingArgusKickState(
  state: PendingArgusKickState,
): PendingArgusKickState {
  return { ...state, consumed: true };
}

/**
 * Stop-hook followup for Argus kick is disabled — wake is oneshot-only.
 * Kept for unit tests / explicit callers that still want the message text.
 */
export function shouldForceArgusKickFollowup(input: {
  pending: PendingArgusKickState | null;
  loopCount: number;
  maxFollowups?: number;
  /** When false (default), never force — ambient chats must not get ARGUS_KICK. */
  enableHookFollowup?: boolean;
}): { force: true; message: string } | { force: false } {
  if (!input.enableHookFollowup) return { force: false };
  const max = input.maxFollowups ?? 5;
  if (!input.pending || input.pending.consumed) return { force: false };
  if (input.loopCount >= max) return { force: false };
  return {
    force: true,
    message:
      `${input.pending.executePrompt} ` +
      `Handoff already moved ${input.pending.ticket} to validate-testing. ` +
      `Run ensure_argus oneshot this turn — do not wait for arm_qa_loop timer.`,
  };
}
