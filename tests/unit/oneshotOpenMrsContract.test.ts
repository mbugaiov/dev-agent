import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../..");

/**
 * Contract lock for Kairos oneshot: open-MR probe exit codes must drive
 * hold vs exit (never treat probe error as idle).
 */
describe("oneshot open-MR probe contract", () => {
  const hasMrs = readFileSync(
    join(ROOT, "scripts/project_has_open_mrs.sh"),
    "utf8",
  );
  const loop = readFileSync(join(ROOT, "scripts/dev-loop.sh"), "utf8");
  const openMrsTs = readFileSync(
    join(ROOT, "scripts/project_open_mrs.ts"),
    "utf8",
  );

  it("project_has_open_mrs.sh documents exit 0 / 1 / 2", () => {
    expect(hasMrs).toMatch(/Exit 0 if project has/);
    expect(hasMrs).toMatch(/exit 1 if none/i);
    expect(hasMrs).toMatch(/exit 2 on probe error/i);
    expect(hasMrs).toContain("exit 2");
    expect(hasMrs).toContain("exit 1");
    expect(hasMrs).toContain("exit 0");
  });

  it("project_open_mrs.ts is the probe implementation", () => {
    expect(openMrsTs).toContain("OPEN_MRS ");
    expect(hasMrs).toContain("project_open_mrs.ts");
  });

  it("dev-loop oneshot holds on open MRs and on probe error; exits only on none", () => {
    expect(loop).toContain("DEV_LOOP_EXIT_ON_IDLE");
    expect(loop).toContain("LOOP_HOLD_OPEN_MR");
    expect(loop).toContain("LOOP_HOLD_OPEN_MR_PROBE_ERROR");
    expect(loop).toContain("LOOP_EXIT_IDLE");
    expect(loop).toMatch(/mrs_rc.*-eq 0/);
    expect(loop).toMatch(/mrs_rc.*-eq 2/);
    // Must not collapse exit 1 and 2 into a single else that exits idle.
    expect(loop).not.toContain(
      'project_has_open_mrs.sh" "$SLUG" >/dev/null 2>&1',
    );
    expect(loop).toContain("mrs_rc");
  });

  it("dev-loop oneshot holds when the factory tick fails", () => {
    expect(loop).toContain("TICK_FAILED");
    expect(loop).toContain("LOOP_HOLD_TICK_FAILED");
  });
});
