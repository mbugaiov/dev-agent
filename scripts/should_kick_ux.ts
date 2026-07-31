#!/usr/bin/env npx tsx
/**
 * Exit 0 if Hephaestus should wake Athena UX subagent; 1 if skip; 2 on usage error.
 *
 * Usage:
 *   npx tsx scripts/should_kick_ux.ts <slug> [--labels a,b] [--surfaces "a,b"] [--diff]
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { shouldKickUx, DEFAULT_UI_PATH_GLOBS } from "../lib/uxSubagentKick.ts";

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

function loadProject(slug: string): {
  repoPath: string;
  defaultBranch: string;
  uiGlobs: string[];
} {
  const yamlPath = join(ROOT, "projects", slug, "project.yaml");
  if (!existsSync(yamlPath)) {
    console.error(`Missing ${yamlPath}`);
    process.exit(2);
  }
  const raw = readFileSync(yamlPath, "utf8");
  const repoMatch = raw.match(/repo_path:\s*(\S+)/);
  const branchMatch = raw.match(/default_branch:\s*(\S+)/);
  const repoPath = repoMatch?.[1]?.replace(/^["']|["']$/g, "") ?? "";
  const defaultBranch = branchMatch?.[1]?.replace(/^["']|["']$/g, "") ?? "main";
  const globs: string[] = [];
  const globSection = raw.match(/ui_path_globs:\s*\n((?:\s*-\s+.+\n)+)/);
  if (globSection) {
    for (const line of globSection[1].split("\n")) {
      const m = line.match(/^\s*-\s+(.+)$/);
      if (m) globs.push(m[1].trim().replace(/^["']|["']$/g, ""));
    }
  }
  const absRepo = repoPath.startsWith("/")
    ? repoPath
    : join(ROOT, "projects", slug, repoPath);
  return {
    repoPath: absRepo,
    defaultBranch,
    uiGlobs: globs.length ? globs : [...DEFAULT_UI_PATH_GLOBS],
  };
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

const { slug, labels, surfaces, useDiff } = parseArgs(process.argv);
const project = loadProject(slug);
const diffs = useDiff ? diffPaths(project.repoPath, project.defaultBranch) : [];
const result = shouldKickUx({
  labels,
  surfaces,
  diffPaths: diffs,
  uiPathGlobs: project.uiGlobs,
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
