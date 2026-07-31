#!/usr/bin/env npx tsx
/**
 * Notify Teams that an Athena UX pass is starting (before Task spawn).
 *
 * Usage:
 *   npx tsx scripts/notify_ux_kick.ts <slug> \
 *     --ticket RQ-123 --branch feat/x --surfaces 'components/A.tsx' [--mode hephaestus-kick|charter]
 *
 * Resolves Athena root: UX_AGENT_ROOT → project.yaml ux_kick.ux_agent_path → ../ux-agent
 * Loads webhook from ux-agent projects/<slug>/.secrets/jira.env (or falls back to
 * Hephaestus projects/<slug>/.secrets via DEV_FACTORY / AGENT shared vars).
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectConfig } from "../lib/loadProject.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv: string[]) {
  const slug = argv[2];
  if (!slug || slug.startsWith("-")) {
    console.error(
      "Usage: notify_ux_kick.ts <slug> --ticket KEY --branch name [--surfaces paths] [--mode hephaestus-kick|charter]",
    );
    process.exit(2);
  }
  let ticket = "";
  let branch = "";
  let surfaces = "";
  let mode = "hephaestus-kick";
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ticket" && argv[i + 1]) ticket = argv[++i];
    else if (a === "--branch" && argv[i + 1]) branch = argv[++i];
    else if (a === "--surfaces" && argv[i + 1]) surfaces = argv[++i];
    else if (a === "--mode" && argv[i + 1]) mode = argv[++i];
  }
  return { slug, ticket, branch, surfaces, mode };
}

function resolveUxAgentRoot(
  engineRoot: string,
  config: ReturnType<typeof loadProjectConfig>,
): string {
  const fromEnv = process.env.UX_AGENT_ROOT?.trim();
  if (fromEnv) return resolve(fromEnv);

  const uxKick = (
    config as { ux_kick?: { ux_agent_path?: string } }
  ).ux_kick;
  const fromYaml = uxKick?.ux_agent_path?.trim();
  if (fromYaml) {
    return isAbsolute(fromYaml) ? fromYaml : resolve(engineRoot, fromYaml);
  }

  return resolve(engineRoot, "../ux-agent");
}

const { slug, ticket, branch, surfaces, mode } = parseArgs(process.argv);

let config: ReturnType<typeof loadProjectConfig>;
try {
  config = loadProjectConfig(ROOT, slug);
} catch (err) {
  console.error(String(err));
  process.exit(2);
}

const uxRoot = resolveUxAgentRoot(ROOT, config);
const notifyScript = join(uxRoot, "scripts", "ux_pass_notify.py");
if (!existsSync(notifyScript)) {
  console.error(
    `UX_PASS_NOTIFY_FAILED ${JSON.stringify({
      slug,
      reason: "missing_script",
      detail: `ux_pass_notify.py not found at ${notifyScript} — set UX_AGENT_ROOT or ux_kick.ux_agent_path`,
    })}`,
  );
  process.exit(1);
}

const args = [
  notifyScript,
  "--slug",
  slug,
  "--project",
  join(uxRoot, "projects", slug),
  "--ticket",
  ticket || "(unknown)",
  "--branch",
  branch || "(unknown)",
  "--surfaces",
  surfaces,
  "--mode",
  mode === "charter" ? "charter" : "hephaestus-kick",
];

// Prefer Athena project secrets; also inject Hephaestus secrets as fallbacks for shared webhook.
const env = { ...process.env };
const hephaestusSecrets = join(ROOT, "projects", slug, ".secrets", "jira.env");
if (existsSync(hephaestusSecrets) && !env.DEV_FACTORY_TEAMS_WEBHOOK_URL) {
  // Soft-load via python notify script's own load of Athena .secrets; for shared
  // channel, copy DEV_FACTORY into env if present in Hephaestus secrets.
  try {
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(hephaestusSecrets, "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(
        /^(DEV_FACTORY_TEAMS_WEBHOOK_URL|AGENT_TEAMS_WEBHOOK_URL|UX_FACTORY_TEAMS_WEBHOOK_URL)=(.*)$/,
      );
      if (!m) continue;
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (val && !env[m[1]]) env[m[1]] = val;
    }
  } catch {
    /* optional */
  }
}

const result = spawnSync("python3", args, {
  cwd: uxRoot,
  env,
  encoding: "utf8",
});

if (result.stdout?.trim()) process.stdout.write(result.stdout);
if (result.stderr?.trim()) process.stderr.write(result.stderr);

const code = result.status ?? 1;
// not_configured exits 0 from non-smoke path — treat as success for kick flow
process.exit(code === null ? 1 : code);
