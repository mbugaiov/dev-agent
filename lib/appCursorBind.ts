/**
 * Bind app-repo Cursor rules/skills into Hephaestus oneshot context.
 * Opt-in via project.yaml → app.mandatory_reads (relative to app.repo_path).
 * Cursor does not auto-load a second repo's .cursor/; agent must Read paths.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";

export type AppCursorBindPaths = {
  engineRoot: string;
  slug: string;
  /** Absolute app checkout root. */
  appRoot: string;
  /** Paths relative to appRoot; may include single-segment globs (*). */
  relativeReads: readonly string[];
  /** When true, also include forge project.yaml / memory / .cursor/rules. */
  includeForgeDefaults?: boolean;
};

/** Expand one relative pattern under appRoot into absolute existing files. */
export function expandAppReadPattern(
  appRoot: string,
  pattern: string,
): string[] {
  const trimmed = pattern.trim().replace(/^\.\//, "");
  if (!trimmed) return [];

  const starCount = (trimmed.match(/\*/g) ?? []).length;
  if (trimmed.includes("**") || starCount > 1) {
    throw new Error(
      `Unsupported mandatory_reads glob "${pattern}" — use path, dir/*.ext, or dir/*/SKILL.md`,
    );
  }

  // foo/*/SKILL.md  (exactly one *)
  const starDir = trimmed.match(/^(.+)\/\*\/([^/]+)$/);
  if (starDir && !starDir[1].includes("*") && !starDir[2].includes("*")) {
    const dir = join(appRoot, starDir[1]);
    const leaf = starDir[2];
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const candidate = join(dir, name, leaf);
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        out.push(candidate);
      }
    }
    return out.sort();
  }

  // foo/bar/*.mdc
  const starFile = trimmed.match(/^(.+)\/\*(\.[^/]+)$/);
  if (starFile && !starFile[1].includes("*")) {
    const dir = join(appRoot, starFile[1]);
    const ext = starFile[2];
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
    return readdirSync(dir)
      .filter((n) => n.endsWith(ext))
      .map((n) => join(dir, n))
      .filter((p) => existsSync(p) && statSync(p).isFile())
      .sort();
  }

  if (trimmed.includes("*")) {
    throw new Error(
      `Unsupported mandatory_reads glob "${pattern}" — use path, dir/*.ext, or dir/*/SKILL.md`,
    );
  }

  const abs = join(appRoot, trimmed);
  if (existsSync(abs) && statSync(abs).isFile()) return [abs];
  return [];
}

export function forgeDefaultReadPaths(
  engineRoot: string,
  slug: string,
): string[] {
  const base = join(engineRoot, "projects", slug);
  const out: string[] = [];
  for (const rel of ["project.yaml", "project-memory.md"]) {
    const p = join(base, rel);
    if (existsSync(p) && statSync(p).isFile()) out.push(p);
  }
  const rulesDir = join(base, ".cursor", "rules");
  if (existsSync(rulesDir) && statSync(rulesDir).isDirectory()) {
    for (const name of readdirSync(rulesDir).sort()) {
      if (!name.endsWith(".mdc")) continue;
      const p = join(rulesDir, name);
      if (existsSync(p) && statSync(p).isFile()) out.push(p);
    }
  }
  const skillsDir = join(base, ".cursor", "skills");
  if (existsSync(skillsDir) && statSync(skillsDir).isDirectory()) {
    for (const name of readdirSync(skillsDir).sort()) {
      const skill = join(skillsDir, name, "SKILL.md");
      if (existsSync(skill) && statSync(skill).isFile()) out.push(skill);
    }
  }
  return out;
}

/** Absolute paths, unique, stable order: forge defaults then app reads. */
export function resolveMandatoryReadPaths(
  input: AppCursorBindPaths,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (p: string) => {
    if (seen.has(p)) return;
    seen.add(p);
    out.push(p);
  };

  if (input.includeForgeDefaults !== false) {
    for (const p of forgeDefaultReadPaths(input.engineRoot, input.slug)) {
      push(p);
    }
  }
  for (const pat of input.relativeReads) {
    for (const p of expandAppReadPattern(input.appRoot, pat)) {
      push(p);
    }
  }
  return out;
}

export function formatAppCursorManifest(paths: readonly string[]): string {
  return paths.length ? `${paths.join("\n")}\n` : "";
}

/**
 * Prompt clause for ensure_hephaestus — no apostrophes (nested bash -c hazard).
 * Empty when no paths.
 */
export function formatAppCursorPromptClause(
  slug: string,
  pathCount: number,
): string {
  if (pathCount <= 0) return "";
  return (
    `APP_CURSOR_BIND: Before pickup or any product code, Read EVERY absolute path listed in ` +
    `projects/${slug}/factory/app-cursor.manifest (${pathCount} files — app rules/skills + forge bind). ` +
    `Missing path = stop and report. Do not invent TestRail IDs, branch names, or POM patterns without those Reads. `
  );
}

/** Relative display helper for tests / logs. */
export function displayRel(fromRoot: string, abs: string): string {
  try {
    return relative(fromRoot, abs).split(sep).join("/");
  } catch {
    return basename(abs);
  }
}
