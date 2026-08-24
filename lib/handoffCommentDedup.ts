/**
 * Skip posting a second STG handoff when the same buildId is already on the ticket.
 * Guards fan-out from duplicate Hephaestus oneshots (#425-style comment floods).
 */

const BUILD_ID_RE = /STG buildId:\s*([0-9a-f]{7,40})/i;

export function extractStgBuildIds(commentBody: string): string[] {
  const out: string[] = [];
  const re = new RegExp(BUILD_ID_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(commentBody))) {
    const sha = (m[1] || "").toLowerCase();
    if (sha) out.push(sha);
  }
  return out;
}

export function shaPrefixMatch(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (x.length < 7 || y.length < 7) return false;
  return x === y || x.startsWith(y) || y.startsWith(x);
}

export function commentsAlreadyHaveStgHandoff(
  comments: { body?: string }[],
  stgBuildId: string,
): boolean {
  const want = stgBuildId.trim().toLowerCase();
  if (want.length < 7) return false;
  for (const c of comments) {
    for (const got of extractStgBuildIds(c.body || "")) {
      if (shaPrefixMatch(got, want)) return true;
    }
  }
  return false;
}
