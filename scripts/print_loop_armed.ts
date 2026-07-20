#!/usr/bin/env tsx
/** Print LOOP_ARMED line — single source of truth in devFactoryLoopWiring. */
import { loadProjectConfig } from "../lib/loadProject.ts";
import { formatLoopArmLine } from "../lib/devFactoryLoopWiring.ts";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv[2] ?? process.env.DEV_AGENT_SLUG ?? "";
const interval = Number(
  process.argv[3] ??
    process.env.DEV_LOOP_INTERVAL_SEC ??
    process.env[`${slug.toUpperCase()}_LOOP_INTERVAL_SEC`] ??
    300,
);

if (!slug) {
  console.error("Usage: print_loop_armed.ts <slug> [intervalSec]");
  process.exit(1);
}

const config = loadProjectConfig(ROOT, slug);
console.log(formatLoopArmLine(slug, interval, config.loop.purpose));
