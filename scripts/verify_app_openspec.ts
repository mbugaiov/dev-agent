#!/usr/bin/env npx tsx
/** Verify OpenSpec is installed in the app repo when project.yaml enables it. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type PackageJsonLike,
  runOpenspecAppCheck,
} from "../lib/openspecAppCheck.ts";
import { loadProjectConfig, resolveAppRoot } from "../lib/loadProject.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv[2];
const strict = process.argv.includes("--strict");

if (!slug) {
  console.error("Usage: verify_app_openspec.ts <slug> [--strict]");
  process.exit(2);
}

const cfg = loadProjectConfig(ROOT, slug);
if (!cfg.app.openspec_enabled) {
  console.log("OPENSPEC_SKIPPED openspec_enabled=false");
  process.exit(0);
}

const appRoot = resolveAppRoot(ROOT, cfg);
const specsRel = cfg.app.openspec_specs_dir.replace(/^\.\//, "");
const specsDir = join(appRoot, specsRel);
const changesDir = join(appRoot, "openspec", "changes");

let fail = 0;
const ok = (msg: string) => console.log(`OPENSPEC_CHECK_OK ${msg}`);
const bad = (msg: string) => {
  console.error(`OPENSPEC_CHECK_FAIL ${msg}`);
  fail = 1;
};

if (!existsSync(specsDir)) {
  bad(`missing specs dir ${specsRel} — mkdir -p and seed capabilities`);
} else {
  ok(`specs_dir ${specsRel}`);
}

if (!existsSync(changesDir)) {
  bad("missing openspec/changes — mkdir -p openspec/changes");
} else {
  ok("openspec/changes");
}

let pkg: PackageJsonLike | null = null;
const pkgPath = join(appRoot, "package.json");
if (!existsSync(pkgPath)) {
  bad("package.json missing in app repo");
} else {
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as PackageJsonLike;
  } catch {
    bad("package.json is not valid JSON");
  }
}

const skillsRoot = join(appRoot, ".cursor", "skills");
const skillNames = existsSync(skillsRoot)
  ? readdirSync(skillsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  : [];

const result = runOpenspecAppCheck({
  appRoot,
  specsDir: specsRel,
  packageJson: pkg,
  skillNamesPresent: skillNames,
});
if (!result.ok) {
  bad(result.reason ?? "openspec app check failed");
} else {
  ok("package_and_skills");
}

if (strict && fail === 0 && existsSync(join(appRoot, "node_modules"))) {
  const { execSync } = await import("node:child_process");
  try {
    execSync("npm run spec -- validate --specs --all", {
      cwd: appRoot,
      stdio: "pipe",
      encoding: "utf8",
    });
    ok("cli_validate_specs");
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string };
    bad(
      `npm run spec validate failed: ${(err.stderr ?? err.stdout ?? "").slice(0, 300)}`,
    );
  }
}

if (fail === 0) {
  console.log(`OPENSPEC_OK {"slug":"${slug}","app":"${appRoot}"}`);
  process.exit(0);
}
console.error(`OPENSPEC_INCOMPLETE {"slug":"${slug}"}`);
process.exit(1);
