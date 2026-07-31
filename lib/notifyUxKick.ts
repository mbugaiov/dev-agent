/** Pure helpers for Hephaestus → Athena UX kick Teams notify. */

import { isAbsolute, resolve } from "node:path";
import { parseSecretsEnv } from "./secretsEnvLint.ts";

export const WEBHOOK_ENV_KEYS = [
  "UX_FACTORY_TEAMS_WEBHOOK_URL",
  "AGENT_TEAMS_WEBHOOK_URL",
  "DEV_FACTORY_TEAMS_WEBHOOK_URL",
] as const;

export type UxKickNotifyConfig = {
  ux_kick?: { ux_agent_path?: string };
};

/** Resolve Athena checkout: UX_AGENT_ROOT → project.yaml → sibling ../ux-agent. */
export function resolveUxAgentRoot(
  engineRoot: string,
  config: UxKickNotifyConfig,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const fromEnv = env.UX_AGENT_ROOT?.trim();
  if (fromEnv) return resolve(fromEnv);

  const fromYaml = config.ux_kick?.ux_agent_path?.trim();
  if (fromYaml) {
    return isAbsolute(fromYaml) ? fromYaml : resolve(engineRoot, fromYaml);
  }

  return resolve(engineRoot, "../ux-agent");
}

/**
 * Inject webhook URL env vars from a secrets file when not already set.
 * Uses parseSecretsEnv so `&` in Power Automate URLs survives.
 */
export function injectWebhookEnvFromSecretsText(
  env: NodeJS.ProcessEnv,
  secretsText: string,
): void {
  const entries = parseSecretsEnv(secretsText);
  for (const { name, value } of entries) {
    if (!(WEBHOOK_ENV_KEYS as readonly string[]).includes(name)) continue;
    if (!value) continue;
    if (env[name]) continue;
    env[name] = value;
  }
}

export function normalizeUxPassMode(mode: string): "hephaestus-kick" | "charter" {
  return mode === "charter" ? "charter" : "hephaestus-kick";
}
