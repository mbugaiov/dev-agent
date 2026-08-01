/**
 * Decide whether Hephaestus should wake an Athena UX subagent for a ticket.
 * Pure — no I/O. Used by scripts/should_kick_ux.ts and unit tests.
 */

export const DEFAULT_UI_PATH_GLOBS = [
  "components/",
  "app/",
  "lib/ui.ts",
  "DESIGN.md",
  "public/",
  ".css",
  ".module.css",
] as const;

/** Post-implement polish / audit kick labels. */
const UX_POLISH_LABELS = new Set(["needs-ux-pass", "impl-ux"]);

/**
 * Full redesign / IA before feature implement.
 * With this label, Hephaestus must charter-kick Athena before coding UI.
 */
export const UX_CHARTER_FIRST_LABEL = "ux-charter-first";

/** Athena posts this sentinel in a Jira comment when Mode B charter is done. */
export const UX_CHARTER_READY_SENTINEL = "UX_CHARTER_READY";

export type UxKickWhen = "before-implement" | "after-implement";

export type UxKickPhase = "charter" | "polish" | "none";

export type UxKickInput = {
  labels?: string[];
  /** Comma-separated or list of primary surfaces / paths from the ticket. */
  surfaces?: string[];
  /** Paths from git diff vs default branch. */
  diffPaths?: string[];
  /** Override globs (from project.yaml ux_kick.ui_path_globs). */
  uiPathGlobs?: string[];
  /**
   * true when any Jira comment contains UX_CHARTER_READY.
   * Required for before-implement charter gating when label is present.
   */
  charterReady?: boolean;
  /** Factory phase — default after-implement (backward compatible). */
  when?: UxKickWhen;
};

function norm(s: string): string {
  return s.trim().replace(/\\/g, "/");
}

function normalizeLabels(labels?: string[]): string[] {
  return (labels ?? []).map((l) => l.trim().toLowerCase()).filter(Boolean);
}

export function hasUxCharterFirstLabel(labels?: string[]): boolean {
  return normalizeLabels(labels).includes(UX_CHARTER_FIRST_LABEL);
}

export function isUxCharterReadyComment(commentText: string): boolean {
  return new RegExp(`\\b${UX_CHARTER_READY_SENTINEL}\\b`).test(commentText);
}

export function commentsHaveUxCharterReady(
  comments: ReadonlyArray<{ body: string }>,
): boolean {
  return comments.some((c) => isUxCharterReadyComment(c.body));
}

export function pathLooksLikeUi(path: string, globs: readonly string[]): boolean {
  const p = norm(path).toLowerCase();
  if (!p) return false;
  for (const g of globs) {
    const gNorm = norm(g).toLowerCase();
    if (!gNorm) continue;
    if (gNorm.startsWith(".") && p.endsWith(gNorm)) return true;
    if (p.includes(gNorm)) return true;
  }
  return false;
}

function polishReasons(input: UxKickInput): string[] {
  const reasons: string[] = [];
  const globs = input.uiPathGlobs?.length
    ? input.uiPathGlobs
    : [...DEFAULT_UI_PATH_GLOBS];

  for (const l of normalizeLabels(input.labels)) {
    if (UX_POLISH_LABELS.has(l)) {
      reasons.push(`label:${l}`);
    }
  }

  for (const s of (input.surfaces ?? []).map(norm).filter(Boolean)) {
    if (pathLooksLikeUi(s, globs)) {
      reasons.push(`surface:${s}`);
    }
  }

  for (const d of (input.diffPaths ?? []).map(norm).filter(Boolean)) {
    if (pathLooksLikeUi(d, globs)) {
      reasons.push(`diff:${d}`);
      break;
    }
  }

  return reasons;
}

/**
 * Resolve factory UX phase.
 *
 * before-implement + ux-charter-first + !charterReady → charter kick
 * before-implement + ux-charter-first + charterReady → none (proceed to implement)
 * after-implement → polish when needs-ux-pass / impl-ux / UI surfaces/diff
 */
export function resolveUxFactoryPhase(input: UxKickInput): {
  phase: UxKickPhase;
  kick: boolean;
  reasons: string[];
  mode: "charter" | "hephaestus-kick" | null;
} {
  const when = input.when ?? "after-implement";
  const charterFirst = hasUxCharterFirstLabel(input.labels);

  if (when === "before-implement") {
    if (!charterFirst) {
      return { phase: "none", kick: false, reasons: [], mode: null };
    }
    if (input.charterReady) {
      return {
        phase: "none",
        kick: false,
        reasons: ["label:ux-charter-first", "charter:ready"],
        mode: null,
      };
    }
    return {
      phase: "charter",
      kick: true,
      reasons: ["label:ux-charter-first", "charter:pending"],
      mode: "charter",
    };
  }

  // after-implement — polish (Mode A)
  const reasons = polishReasons(input);
  if (reasons.length === 0) {
    return { phase: "none", kick: false, reasons: [], mode: null };
  }
  return {
    phase: "polish",
    kick: true,
    reasons,
    mode: "hephaestus-kick",
  };
}

/** @deprecated Prefer resolveUxFactoryPhase — kept for polish detection. */
export function shouldKickUx(input: UxKickInput): {
  kick: boolean;
  reasons: string[];
} {
  const r = resolveUxFactoryPhase({ ...input, when: "after-implement" });
  return { kick: r.kick, reasons: r.reasons };
}
