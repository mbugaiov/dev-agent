/**
 * Decide whether Hephaestus should wake Argus (QA) after Validate/Testing handoff.
 * Pure — no I/O. Mirrors BA/UX kicks: handoff success → kick, not timer-only.
 */

export type QaKickInput = {
  /** true when post_*_handoff just succeeded (label validate-testing / status Validate/Testing) */
  handoffOk?: boolean;
  /** optional: skip kick when operator passes --no-qa-kick */
  suppress?: boolean;
};

export function resolveQaHandoffKick(input: QaKickInput): {
  kick: boolean;
  reasons: string[];
} {
  if (input.suppress) {
    return { kick: false, reasons: ["suppress"] };
  }
  if (!input.handoffOk) {
    return { kick: false, reasons: ["handoff:pending"] };
  }
  return {
    kick: true,
    reasons: ["handoff:ok", "argus:validate-testing"],
  };
}

/** Sentinel line Hephaestus / arm scripts can grep after handoff. */
export const QA_KICK_YES = "QA_KICK_YES";
export const QA_KICK_NO = "QA_KICK_NO";
