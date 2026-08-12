/**
 * Cursor hook runtime — find the engine from a monorepo workspace and decide
 * stop / sessionStart follow-ups without requiring DEV_AGENT_SLUG.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  PENDING_EXECUTE_PATH,
  shouldForceDrainFollowup,
  type PendingExecuteState,
} from "./devFactoryExecution.ts";
import {
  PENDING_ARGUS_KICK_PATH,
  shouldForceArgusKickFollowup,
  type PendingArgusKickState,
} from "./argusKickPending.ts";
import { loadProjectConfig, projectYamlPath } from "./loadProject.ts";

export const ENGINE_STOP_HOOK_REL = "scripts/dev_factory_stop_hook.ts";
export const ENGINE_SESSION_HOOK_REL = "scripts/dev_factory_session_start_hook.ts";

const ENGINE_MARKERS = [
  ENGINE_STOP_HOOK_REL,
  "lib/devFactoryExecution.ts",
] as const;

export function isDevFactoryEngineRoot(dir: string): boolean {
  return ENGINE_MARKERS.every((rel) => existsSync(join(dir, rel)));
}

/** Walk cwd → parents (and cwd/dev-agent) so workspace-root hooks find the engine. */
export function resolveDevFactoryEngineRoot(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const override = env.DEV_FACTORY_ENGINE_ROOT?.trim();
  if (override && isDevFactoryEngineRoot(override)) return override;

  const seen = new Set<string>();
  let dir = cwd;
  for (let i = 0; i < 8; i++) {
    if (seen.has(dir)) break;
    seen.add(dir);
    if (isDevFactoryEngineRoot(dir)) return dir;
    const nested = join(dir, "dev-agent");
    if (isDevFactoryEngineRoot(nested)) return nested;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function listFactoryProjectSlugs(engineRoot: string): string[] {
  const dir = join(engineRoot, "projects");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("_") && e.name !== "node_modules")
    .filter((e) => existsSync(projectYamlPath(engineRoot, e.name)))
    .map((e) => e.name);
}

export function inferSlugFromTicketKey(
  engineRoot: string,
  ticketKey: string,
): string {
  for (const slug of listFactoryProjectSlugs(engineRoot)) {
    try {
      const cfg = loadProjectConfig(engineRoot, slug);
      const raw = cfg.git.ticket_key_pattern.replace(/^\^/, "").replace(/\$$/, "");
      if (new RegExp(`^(?:${raw})$`).test(ticketKey)) return slug;
    } catch {
      /* skip broken / template yaml */
    }
  }
  return "";
}

export function resolveHookSlug(input: {
  engineRoot: string;
  pending: PendingExecuteState | null;
  envSlug?: string;
}): string {
  const fromEnv = input.envSlug?.trim() ?? "";
  if (fromEnv) return fromEnv;
  const fromPending = input.pending?.slug?.trim() ?? "";
  if (fromPending) return fromPending;
  const oldest = input.pending?.oldest?.trim() ?? "";
  if (oldest) return inferSlugFromTicketKey(input.engineRoot, oldest);
  return "";
}

function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export function readPendingExecute(
  engineRoot: string,
): PendingExecuteState | null {
  return readJsonFile<PendingExecuteState>(join(engineRoot, PENDING_EXECUTE_PATH));
}

export function readPendingArgusKick(
  engineRoot: string,
): PendingArgusKickState | null {
  return readJsonFile<PendingArgusKickState>(
    join(engineRoot, PENDING_ARGUS_KICK_PATH),
  );
}

export type StopHookDecisionInput = {
  engineRoot: string;
  status?: string;
  loopCount?: number;
  envSlug?: string;
  currentBranch?: string;
  hasWorkingTreeChanges?: boolean;
  hasOpenPr?: boolean;
  pending?: PendingExecuteState | null;
  argusPending?: PendingArgusKickState | null;
};

export type HookJson = { followup_message?: string; additional_context?: string };

/** Pure-enough decision used by the stop hook (I/O is injected). */
export function decideDevFactoryStopHook(
  input: StopHookDecisionInput,
): HookJson {
  if (input.status && input.status !== "completed") return {};
  const loopCount = input.loopCount ?? 0;
  const argusPending =
    input.argusPending === undefined
      ? readPendingArgusKick(input.engineRoot)
      : input.argusPending;
  const argus = shouldForceArgusKickFollowup({
    pending: argusPending,
    loopCount,
  });
  if (argus.force) return { followup_message: argus.message };

  const pending =
    input.pending === undefined
      ? readPendingExecute(input.engineRoot)
      : input.pending;
  if (!pending || pending.consumed || pending.count <= 0) return {};

  const slug = resolveHookSlug({
    engineRoot: input.engineRoot,
    pending,
    envSlug: input.envSlug,
  });

  if (!slug) {
    return {
      followup_message:
        `${pending.executePrompt} ` +
        `You ended the turn without starting ${pending.oldest}. ` +
        `Begin implementation immediately — no status summary.`,
    };
  }

  try {
    const config = loadProjectConfig(input.engineRoot, slug);
    const decision = shouldForceDrainFollowup({
      pending,
      currentBranch: input.currentBranch ?? "",
      hasWorkingTreeChanges: input.hasWorkingTreeChanges ?? false,
      hasOpenPr: input.hasOpenPr ?? false,
      loopCount,
      git: config.git,
    });
    return decision.force ? { followup_message: decision.message } : {};
  } catch {
    return {
      followup_message:
        `${pending.executePrompt} ` +
        `You ended the turn without starting ${pending.oldest}. ` +
        `Begin implementation immediately — no status summary.`,
    };
  }
}

export function decideDevFactorySessionStart(engineRoot: string): HookJson {
  const parts: string[] = [];
  const argus = readPendingArgusKick(engineRoot);
  if (argus && !argus.consumed) {
    parts.push(
      `ARGUS KICK PENDING: ${argus.executePrompt} ` +
        `Do NOT end the session until Argus Task is spawned and ack_argus_kick.ts runs.`,
    );
  }
  const pending = readPendingExecute(engineRoot);
  if (pending && !pending.consumed) {
    parts.push(
      `DEV FACTORY EXECUTION PENDING: ${pending.executePrompt} ` +
        `Do NOT reply with status-only summaries while this file exists.`,
    );
  }
  return parts.length ? { additional_context: parts.join(" ") } : {};
}
