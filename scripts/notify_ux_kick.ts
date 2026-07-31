#!/usr/bin/env npx tsx
/**
 * Notify Teams that an Athena UX pass is starting (before Task spawn).
 *
 * Usage:
 *   npx tsx scripts/notify_ux_kick.ts <slug> \
 *     --ticket ABC-123 --branch feat/x --surfaces 'components/A.tsx' [--mode hephaestus-kick|charter]
 *
 * Resolves Athena root: UX_AGENT_ROOT → project.yaml ux_kick.ux_agent_path → ../ux-agent
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectConfig } from "../lib/loadProject.ts";
import {
  injectWebhookEnvFromSecretsText,
  normalizeUxPassMode,
  resolveUxAgentRoot,
} from "../lib/notifyUxKick.ts";

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
  normalizeUxPassMode(mode),
];

const env = { ...process.env };
for (const secretsPath of [
  join(ROOT, "projects", slug, ".secrets", "jira.env"),
  join(uxRoot, "projects", slug, ".secrets", "jira.env"),
]) {
  if (!existsSync(secretsPath)) continue;
  try {
    injectWebhookEnvFromSecretsText(env, readFileSync(secretsPath, "utf8"));
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
if (result.error) {
  console.error(
    `UX_PASS_NOTIFY_FAILED ${JSON.stringify({
      slug,
      reason: "exception",
      detail: String(result.error),
    })}`,
  );
  process.exit(1);
}

process.exit(result.status === null ? 1 : result.status);
