#!/usr/bin/env tsx
/**
 * CI guard — dev factory must remain execution-only (no inform-only backlog wakes).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scanEngineExecutionOnlyPolicy } from "../lib/devFactoryExecutionOnly.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const result = scanEngineExecutionOnlyPolicy((rel) =>
  readFileSync(join(ROOT, rel), "utf8"),
);

if (!result.ok) {
  console.error("EXECUTION_ONLY_POLICY_FAILED");
  for (const v of result.violations) {
    console.error(`  ${v.file}: ${v.reason}`);
  }
  process.exit(1);
}

console.log("EXECUTION_ONLY_POLICY_OK");
