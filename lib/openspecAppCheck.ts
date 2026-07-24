// OpenSpec readiness checks for the application repo (when app.openspec_enabled).

export const OPENSPEC_NPM_PACKAGE = "@fission-ai/openspec" as const;

/** Minimum Cursor skills for spec-first dev factory work. */
export const OPENSPEC_REQUIRED_SKILLS = [
  "openspec-propose",
  "openspec-apply-change",
  "openspec-archive-change",
] as const;

export type PackageJsonLike = {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
};

export type OpenspecAppCheckInput = {
  appRoot: string;
  specsDir: string;
  packageJson?: PackageJsonLike | null;
  skillNamesPresent: readonly string[];
};

export type OpenspecAppCheckResult = {
  ok: boolean;
  reason?: string;
};

function packageHasOpenspec(pkg: PackageJsonLike): boolean {
  const dep =
    pkg.devDependencies?.[OPENSPEC_NPM_PACKAGE] ??
    pkg.dependencies?.[OPENSPEC_NPM_PACKAGE];
  return typeof dep === "string" && dep.length > 0;
}

/** package.json must expose an npm script that invokes the openspec CLI. */
export function packageHasOpenspecScript(pkg: PackageJsonLike): boolean {
  const scripts = pkg.scripts ?? {};
  return Object.values(scripts).some((cmd) => /\bopenspec\b/.test(cmd));
}

export function missingOpenspecSkills(
  present: readonly string[],
): string[] {
  const set = new Set(present);
  return OPENSPEC_REQUIRED_SKILLS.filter((s) => !set.has(s));
}

export function runOpenspecAppCheck(
  input: OpenspecAppCheckInput,
): OpenspecAppCheckResult {
  if (!input.appRoot.trim()) {
    return { ok: false, reason: "app root is empty" };
  }
  if (!input.specsDir.trim()) {
    return { ok: false, reason: "openspec_specs_dir is empty" };
  }

  const pkg = input.packageJson;
  if (!pkg) {
    return {
      ok: false,
      reason:
        "package.json missing or unreadable — required for @fission-ai/openspec",
    };
  }
  if (!packageHasOpenspec(pkg)) {
    return {
      ok: false,
      reason: `install ${OPENSPEC_NPM_PACKAGE} in app devDependencies (SETUP.md §6)`,
    };
  }
  if (!packageHasOpenspecScript(pkg)) {
    return {
      ok: false,
      reason:
        'add npm script invoking openspec (e.g. "spec": "openspec") in package.json',
    };
  }

  const missingSkills = missingOpenspecSkills(input.skillNamesPresent);
  if (missingSkills.length > 0) {
    return {
      ok: false,
      reason: `missing app OpenSpec skills: ${missingSkills.join(", ")} (.cursor/skills/)`,
    };
  }

  return { ok: true };
}
