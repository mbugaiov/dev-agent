import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  formatSecretsEnvLintLine,
  lintSecretsEnv,
  parseSecretsEnv,
  stripSurroundingQuotes,
} from "../../lib/secretsEnvLint.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** Reproduces the silent-notify root cause: `&` in an unquoted webhook URL. */
const WEBHOOK_UNQUOTED =
  "DEV_FACTORY_TEAMS_WEBHOOK_URL=https://prod-1.westus.logic.azure.com/workflows/abc/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sig=SECRETSIG";

const WEBHOOK_QUOTED = `DEV_FACTORY_TEAMS_WEBHOOK_URL="https://prod-1.westus.logic.azure.com/workflows/abc/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sig=SECRETSIG"`;

describe("secretsEnvLint", () => {
  it("SE-01 flags unquoted value containing &", () => {
    const issues = lintSecretsEnv(WEBHOOK_UNQUOTED);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.name).toBe("DEV_FACTORY_TEAMS_WEBHOOK_URL");
    expect(issues[0]?.unsafeChars).toContain("&");
  });

  it("SE-02 accepts the same value when quoted", () => {
    expect(lintSecretsEnv(WEBHOOK_QUOTED)).toHaveLength(0);
  });

  it("SE-03 ignores comments, blanks, and safe values", () => {
    const content = [
      "# comment with & ampersand",
      "",
      "JIRA_BASE_URL=https://example.atlassian.net",
      "JIRA_EMAIL=user@example.com",
      "JIRA_API_TOKEN=ATATTabc123",
    ].join("\n");
    expect(lintSecretsEnv(content)).toHaveLength(0);
  });

  it("SE-04 flags other shell metacharacters and spaces", () => {
    const names = lintSecretsEnv(
      ["A=one;two", "B=a|b", "C=$(whoami)", "D=has space", "E=back`tick`"].join("\n"),
    ).map((i) => i.name);
    expect(names).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("SE-05 parseSecretsEnv preserves full value with & intact", () => {
    const entries = parseSecretsEnv(WEBHOOK_UNQUOTED);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.value).toContain("&sig=SECRETSIG");
    expect(entries[0]?.value).toContain("&sp=");
  });

  it("SE-06 parseSecretsEnv strips quotes and honors export prefix", () => {
    const entries = parseSecretsEnv(
      ['export FOO="bar baz"', "QUX='single'", "PLAIN=value"].join("\n"),
    );
    expect(entries).toEqual([
      { name: "FOO", value: "bar baz" },
      { name: "QUX", value: "single" },
      { name: "PLAIN", value: "value" },
    ]);
    expect(stripSurroundingQuotes('"x"')).toBe("x");
    expect(stripSurroundingQuotes('"a" + "b"')).toBe('"a" + "b"');
  });

  it("SE-07 lint line is a loud structured sentinel", () => {
    const line = formatSecretsEnvLintLine("jira.env", lintSecretsEnv(WEBHOOK_UNQUOTED));
    expect(line).toMatch(/^SECRETS_ENV_UNSAFE /);
    expect(line).toContain("DEV_FACTORY_TEAMS_WEBHOOK_URL");
    expect(line).toContain("remediation");
    expect(line).not.toContain("SECRETSIG");
  });

  it("SE-08 source_project_secrets.sh loads unquoted & URL without truncation", () => {
    const dir = mkdtempSync(join(tmpdir(), "sps-"));
    const slug = "selftestsecrets";
    const secretsDir = join(ROOT, "projects", slug, ".secrets");
    execFileSync("mkdir", ["-p", secretsDir]);
    writeFileSync(
      join(secretsDir, "jira.env"),
      `JIRA_BASE_URL=https://example.atlassian.net\n${WEBHOOK_UNQUOTED}\n`,
      "utf8",
    );

    try {
      const out = execFileSync(
        "bash",
        [
          "-c",
          `source scripts/source_project_secrets.sh ${slug} 2>"${join(dir, "err")}"; ` +
            `echo "len=\${#DEV_FACTORY_TEAMS_WEBHOOK_URL}"; ` +
            `echo "hassig=\$([[ \\"\$DEV_FACTORY_TEAMS_WEBHOOK_URL\\" == *sig=* ]] && echo yes || echo no)"`,
        ],
        { cwd: ROOT, encoding: "utf8" },
      );

      expect(out).toContain("hassig=yes");
      const len = Number(/len=(\d+)/.exec(out)?.[1] ?? "0");
      expect(len).toBeGreaterThan(100);

      // Warning must be emitted, not swallowed.
      expect(readFileSync(join(dir, "err"), "utf8")).toContain("SECRETS_ENV_UNSAFE");
    } finally {
      execFileSync("rm", ["-rf", join(ROOT, "projects", slug)]);
    }
  });

  it("SE-09 lint_secrets_env.ts exits non-zero on unsafe file", () => {
    const dir = mkdtempSync(join(tmpdir(), "lint-"));
    const file = join(dir, "jira.env");
    writeFileSync(file, `${WEBHOOK_UNQUOTED}\n`, "utf8");

    let status = 0;
    try {
      execFileSync("npx", ["tsx", "scripts/lint_secrets_env.ts", file], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      status = (err as { status?: number }).status ?? 1;
    }
    expect(status).toBe(1);
  });

  it("SE-10 explicit slug arg wins over stale DEV_AGENT_SLUG", () => {
    const out = execFileSync(
      "bash",
      [
        "-c",
        'export DEV_AGENT_SLUG=lrm; source scripts/source_project_secrets.sh mahogany; echo "SLUG=$SLUG"',
      ],
      { cwd: ROOT, encoding: "utf8" },
    );
    expect(out.trim()).toBe("SLUG=mahogany");
  });
});
