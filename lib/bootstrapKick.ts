/**
 * Hephaestus demux for project-bootstrap parents.
 * Pure — no I/O. Aligns with pm-agent wbs_bootstrap.resolve_bootstrap_phase:
 * while project-bootstrap is open and WBS_READY is missing, do NOT implement —
 * strip pickup (impl-dev) and wake Chronos pm-bootstrap.
 */

export const PROJECT_BOOTSTRAP_LABEL = "project-bootstrap";
export const WBS_READY_SENTINEL = "WBS_READY";
export const WBS_DRAFT_READY_SENTINEL = "WBS_DRAFT_READY";

export type BootstrapDemuxInput = {
  labels?: string[];
  /** Pickup label from project.yaml (usually impl-dev). */
  pickupLabel?: string;
  /** true when tracker comments contain WBS_READY */
  wbsReady?: boolean;
  /** true when tracker comments contain WBS_DRAFT_READY (informational) */
  wbsDraftReady?: boolean;
};

function normalizeLabels(labels?: string[]): string[] {
  return (labels ?? []).map((l) => l.trim().toLowerCase()).filter(Boolean);
}

export function hasProjectBootstrapLabel(labels?: string[]): boolean {
  return normalizeLabels(labels).includes(PROJECT_BOOTSTRAP_LABEL);
}

export function isWbsReadyComment(commentText: string): boolean {
  return /(?:^|\n)\s*(?:##\s*)?WBS_READY\s*(?:\n|$)/.test(commentText);
}

export function isWbsDraftReadyComment(commentText: string): boolean {
  return /(?:^|\n)\s*(?:##\s*)?WBS_DRAFT_READY\s*(?:\n|$)/.test(commentText);
}

export function commentsHaveWbsReady(
  comments: ReadonlyArray<{ body: string }>,
): boolean {
  return comments.some((c) => isWbsReadyComment(c.body));
}

export function commentsHaveWbsDraftReady(
  comments: ReadonlyArray<{ body: string }>,
): boolean {
  return comments.some((c) => isWbsDraftReadyComment(c.body));
}

export type BootstrapDemuxResult = {
  /** Hephaestus must not implement; wake Chronos instead. */
  demux: boolean;
  /** Remove pickup label so Kairos does not re-arm Hephaestus on this parent. */
  stripPickup: boolean;
  phase: "demux" | "done" | "none";
  reasons: string[];
};

/**
 * - no project-bootstrap → none (normal impl path)
 * - project-bootstrap + WBS_READY → done (parent should not keep impl-dev)
 * - project-bootstrap + !WBS_READY → demux (kick Chronos; strip pickup if present)
 */
export function resolveBootstrapDemux(
  input: BootstrapDemuxInput,
): BootstrapDemuxResult {
  const labels = normalizeLabels(input.labels);
  const pickup = (input.pickupLabel ?? "impl-dev").trim().toLowerCase() || "impl-dev";
  const hasPickup = labels.includes(pickup);

  if (!hasProjectBootstrapLabel(labels)) {
    return { demux: false, stripPickup: false, phase: "none", reasons: [] };
  }

  if (input.wbsReady) {
    return {
      demux: false,
      stripPickup: hasPickup,
      phase: "done",
      reasons: ["label:project-bootstrap", "wbs:ready"],
    };
  }

  const reasons = ["label:project-bootstrap", "wbs:pending"];
  if (input.wbsDraftReady) reasons.push("wbs:draft-ready");
  if (hasPickup) reasons.push(`pickup:${pickup}`);

  return {
    demux: true,
    stripPickup: hasPickup,
    phase: "demux",
    reasons,
  };
}

export type BootstrapKickSentinel =
  | "BOOTSTRAP_DEMUX_YES"
  | "BOOTSTRAP_STRIP_YES"
  | "BOOTSTRAP_DEMUX_NO";

/** Exit/sentinel contract for should_kick_bootstrap → demux_project_bootstrap. */
export function resolveBootstrapKickSentinel(result: BootstrapDemuxResult): {
  sentinel: BootstrapKickSentinel;
  exitCode: 0 | 1;
  detail: string;
} {
  if (result.demux) {
    return {
      sentinel: "BOOTSTRAP_DEMUX_YES",
      exitCode: 0,
      detail:
        "strip pickup if present; wake Chronos (pm-bootstrap). Do NOT implement this parent.",
    };
  }
  if (result.phase === "done" && result.stripPickup) {
    return {
      sentinel: "BOOTSTRAP_STRIP_YES",
      exitCode: 0,
      detail:
        "WBS_READY present; strip leftover pickup only; do not implement parent epic.",
    };
  }
  if (result.phase === "done") {
    return {
      sentinel: "BOOTSTRAP_DEMUX_NO",
      exitCode: 1,
      detail: "WBS_READY present; no pickup to strip; do not implement parent epic",
    };
  }
  return {
    sentinel: "BOOTSTRAP_DEMUX_NO",
    exitCode: 1,
    detail: "skip bootstrap demux",
  };
}
