// Parse Cursor review output for blocking issues. Pure — no I/O.

const LGTM_LINE = /^LGTM - no blocking issues found\.?\s*$/i;
const NO_OUTPUT_PLACEHOLDER =
  /^Cursor review produced no output \(see build log above\)\.\s*$/i;

/** True when the entire review body is the LGTM single-line shortcut. */
export function isLgtmOnly(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && !trimmed.includes("\n") && LGTM_LINE.test(trimmed);
}

/** Extract body of the `## Blocking issues` section, or null if absent. */
export function extractBlockingSection(text: string): string | null {
  const lines = text.split("\n");
  let inSection = false;
  const body: string[] = [];
  for (const line of lines) {
    if (/^## Blocking issues\s*$/i.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^## /.test(line)) break;
    if (inSection) body.push(line);
  }
  if (!inSection) return null;
  return body.join("\n").trim();
}

/** True when review output reports blocking issues that must fail the pipeline. */
export function reviewHasBlockers(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (isLgtmOnly(trimmed)) return false;
  if (NO_OUTPUT_PLACEHOLDER.test(trimmed)) return true;

  const section = extractBlockingSection(text);
  if (section === null) return true;
  if (/^None\.?\s*$/i.test(section)) return false;
  if (section.length === 0) return true;

  return true;
}
