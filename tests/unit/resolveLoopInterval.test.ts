import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("resolve_loop_interval.ts", () => {
  it("prints interval from projects/_template/project.yaml", () => {
    const child = spawnSync("npx", ["tsx", "scripts/resolve_loop_interval.ts", "_template"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(child.status).toBe(0);
    expect(child.stdout.trim()).toBe("300");
  });

  it("exits 2 when slug missing", () => {
    const child = spawnSync("npx", ["tsx", "scripts/resolve_loop_interval.ts"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(child.status).toBe(2);
  });
});
