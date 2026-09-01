#!/usr/bin/env npx tsx
/**
 * Write projects/<slug>/factory/app-cursor.manifest from
 * project.yaml → app.mandatory_reads (+ forge defaults).
 *
 * Usage:
 *   npx tsx scripts/sync_app_cursor_manifest.ts <slug>
 *   npx tsx scripts/sync_app_cursor_manifest.ts <slug> --dry-run
 *
 * Exit 0 with empty manifest when mandatory_reads unset (no bind).
 * Exit 2 when mandatory_reads set but zero files resolve (misconfig).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatAppCursorManifest,
  resolveMandatoryReadPaths,
} from "../lib/appCursorBind.ts";
import { loadProjectConfig, resolveAppRoot } from "../lib/loadProject.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv[2];
const dry = process.argv.includes("--dry-run");

if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
  console.error("Usage: sync_app_cursor_manifest.ts <slug> [--dry-run]");
  process.exit(1);
}

const config = loadProjectConfig(ROOT, slug);
const reads = config.app.mandatory_reads;
const factoryDir = join(ROOT, "projects", slug, "factory");
const manifestPath = join(factoryDir, "app-cursor.manifest");

if (!reads || reads.length === 0) {
  if (!dry) {
    mkdirSync(factoryDir, { recursive: true });
    writeFileSync(manifestPath, "", "utf8");
  }
  console.log(
    JSON.stringify({
      ok: true,
      slug,
      bound: false,
      reason: "app.mandatory_reads unset or empty",
      paths: 0,
      manifest: manifestPath,
    }),
  );
  process.exit(0);
}

const appRoot = resolveAppRoot(ROOT, config);
const paths = resolveMandatoryReadPaths({
  engineRoot: ROOT,
  slug,
  appRoot,
  relativeReads: reads,
  includeForgeDefaults: true,
});

if (paths.length === 0) {
  console.error(
    JSON.stringify({
      ok: false,
      slug,
      error: "mandatory_reads set but no files resolved",
      appRoot,
      relativeReads: reads,
    }),
  );
  process.exit(2);
}

const body = formatAppCursorManifest(paths);
if (!dry) {
  mkdirSync(factoryDir, { recursive: true });
  writeFileSync(manifestPath, body, "utf8");
}

console.log(
  JSON.stringify({
    ok: true,
    slug,
    bound: true,
    paths: paths.length,
    manifest: manifestPath,
    dryRun: dry,
  }),
);
