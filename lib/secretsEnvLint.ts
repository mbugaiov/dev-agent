// Secrets env-file linting + safe parsing.
//
// Unquoted values containing shell metacharacters (notably `&` in webhook URLs)
// break `source`: bash splits the assignment at the metacharacter and the
// variable arrives empty, which previously failed silently downstream.

/** Characters that change shell parsing when a value is left unquoted. */
export const SHELL_UNSAFE_CHARS = ["&", "|", ";", "<", ">", "(", ")", "`", "$", "#", " ", "\t"] as const;

export type EnvLintIssue = {
  line: number;
  name: string;
  reason: string;
  unsafeChars: string[];
};

export type EnvEntry = { name: string; value: string };

const ASSIGNMENT_RE = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

function isFullyQuoted(value: string): boolean {
  if (value.length < 2) return false;
  const first = value[0];
  const last = value[value.length - 1];
  if (first !== '"' && first !== "'") return false;
  if (first !== last) return false;
  // A closing quote in the middle means the value is only partially quoted.
  return !value.slice(1, -1).includes(first);
}

function unsafeCharsIn(value: string): string[] {
  return SHELL_UNSAFE_CHARS.filter((c) => value.includes(c));
}

/** Strip one layer of matching surrounding quotes. */
export function stripSurroundingQuotes(value: string): string {
  return isFullyQuoted(value) ? value.slice(1, -1) : value;
}

/**
 * Report lines whose unquoted value would be mangled by `source`.
 * Comments, blank lines, and quoted values are ignored.
 */
export function lintSecretsEnv(content: string): EnvLintIssue[] {
  const issues: EnvLintIssue[] = [];
  const lines = content.split("\n");

  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;

    const match = line.match(ASSIGNMENT_RE);
    if (!match) return;

    const [, name, rawValue] = match;
    if (!name || rawValue === undefined) return;
    if (isFullyQuoted(rawValue)) return;

    const unsafe = unsafeCharsIn(rawValue);
    if (unsafe.length === 0) return;

    issues.push({
      line: index + 1,
      name,
      reason: `unquoted value contains shell metacharacter(s) ${unsafe
        .map((c) => (c === " " ? "<space>" : c === "\t" ? "<tab>" : c))
        .join(" ")} — wrap the value in double quotes`,
      unsafeChars: unsafe,
    });
  });

  return issues;
}

/**
 * Parse an env file without shell evaluation, so metacharacters survive intact.
 * This is the read path that makes the `&`-truncation class impossible.
 */
export function parseSecretsEnv(content: string): EnvEntry[] {
  const entries: EnvEntry[] = [];

  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(ASSIGNMENT_RE);
    if (!match) continue;

    const [, name, rawValue] = match;
    if (!name || rawValue === undefined) continue;

    entries.push({ name, value: stripSurroundingQuotes(rawValue) });
  }

  return entries;
}

export function formatSecretsEnvLintLine(
  file: string,
  issues: EnvLintIssue[],
): string {
  return `SECRETS_ENV_UNSAFE ${JSON.stringify({
    file,
    issues: issues.map((i) => ({ line: i.line, name: i.name, reason: i.reason })),
    remediation:
      "Quote the value: VAR=\"https://host/path?a=1&b=2\". Unquoted values are truncated on source and fail silently.",
  })}`;
}
