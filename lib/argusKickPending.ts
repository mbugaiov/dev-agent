/** Hephaestus latch — force Argus Task after handoff until acked. */

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
    `ARGUS_KICK_EXECUTE: After handoff, wake Argus NOW for ${input.ticket} ` +
    `(slug ${input.slug}). Spawn Cursor Task → qa-agent skill qa-loop / ` +
    `BACKLOG_WAKE_EXECUTE equivalent: ` +
    `cd qa-agent → eval "$(bash scripts/qa_scope.sh ${input.slug} --log --shell)" → ` +
    `drain validate-testing → backlog_drained. ` +
    `Then: npx tsx scripts/ack_argus_kick.ts --ticket ${input.ticket}. ` +
    `Forbidden: end turn on GITHUB_HANDOFF_OK / label-only without Argus wake.`
  );
}

export function consumePendingArgusKickState(
  state: PendingArgusKickState,
): PendingArgusKickState {
  return { ...state, consumed: true };
}

export function shouldForceArgusKickFollowup(input: {
  pending: PendingArgusKickState | null;
  loopCount: number;
  maxFollowups?: number;
}): { force: true; message: string } | { force: false } {
  const max = input.maxFollowups ?? 5;
  if (!input.pending || input.pending.consumed) return { force: false };
  if (input.loopCount >= max) return { force: false };
  return {
    force: true,
    message:
      `${input.pending.executePrompt} ` +
      `Handoff already moved ${input.pending.ticket} to validate-testing. ` +
      `Spawn Argus Task this turn — do not wait for arm_qa_loop timer.`,
  };
}
