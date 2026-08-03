/**
 * Decide whether Hephaestus should wake Hermes (BA) before implement.
 * Pure — no I/O. No human approval: BA_SPEC_READY is posted by Hermes after lint+critique.
 */

export const BA_SPEC_FIRST_LABEL = "ba-spec-first";
export const BA_SPEC_READY_SENTINEL = "BA_SPEC_READY";

export type BaKickInput = {
  labels?: string[];
  /** true when tracker comments contain BA_SPEC_READY */
  specReady?: boolean;
};

function normalizeLabels(labels?: string[]): string[] {
  return (labels ?? []).map((l) => l.trim().toLowerCase()).filter(Boolean);
}

export function hasBaSpecFirstLabel(labels?: string[]): boolean {
  return normalizeLabels(labels).includes(BA_SPEC_FIRST_LABEL);
}

export function isBaSpecReadyComment(commentText: string): boolean {
  // Require a dedicated sentinel line — not prose mentioning BA_SPEC_READY.
  // Matches: "BA_SPEC_READY" alone, or "## BA_SPEC_READY", optional trailing punctuation.
  return /(?:^|\n)\s*(?:##\s*)?BA_SPEC_READY\s*(?:\n|$)/.test(commentText);
}

export function commentsHaveBaSpecReady(
  comments: ReadonlyArray<{ body: string }>,
): boolean {
  return comments.some((c) => isBaSpecReadyComment(c.body));
}

/**
 * before-implement gate for ba-spec-first:
 * - label missing → no kick (proceed)
 * - label + !ready → kick Hermes
 * - label + ready → no kick (proceed to OpenSpec / UX / implement)
 */
export function resolveBaFactoryPhase(input: BaKickInput): {
  phase: "spec" | "none";
  kick: boolean;
  reasons: string[];
} {
  if (!hasBaSpecFirstLabel(input.labels)) {
    return { phase: "none", kick: false, reasons: [] };
  }
  if (input.specReady) {
    return {
      phase: "none",
      kick: false,
      reasons: ["label:ba-spec-first", "spec:ready"],
    };
  }
  return {
    phase: "spec",
    kick: true,
    reasons: ["label:ba-spec-first", "spec:pending"],
  };
}
