import { describe, expect, it } from "vitest";
import {
  commentsHaveWbsDraftReady,
  commentsHaveWbsReady,
  hasProjectBootstrapLabel,
  resolveBootstrapDemux,
  resolveBootstrapKickSentinel,
} from "../../lib/bootstrapKick";

describe("project-bootstrap demux", () => {
  it("detects label", () => {
    expect(hasProjectBootstrapLabel(["impl-dev", "project-bootstrap"])).toBe(
      true,
    );
    expect(hasProjectBootstrapLabel(["impl-dev"])).toBe(false);
  });

  it("detects WBS_READY sentinel (line, not prose)", () => {
    expect(commentsHaveWbsReady([{ body: "done\n\nWBS_READY\n" }])).toBe(true);
    expect(commentsHaveWbsReady([{ body: "## WBS_READY\n\nok" }])).toBe(true);
    expect(
      commentsHaveWbsReady([
        { body: "Wait for WBS_READY before implement.\n\n_pickup_" },
      ]),
    ).toBe(false);
  });

  it("detects WBS_DRAFT_READY sentinel", () => {
    expect(
      commentsHaveWbsDraftReady([{ body: "Hermes\n\nWBS_DRAFT_READY\n" }]),
    ).toBe(true);
    expect(commentsHaveWbsDraftReady([{ body: "draft pending" }])).toBe(false);
  });

  it("demux when bootstrap + pickup + !ready", () => {
    const r = resolveBootstrapDemux({
      labels: ["impl-dev", "project-bootstrap", "pantheon"],
      pickupLabel: "impl-dev",
      wbsReady: false,
    });
    expect(r.demux).toBe(true);
    expect(r.stripPickup).toBe(true);
    expect(r.phase).toBe("demux");
    expect(r.reasons).toContain("pickup:impl-dev");
  });

  it("demux when bootstrap without pickup (still kick Chronos)", () => {
    const r = resolveBootstrapDemux({
      labels: ["project-bootstrap"],
      pickupLabel: "impl-dev",
      wbsReady: false,
    });
    expect(r.demux).toBe(true);
    expect(r.stripPickup).toBe(false);
    expect(r.phase).toBe("demux");
  });

  it("no demux when WBS_READY — strip leftover pickup", () => {
    const r = resolveBootstrapDemux({
      labels: ["impl-dev", "project-bootstrap"],
      pickupLabel: "impl-dev",
      wbsReady: true,
    });
    expect(r.demux).toBe(false);
    expect(r.stripPickup).toBe(true);
    expect(r.phase).toBe("done");
  });

  it("no demux without project-bootstrap", () => {
    const r = resolveBootstrapDemux({
      labels: ["impl-dev", "ba-spec-first"],
      wbsReady: false,
    });
    expect(r.demux).toBe(false);
    expect(r.phase).toBe("none");
  });

  it("notes draft-ready while still demuxing for seed", () => {
    const r = resolveBootstrapDemux({
      labels: ["impl-dev", "project-bootstrap"],
      wbsReady: false,
      wbsDraftReady: true,
    });
    expect(r.demux).toBe(true);
    expect(r.reasons).toContain("wbs:draft-ready");
  });

  it("exit contract: demux and strip-only both exit 0", () => {
    const demux = resolveBootstrapDemux({
      labels: ["impl-dev", "project-bootstrap"],
      wbsReady: false,
    });
    expect(resolveBootstrapKickSentinel(demux)).toMatchObject({
      sentinel: "BOOTSTRAP_DEMUX_YES",
      exitCode: 0,
    });

    const stripOnly = resolveBootstrapDemux({
      labels: ["impl-dev", "project-bootstrap"],
      wbsReady: true,
    });
    expect(resolveBootstrapKickSentinel(stripOnly)).toMatchObject({
      sentinel: "BOOTSTRAP_STRIP_YES",
      exitCode: 0,
    });
  });

  it("exit contract: skip paths exit 1", () => {
    const doneClean = resolveBootstrapDemux({
      labels: ["project-bootstrap"],
      wbsReady: true,
    });
    expect(resolveBootstrapKickSentinel(doneClean).exitCode).toBe(1);

    const none = resolveBootstrapDemux({ labels: ["impl-dev"] });
    expect(resolveBootstrapKickSentinel(none).exitCode).toBe(1);
  });
});
