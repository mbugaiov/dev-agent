/**
 * Cloud factory wake — decide whether to spawn a Cursor cloud Hephaestus run.
 * Pure helpers; side effects (tick subprocess, SDK) live in scripts/cloud_factory_wake.ts.
 */

import type { ProjectConfig } from "./projectConfig.ts";

export type CloudRepoSpec = {
  url: string;
  startingRef: string;
};

/**
 * Master kill-switch for unattended cloud factory.
 * Default OFF — only `"true" | "1" | "yes"` (case-insensitive) enables.
 */
export function isCloudFactoryEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const v = (env.CLOUD_FACTORY_ENABLED ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export type ParsedTick =
  | { kind: "wake"; line: string }
  | { kind: "idle"; line: string }
  | { kind: "unknown"; line: string };

const WAKE_RE = /^BACKLOG_WAKE_EXECUTE\b/;
const IDLE_RE = /^DEV_FACTORY_IDLE\b/;

/** Extract the last meaningful tick line from tick script stdout. */
export function parseTickStdout(stdout: string): ParsedTick {
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (WAKE_RE.test(line)) return { kind: "wake", line };
    if (IDLE_RE.test(line)) return { kind: "idle", line };
  }
  const last = lines[lines.length - 1] ?? "";
  return { kind: "unknown", line: last };
}

/** Pull oldest issue key from a BACKLOG_WAKE_EXECUTE line when present. */
export function oldestKeyFromWakeLine(line: string): string | null {
  // Tick emits JSON: BACKLOG_WAKE_EXECUTE {"oldest":"slug#N",...}
  const jsonOldest = line.match(/"oldest"\s*:\s*"([^"]+)"/);
  if (jsonOldest?.[1]) return jsonOldest[1];
  const m =
    line.match(/\boldest[=:]([A-Za-z0-9_.#-]+)/i) ||
    line.match(/\bpick[=:]([A-Za-z0-9_.#-]+)/i) ||
    line.match(/\b([a-z0-9_-]+#\d+|[A-Z]+-\d+)\b/);
  return m?.[1] ?? null;
}

/**
 * Repos for a cloud Hephaestus workspace:
 * app (code) + this engine (skills/scripts) + optional sibling engines for kicks.
 */
export function cloudReposForProject(
  config: ProjectConfig,
  opts?: {
    includeQa?: boolean;
    includeUx?: boolean;
    includeBa?: boolean;
    githubHost?: string;
  },
): CloudRepoSpec[] {
  const host = (opts?.githubHost ?? "https://github.com").replace(/\/$/, "");
  const branch = config.git.default_branch || "main";
  const ws = config.git.workspace;
  const app: CloudRepoSpec = {
    url: `${host}/${ws}/${config.git.repo}`,
    startingRef: branch,
  };
  const engine: CloudRepoSpec = {
    url: `${host}/${ws}/dev-agent`,
    startingRef: "main",
  };
  const out: CloudRepoSpec[] = [app, engine];
  if (opts?.includeQa !== false) {
    out.push({ url: `${host}/${ws}/qa-agent`, startingRef: "main" });
  }
  if (opts?.includeUx !== false) {
    out.push({ url: `${host}/${ws}/ux-agent`, startingRef: "main" });
  }
  if (opts?.includeBa !== false) {
    out.push({ url: `${host}/${ws}/ba-agent`, startingRef: "main" });
  }
  // Dedupe by url
  const seen = new Set<string>();
  return out.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}

export function hourlyIdempotencyKey(
  slug: string,
  issueKey: string,
  now: Date = new Date(),
): string {
  const y = now.getUTCFullYear();
  const mo = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const h = String(now.getUTCHours()).padStart(2, "0");
  const safeIssue = issueKey.replace(/[^A-Za-z0-9._#-]/g, "_") || "unknown";
  return `cloud-factory-${slug}-${safeIssue}-${y}${mo}${d}${h}`;
}

export function buildCloudHephaestusPrompt(input: {
  slug: string;
  tickLine: string;
  appRepoName: string;
  engineRepoName?: string;
}): string {
  const engine = input.engineRepoName ?? "dev-agent";
  return [
    `BACKLOG_WAKE_EXECUTE`,
    `Cloud factory wake for slug=${input.slug}.`,
    `Tick line: ${input.tickLine}`,
    ``,
    `You are Hephaestus (dev factory). This session is unattended on Cursor cloud — not a local IDE chat.`,
    `Workspace is multi-repo. App code lives in \`${input.appRepoName}\`; engine skills/scripts in \`${engine}\`.`,
    `Sibling engines (qa-agent / ux-agent / ba-agent) may be present for kicks.`,
    ``,
    `MUST (same turn):`,
    `1. Read .cursor/skills/dev-factory-loop/SKILL.md and dev-mr-pipeline in ${engine} (or app copy if present).`,
    `2. Start the oldest impl-dev ticket from the tick — pickup → branch off main → OpenSpec → implement → gate → PR → merge → STG → handoff.`,
    `3. Drain the queue in this run when possible; do not stop after planning.`,
    `4. After Validate/Testing handoff, kick Argus (qa-agent skill / QA_WAKE_EXECUTE) when scripts say so.`,
    `5. Honor ba-spec-first / ux-charter-first gates (Hermes / Athena) before UI/impl when labels require it.`,
    ``,
    `FORBIDDEN: status-only replies; empty branch with zero commits; waiting for a human "go".`,
    `End with evidence: commits, PR URL, handoff comment, or STG buildId.`,
  ].join("\n");
}

export type CloudWakePlan =
  | { action: "idle"; reason: string; tickLine: string }
  | {
      action: "spawn" | "dry_run";
      tickLine: string;
      issueKey: string;
      prompt: string;
      repos: CloudRepoSpec[];
      idempotencyKey: string;
    }
  | { action: "skip"; reason: string; tickLine: string };

export function planCloudWake(input: {
  parsed: ParsedTick;
  config: ProjectConfig;
  dryRun: boolean;
  now?: Date;
}): CloudWakePlan {
  if (input.parsed.kind === "idle") {
    return {
      action: "idle",
      reason: "DEV_FACTORY_IDLE",
      tickLine: input.parsed.line,
    };
  }
  if (input.parsed.kind === "unknown") {
    return {
      action: "skip",
      reason: "unrecognized tick stdout",
      tickLine: input.parsed.line,
    };
  }

  const issueKey =
    oldestKeyFromWakeLine(input.parsed.line) ??
    `${input.config.slug}#unknown`;
  const repos = cloudReposForProject(input.config);
  const prompt = buildCloudHephaestusPrompt({
    slug: input.config.slug,
    tickLine: input.parsed.line,
    appRepoName: input.config.git.repo,
  });
  const idempotencyKey = hourlyIdempotencyKey(
    input.config.slug,
    issueKey,
    input.now,
  );

  return {
    action: input.dryRun ? "dry_run" : "spawn",
    tickLine: input.parsed.line,
    issueKey,
    prompt,
    repos,
    idempotencyKey,
  };
}
