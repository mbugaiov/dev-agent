#!/usr/bin/env tsx
/** Print loop interval seconds from project.yaml (or 300 default). */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectConfig } from "../lib/loadProject.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv[2] ?? process.env.DEV_AGENT_SLUG ?? "";
if (!slug) {
  console.error("Usage: resolve_loop_interval.ts <slug>");
  process.exit(2);
}

const interval = loadProjectConfig(ROOT, slug).loop.interval_sec_default ?? 300;
console.log(interval);
