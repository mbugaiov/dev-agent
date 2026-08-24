/** Resolve qa-agent checkout + fire hard handoff kick (pending + isolated oneshot). */

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
      oneshot?: "armed" | "already" | "skipped" | "failed" | "unknown";
    }
  | {
      ok: false;
      qaAgentRoot: string;
      reason: string;
    };

/**
 * Hard-kick Argus: write qa-pending-execute.json + ensure isolated oneshot.
 * Never relies on workspace sessionStart/stop hooks (those hit ambient chats).
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

  const parts: string[] = [];
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
      parts.push(stdout.trimEnd());
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(
        `QA_HANDOFF_KICK_CLI_FALLBACK ${JSON.stringify({
          slug: input.slug,
          ticket: input.ticketKey,
          detail,
        })}`,
      );
    }
  }

  if (parts.length === 0) {
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
      parts.push(
        `${line}\n` +
          `QA_PENDING_EXECUTE_WRITTEN ${JSON.stringify({
            slug: input.slug,
            ticket: input.ticketKey,
            path: QA_PENDING_EXECUTE_PATH,
          })}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        qaAgentRoot: qaRoot,
        reason: `failed to write qa pending: ${msg}`,
      };
    }
  }

  const oneshot = ensureArgusOneshot({
    qaAgentRoot: qaRoot,
    slug: input.slug,
    ticketKey: input.ticketKey,
    env: input.env ?? process.env,
  });
  parts.push(oneshot.line);

  return {
    ok: true,
    qaAgentRoot: qaRoot,
    stdout: parts.join("\n") + "\n",
    oneshot: oneshot.status,
  };
}

export function ensureArgusOneshot(input: {
  qaAgentRoot: string;
  slug: string;
  ticketKey: string;
  env?: NodeJS.ProcessEnv;
}): { status: "armed" | "already" | "skipped" | "failed" | "unknown"; line: string } {
  const ensure = join(input.qaAgentRoot, "scripts/ensure_argus.sh");
  if (!existsSync(ensure)) {
    return {
      status: "skipped",
      line: `ARGUS_ONESHOT_SKIP ${JSON.stringify({
        slug: input.slug,
        ticket: input.ticketKey,
        reason: "ensure_argus.sh-missing",
      })}`,
    };
  }
  try {
    const out = execFileSync(
      "bash",
      [ensure, input.slug, "--ticket", input.ticketKey],
      {
        cwd: input.qaAgentRoot,
        encoding: "utf8",
        env: input.env ?? process.env,
        timeout: 30_000,
      },
    ).trim();
    const line = out.split("\n").filter(Boolean).at(-1) ?? out;
    if (line.includes("ARGUS_ONESHOT_ARMED")) {
      return { status: "armed", line };
    }
    if (line.includes("ALREADY_RUNNING")) {
      return { status: "already", line };
    }
    if (line.includes("ARGUS_ONESHOT_SKIP")) {
      return { status: "skipped", line };
    }
    if (line.includes("ARGUS_ONESHOT_FAIL")) {
      return { status: "failed", line };
    }
    return { status: "unknown", line };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stdout =
      err && typeof err === "object" && "stdout" in err
        ? String((err as { stdout?: string }).stdout ?? "")
        : "";
    const line =
      stdout.trim().split("\n").filter(Boolean).at(-1) ||
      `ARGUS_ONESHOT_FAIL ${JSON.stringify({
        slug: input.slug,
        ticket: input.ticketKey,
        reason: msg.slice(0, 200),
      })}`;
    if (line.includes("ALREADY_RUNNING")) return { status: "already", line };
    if (line.includes("ARGUS_ONESHOT_SKIP")) return { status: "skipped", line };
    return { status: "failed", line };
  }
}
