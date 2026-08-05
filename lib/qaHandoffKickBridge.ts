/** Resolve qa-agent checkout + fire hard handoff kick (writes pending + prints wake). */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

export type QaKickBridgeConfig = {
  qa_kick?: { qa_agent_path?: string };
};

export const QA_WAKE_EXECUTE_SENTINEL = "QA_WAKE_EXECUTE";
export const QA_PENDING_EXECUTE_PATH = ".cursor/qa-pending-execute.json";

/** Resolve Argus checkout: QA_AGENT_ROOT → project.yaml → sibling ../qa-agent. */
export function resolveQaAgentRoot(
  engineRoot: string,
  config: QaKickBridgeConfig = {},
  env: NodeJS.ProcessEnv = process.env,
): string {
  const fromEnv = env.QA_AGENT_ROOT?.trim();
  if (fromEnv) return resolve(fromEnv);

  const fromYaml = config.qa_kick?.qa_agent_path?.trim();
  if (fromYaml) {
    return isAbsolute(fromYaml) ? fromYaml : resolve(engineRoot, fromYaml);
  }

  return resolve(engineRoot, "../qa-agent");
}

export function buildQaWakePayload(input: {
  slug: string;
  ticketKey: string;
  source?: "handoff" | "manual" | "loop";
}) {
  const keys = [input.ticketKey];
  const oldest = keys[0]!;
  const source = input.source ?? "handoff";
  const executePrompt =
    `${QA_WAKE_EXECUTE_SENTINEL}: Drain QA scope for ${input.slug} NOW. ` +
    `Oldest ${oldest}. cd qa-agent → eval "$(bash scripts/qa_scope.sh ${input.slug} --log --shell)" → ` +
    `validate-testing first (handoff+OpenSpec+TC+STG evidence → qa-verdict-review → close or QA RETURN); ` +
    `when retest empty, continue open impl-qa charters (marathon until Done). ` +
    `Drain until backlog_drained (scope count=0). Forbidden: notify-only / status-only.`;
  return {
    slug: input.slug,
    oldest,
    keys,
    count: keys.length,
    issuedAt: new Date().toISOString(),
    consumed: false,
    source,
    executePrompt,
  };
}

export function formatQaWakeExecuteLine(state: {
  slug: string;
  oldest: string;
  keys: string[];
  count: number;
  source: string;
  executePrompt: string;
}): string {
  return `${QA_WAKE_EXECUTE_SENTINEL} ${JSON.stringify({
    executeNow: true,
    slug: state.slug,
    oldest: state.oldest,
    keys: state.keys,
    count: state.count,
    source: state.source,
    prompt: state.executePrompt,
  })}`;
}

export type FireQaHandoffKickResult =
  | {
      ok: true;
      qaAgentRoot: string;
      stdout: string;
    }
  | {
      ok: false;
      qaAgentRoot: string;
      reason: string;
    };

/**
 * Hard-kick Argus: write qa-pending-execute.json under qa-agent + print QA_WAKE_EXECUTE.
 * Prefer calling qa-agent CLI when available; always fall back to direct write.
 */
export function fireQaHandoffKick(input: {
  engineRoot: string;
  slug: string;
  ticketKey: string;
  config?: QaKickBridgeConfig;
  env?: NodeJS.ProcessEnv;
}): FireQaHandoffKickResult {
  const qaRoot = resolveQaAgentRoot(
    input.engineRoot,
    input.config ?? {},
    input.env ?? process.env,
  );
  if (!existsSync(qaRoot)) {
    return {
      ok: false,
      qaAgentRoot: qaRoot,
      reason: `qa-agent root missing at ${qaRoot} — set QA_AGENT_ROOT or qa_kick.qa_agent_path`,
    };
  }

  const script = join(qaRoot, "scripts/qa_handoff_kick.ts");
  if (existsSync(script)) {
    try {
      const stdout = execFileSync(
        "npx",
        [
          "--yes",
          "tsx",
          "scripts/qa_handoff_kick.ts",
          input.slug,
          "--ticket",
          input.ticketKey,
          "--source",
          "handoff",
        ],
        {
          cwd: qaRoot,
          encoding: "utf8",
          env: input.env ?? process.env,
        },
      );
      return { ok: true, qaAgentRoot: qaRoot, stdout };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(
        `QA_HANDOFF_KICK_CLI_FALLBACK ${JSON.stringify({
          slug: input.slug,
          ticket: input.ticketKey,
          detail,
        })}`,
      );
      /* fall through to direct write */
    }
  }

  try {
    const state = buildQaWakePayload({
      slug: input.slug,
      ticketKey: input.ticketKey,
      source: "handoff",
    });
    const path = join(qaRoot, QA_PENDING_EXECUTE_PATH);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(state, null, 2) + "\n", "utf8");
    const line = formatQaWakeExecuteLine(state);
    const stdout =
      `${line}\n` +
      `QA_PENDING_EXECUTE_WRITTEN ${JSON.stringify({
        slug: input.slug,
        ticket: input.ticketKey,
        path: QA_PENDING_EXECUTE_PATH,
      })}\n`;
    return { ok: true, qaAgentRoot: qaRoot, stdout };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      qaAgentRoot: qaRoot,
      reason: `failed to write qa pending: ${msg}`,
    };
  }
}
