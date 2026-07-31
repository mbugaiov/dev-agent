import { describe, expect, it } from "vitest";
import {
  injectWebhookEnvFromSecretsText,
  normalizeUxPassMode,
  resolveUxAgentRoot,
} from "../../lib/notifyUxKick.ts";

describe("notifyUxKick", () => {
  it("resolves UX_AGENT_ROOT first", () => {
    const root = resolveUxAgentRoot("/engine", {}, {
      UX_AGENT_ROOT: "/custom/athena",
    });
    expect(root).toBe("/custom/athena");
  });

  it("resolves relative ux_kick.ux_agent_path from engine root", () => {
    const root = resolveUxAgentRoot("/engine", {
      ux_kick: { ux_agent_path: "../athena" },
    }, {});
    expect(root).toBe("/athena");
  });

  it("falls back to sibling ../ux-agent", () => {
    const root = resolveUxAgentRoot("/work/dev-agent", {}, {});
    expect(root).toBe("/work/ux-agent");
  });

  it("injects webhook keys without overwriting existing env", () => {
    const env: NodeJS.ProcessEnv = {
      DEV_FACTORY_TEAMS_WEBHOOK_URL: "https://keep.example/hook?sig=1",
    };
    injectWebhookEnvFromSecretsText(
      env,
      [
        'UX_FACTORY_TEAMS_WEBHOOK_URL="https://ux.example/hook?api-version=1&sig=abc"',
        "AGENT_TEAMS_WEBHOOK_URL=https://agent.example/hook?sig=z",
        'DEV_FACTORY_TEAMS_WEBHOOK_URL="https://ignored.example/hook?sig=x"',
      ].join("\n"),
    );
    expect(env.UX_FACTORY_TEAMS_WEBHOOK_URL).toContain("sig=abc");
    expect(env.AGENT_TEAMS_WEBHOOK_URL).toContain("sig=z");
    expect(env.DEV_FACTORY_TEAMS_WEBHOOK_URL).toBe(
      "https://keep.example/hook?sig=1",
    );
  });

  it("normalizes UX pass mode", () => {
    expect(normalizeUxPassMode("charter")).toBe("charter");
    expect(normalizeUxPassMode("hephaestus-kick")).toBe("hephaestus-kick");
    expect(normalizeUxPassMode("other")).toBe("hephaestus-kick");
  });
});
