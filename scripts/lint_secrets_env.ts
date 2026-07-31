#!/usr/bin/env tsx
/**
 * Lint a secrets env file for unquoted values containing shell metacharacters.
 * Usage: npx tsx scripts/lint_secrets_env.ts <file...>
 * Exit 1 when any file has issues.
 */
import { existsSync, readFileSync } from "node:fs";
import {
  formatSecretsEnvLintLine,
  lintSecretsEnv,
} from "../lib/secretsEnvLint.ts";

const files = process.argv.slice(2);

if (files.length === 0) {
  console.error("Usage: lint_secrets_env.ts <file...>");
  process.exit(2);
}

let failed = false;

for (const file of files) {
  if (!existsSync(file)) continue;
  const issues = lintSecretsEnv(readFileSync(file, "utf8"));
  if (issues.length > 0) {
    failed = true;
    console.error(formatSecretsEnvLintLine(file, issues));
  }
}

if (failed) process.exit(1);
console.log("SECRETS_ENV_OK");
