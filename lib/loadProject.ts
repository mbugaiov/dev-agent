// Load projects/<slug>/project.yaml — I/O boundary for scripts.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { ProjectConfig } from "./projectConfig.ts";

export function projectDir(engineRoot: string, slug: string): string {
  return join(engineRoot, "projects", slug);
}

export function projectYamlPath(engineRoot: string, slug: string): string {
  return join(projectDir(engineRoot, slug), "project.yaml");
}

export function loadProjectConfig(
  engineRoot: string,
  slug: string,
): ProjectConfig {
  const raw = readFileSync(projectYamlPath(engineRoot, slug), "utf8");
  const parsed = parseYaml(raw) as ProjectConfig;
  if (!parsed?.slug || !parsed?.dev_factory) {
    throw new Error(
      `Invalid project.yaml for slug "${slug}" — need slug and dev_factory`,
    );
  }
  const tracker = parsed.tracker?.provider;
  const githubIssues =
    tracker === "github_issues" ||
    (parsed.jira?.enabled === false && parsed.git?.provider === "github");
  if (!githubIssues && !parsed.dev_factory.epic_key) {
    throw new Error(
      `Invalid project.yaml for slug "${slug}" — need dev_factory.epic_key (or tracker.provider: github_issues)`,
    );
  }
  if (githubIssues && !parsed.dev_factory.epic_key) {
    parsed.dev_factory.epic_key = `github:${parsed.git.workspace}/${parsed.git.repo}`;
  }
  return parsed;
}

export function resolveAppRoot(
  engineRoot: string,
  config: ProjectConfig,
): string {
  const p = config.app.repo_path;
  if (p.startsWith("/")) return p;
  return join(engineRoot, p);
}
