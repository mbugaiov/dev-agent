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

const UX_LABELS = new Set(["needs-ux-pass", "impl-ux"]);

export type UxKickInput = {
  labels?: string[];
  /** Comma-separated or list of primary surfaces / paths from the ticket. */
  surfaces?: string[];
  /** Paths from git diff vs default branch. */
  diffPaths?: string[];
  /** Override globs (from project.yaml ux_kick.ui_path_globs). */
  uiPathGlobs?: string[];
};

function norm(s: string): string {
  return s.trim().replace(/\\/g, "/");
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

export function shouldKickUx(input: UxKickInput): {
  kick: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const globs = input.uiPathGlobs?.length
    ? input.uiPathGlobs
    : [...DEFAULT_UI_PATH_GLOBS];

  const labels = (input.labels ?? []).map((l) => l.toLowerCase());
  for (const l of labels) {
    if (UX_LABELS.has(l)) {
      reasons.push(`label:${l}`);
    }
  }

  const surfaces = (input.surfaces ?? []).map(norm).filter(Boolean);
  for (const s of surfaces) {
    if (pathLooksLikeUi(s, globs)) {
      reasons.push(`surface:${s}`);
    }
  }

  const diffs = (input.diffPaths ?? []).map(norm).filter(Boolean);
  for (const d of diffs) {
    if (pathLooksLikeUi(d, globs)) {
      reasons.push(`diff:${d}`);
      break; // one diff hit is enough signal
    }
  }

  return { kick: reasons.length > 0, reasons };
}
