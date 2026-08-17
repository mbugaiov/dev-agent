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
  // Latch wins — ambient DEV_AGENT_SLUG must not override another factory's pending work.
  const fromPending = input.pending?.slug?.trim() ?? "";
  if (fromPending) return fromPending;
  const oldest = input.pending?.oldest?.trim() ?? "";
  if (oldest) {
    const inferred = inferSlugFromTicketKey(input.engineRoot, oldest);
    if (inferred) return inferred;
  }
  return input.envSlug?.trim() ?? "";
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
  /**
   * Factory hooks must not force followups into ambient Composer chats.
   * True only for background agents / sessions that opted in via sessionStart env.
   */
  factorySession?: boolean;
};

export type HookJson = {
  followup_message?: string;
  additional_context?: string;
  env?: Record<string, string>;
};

export type SessionStartDecisionInput = {
  engineRoot: string;
  /** Cursor sessionStart: background agent vs interactive Composer. */
  isBackgroundAgent?: boolean;
  /** Prior session env (stop hooks inherit CURSOR_FACTORY_SESSION). */
  factorySessionEnv?: boolean;
};

/** Whether this Cursor session may receive factory execute/kick injections. */
export function isFactoryHookSession(input: {
  isBackgroundAgent?: boolean;
  factorySessionEnv?: boolean;
  env?: NodeJS.ProcessEnv;
}): boolean {
  if (input.isBackgroundAgent) return true;
  if (input.factorySessionEnv) return true;
  const env = input.env ?? process.env;
  return env.CURSOR_FACTORY_SESSION === "1";
}

/** Pure-enough decision used by the stop hook (I/O is injected). */
export function decideDevFactoryStopHook(
  input: StopHookDecisionInput,
): HookJson {
  if (input.status && input.status !== "completed") return {};
  // Argus wake is oneshot-only (ensure_argus) — never force ARGUS_KICK into chats.
  if (input.factorySession === false) return {};
  if (input.factorySession !== true) {
    // Default-deny when caller forgot to pass the flag (ambient workspace hooks).
    return {};
  }

  const loopCount = input.loopCount ?? 0;
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
    const decision = shouldForceDrainFollowup({
      pending,
      currentBranch: input.currentBranch ?? "",
      hasWorkingTreeChanges: input.hasWorkingTreeChanges ?? false,
      hasOpenPr: input.hasOpenPr ?? false,
      loopCount,
      git: { branch_prefixes: ["__none__/"], ticket_key_pattern: "NEVER-MATCH-\\d+" },
    });
    return decision.force ? { followup_message: decision.message } : {};
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
    const decision = shouldForceDrainFollowup({
      pending,
      currentBranch: input.currentBranch ?? "",
      hasWorkingTreeChanges: input.hasWorkingTreeChanges ?? false,
      hasOpenPr: input.hasOpenPr ?? false,
      loopCount,
      git: { branch_prefixes: ["__none__/"], ticket_key_pattern: "NEVER-MATCH-\\d+" },
    });
    return decision.force ? { followup_message: decision.message } : {};
  }
}

export function decideDevFactorySessionStart(
  engineRoot: string,
  opts: Omit<SessionStartDecisionInput, "engineRoot"> = {},
): HookJson {
  // Interactive ambient chats must stay clean — Argus + backlog wakes are oneshot/background only.
  if (!isFactoryHookSession(opts)) return {};

  const pending = readPendingExecute(engineRoot);
  if (!pending || pending.consumed) {
    return {
      env: { CURSOR_FACTORY_SESSION: "1" },
    };
  }
  return {
    env: { CURSOR_FACTORY_SESSION: "1" },
    additional_context:
      `DEV FACTORY EXECUTION PENDING: ${pending.executePrompt} ` +
      `Do NOT reply with status-only summaries while this file exists.`,
  };
}
