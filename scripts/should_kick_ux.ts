#!/usr/bin/env npx tsx
/**
 * Exit 0 if Hephaestus should wake Athena UX subagent; 1 if skip; 2 on usage error.
 *
 * Usage:
 *   npx tsx scripts/should_kick_ux.ts <slug> [--labels a,b] [--surfaces "a,b"] [--diff]
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectConfig, resolveAppRoot } from "../lib/loadProject.ts";
import {
  shouldKickUx,
  DEFAULT_UI_PATH_GLOBS,
} from "../lib/uxSubagentKick.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv: string[]) {
  const slug = argv[2];
  if (!slug || slug.startsWith("-")) {
    console.error(
      "Usage: should_kick_ux.ts <slug> [--labels a,b] [--surfaces path,path] [--diff]",
    );
    process.exit(2);
  }
  let labels: string[] = [];
  let surfaces: string[] = [];
  let useDiff = false;
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--labels" && argv[i + 1]) {
      labels = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    } else if (a === "--surfaces" && argv[i + 1]) {
      surfaces = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    } else if (a === "--diff") {
      useDiff = true;
    }
  }
  return { slug, labels, surfaces, useDiff };
}

function diffPaths(repoPath: string, defaultBranch: string): string[] {
  try {
    const out = execFileSync(
      "git",
      ["diff", "--name-only", `origin/${defaultBranch}...HEAD`],
      { cwd: repoPath, encoding: "utf8" },
    );
    return out.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

type UxKickYaml = {
  ui_path_globs?: string[];
};

const { slug, labels, surfaces, useDiff } = parseArgs(process.argv);
let config;
try {
  config = loadProjectConfig(ROOT, slug);
} catch (err) {
  console.error(String(err));
  process.exit(2);
}
const repoPath = resolveAppRoot(ROOT, config);
const defaultBranch = config.git.default_branch;
const uxKick = (config as { ux_kick?: UxKickYaml }).ux_kick;
const uiGlobs =
  uxKick?.ui_path_globs?.length ? uxKick.ui_path_globs : [...DEFAULT_UI_PATH_GLOBS];
const diffs = useDiff ? diffPaths(repoPath, defaultBranch) : [];
const result = shouldKickUx({
  labels,
  surfaces,
  diffPaths: diffs,
  uiPathGlobs: uiGlobs,
});

const payload = {
  slug,
  kick: result.kick,
  reasons: result.reasons,
  labels,
  surfaces,
  diffHits: diffs.filter((d) =>
    result.reasons.some((r) => r === `diff:${d}` || r.startsWith("diff:")),
  ),
};
console.log(JSON.stringify(payload));
console.log(
  result.kick
    ? "UX_KICK_YES — wake Athena subagent on current feature branch (skill dev-ux-subagent)"
    : "UX_KICK_NO — skip UX subagent",
);
process.exit(result.kick ? 0 : 1);
