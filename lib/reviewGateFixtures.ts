/** Review-gate fixture expectations. Pure — no I/O. */

export type ReviewGateExpectation = "pass" | "fail";

export const REVIEW_GATE_FIXTURES: Record<string, ReviewGateExpectation> = {
  "lgtm.md": "pass",
  "blocking-none.md": "pass",
  "blocking-items.md": "fail",
  "no-output.md": "fail",
  "unstructured-error.md": "fail",
  "empty-blocking-section.md": "fail",
  "missing-blocking-header.md": "fail",
  "false-lgtm-after-blockers.md": "fail",
};

export function reviewGateFixtureExpectation(
  filename: string,
): ReviewGateExpectation | undefined {
  return REVIEW_GATE_FIXTURES[filename];
}
