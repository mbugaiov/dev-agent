#!/usr/bin/env tsx
/** Resolve app script path from project.yaml (with defaults). */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectConfig } from "../lib/loadProject.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULTS: Record<string, string> = {
  wait_pr_pipeline: "scripts/wait_pr_pipeline.sh",
  wait_main_deploy: "scripts/wait_main_deploy.sh",
  resolve_pr: "scripts/resolve_pr.sh",
};

const slug = process.argv[2] ?? "";
const key = process.argv[3] ?? "";
if (!slug || !key) {
  console.error("Usage: resolve_app_script.ts <slug> <wait_pr_pipeline|wait_main_deploy|resolve_pr>");
  process.exit(2);
}

const config = loadProjectConfig(ROOT, slug);
const app = config.app;
let path = DEFAULTS[key];
if (key === "wait_pr_pipeline" && app.wait_pr_pipeline_script) {
  path = app.wait_pr_pipeline_script;
} else if (key === "wait_main_deploy" && app.wait_main_deploy_script) {
  path = app.wait_main_deploy_script;
} else if (key === "resolve_pr" && app.resolve_pr_script) {
  path = app.resolve_pr_script;
}

if (!path) {
  console.error(`Unknown script key: ${key}`);
  process.exit(2);
}
console.log(path);
