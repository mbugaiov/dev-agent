import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  expandAppReadPattern,
  formatAppCursorPromptClause,
  forgeDefaultReadPaths,
  resolveMandatoryReadPaths,
} from "../../lib/appCursorBind.ts";

function makeAppTree(): string {
  const root = mkdtempSync(join(tmpdir(), "app-cursor-bind-"));
  mkdirSync(join(root, ".cursor", "rules"), { recursive: true });
  mkdirSync(join(root, ".cursor", "skills", "prepare-pr"), { recursive: true });
  mkdirSync(join(root, ".cursor", "skills", "create-tests"), {
    recursive: true,
  });
  writeFileSync(join(root, "AGENTS.md"), "# agents\n");
  writeFileSync(join(root, ".cursor", "rules", "a.mdc"), "a\n");
  writeFileSync(join(root, ".cursor", "rules", "b.mdc"), "b\n");
  writeFileSync(
    join(root, ".cursor", "skills", "prepare-pr", "SKILL.md"),
    "# pr\n",
  );
  writeFileSync(
    join(root, ".cursor", "skills", "create-tests", "SKILL.md"),
    "# tests\n",
  );
  return root;
}

describe("appCursorBind", () => {
  it("expands plain path, *.mdc, and */SKILL.md", () => {
    const app = makeAppTree();
    expect(expandAppReadPattern(app, "AGENTS.md")).toEqual([
      join(app, "AGENTS.md"),
    ]);
    expect(expandAppReadPattern(app, ".cursor/rules/*.mdc")).toEqual([
      join(app, ".cursor", "rules", "a.mdc"),
      join(app, ".cursor", "rules", "b.mdc"),
    ]);
    expect(expandAppReadPattern(app, ".cursor/skills/*/SKILL.md")).toEqual([
      join(app, ".cursor", "skills", "create-tests", "SKILL.md"),
      join(app, ".cursor", "skills", "prepare-pr", "SKILL.md"),
    ]);
    expect(expandAppReadPattern(app, "missing.md")).toEqual([]);
  });

  it("rejects unsupported globs", () => {
    const app = makeAppTree();
    expect(() => expandAppReadPattern(app, "**/*.md")).toThrow(/Unsupported/);
  });

  it("resolves forge defaults + app reads without duplicates", () => {
    const engine = mkdtempSync(join(tmpdir(), "engine-cursor-bind-"));
    const slug = "demo-forge";
    const proj = join(engine, "projects", slug);
    mkdirSync(join(proj, ".cursor", "rules"), { recursive: true });
    mkdirSync(join(proj, ".cursor", "skills", "forge-skill"), { recursive: true });
    writeFileSync(join(proj, "project.yaml"), "slug: demo-forge\n");
    writeFileSync(join(proj, "project-memory.md"), "# mem\n");
    writeFileSync(join(proj, ".cursor", "rules", "forge.mdc"), "# forge\n");
    writeFileSync(
      join(proj, ".cursor", "skills", "forge-skill", "SKILL.md"),
      "# skill\n",
    );

    const app = makeAppTree();
    const paths = resolveMandatoryReadPaths({
      engineRoot: engine,
      slug,
      appRoot: app,
      relativeReads: ["AGENTS.md", ".cursor/rules/*.mdc"],
    });
    expect(paths[0]).toBe(join(proj, "project.yaml"));
    expect(paths).toContain(join(proj, ".cursor", "rules", "forge.mdc"));
    expect(paths).toContain(
      join(proj, ".cursor", "skills", "forge-skill", "SKILL.md"),
    );
    expect(paths).toContain(join(app, "AGENTS.md"));
    expect(paths).toContain(join(app, ".cursor", "rules", "a.mdc"));
    expect(forgeDefaultReadPaths(engine, slug)).toHaveLength(4);
  });

  it("formats prompt clause only when paths exist (no apostrophes)", () => {
    expect(formatAppCursorPromptClause("demo-forge", 0)).toBe(
      "",
    );
    const clause = formatAppCursorPromptClause("demo-forge", 12);
    expect(clause).toContain("APP_CURSOR_BIND:");
    expect(clause).toContain("app-cursor.manifest");
    expect(clause).toContain("(12 files");
    expect(clause).not.toMatch(/'/);
  });
});
