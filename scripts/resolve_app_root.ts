#!/usr/bin/env tsx
/** Print absolute app repo root for projects/<slug>/project.yaml → app.repo_path */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectConfig, resolveAppRoot } from "../lib/loadProject.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv[2] ?? process.env.DEV_AGENT_SLUG ?? "";
if (!slug) {
  console.error("Usage: resolve_app_root.ts <slug>");
  process.exit(2);
}
console.log(resolveAppRoot(ROOT, loadProjectConfig(ROOT, slug)));
