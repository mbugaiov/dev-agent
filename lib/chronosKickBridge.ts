/** Resolve pm-agent checkout + fire Chronos bootstrap oneshot. */

import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

export type PmKickBridgeConfig = {
  pm_kick?: { pm_agent_path?: string };
};

/** Resolve Chronos checkout: PM_AGENT_ROOT → project.yaml → sibling ../pm-agent. */
export function resolvePmAgentRoot(
  engineRoot: string,
  config: PmKickBridgeConfig = {},
  env: NodeJS.ProcessEnv = process.env,
): string {
  const fromEnv = env.PM_AGENT_ROOT?.trim();
  if (fromEnv) return resolve(fromEnv);

  const fromYaml = config.pm_kick?.pm_agent_path?.trim();
  if (fromYaml) {
    return isAbsolute(fromYaml) ? fromYaml : resolve(engineRoot, fromYaml);
  }

  return resolve(engineRoot, "../pm-agent");
}

export type EnsureChronosClassify =
  | "armed"
  | "already"
  | "skipped"
  | "failed"
  | "unknown";

/** Pure classifier for ensure_chronos.sh last stdout line. */
export function classifyEnsureChronosLine(
  line: string,
): EnsureChronosClassify {
  if (/CHRONOS_ONESHOT_ARMED/.test(line)) return "armed";
  if (/ALREADY_RUNNING/.test(line)) return "already";
  if (/CHRONOS_ONESHOT_SKIP/.test(line)) return "skipped";
  if (/CHRONOS_ONESHOT_FAIL/.test(line)) return "failed";
  return "unknown";
}

export type FireChronosBootstrapKickResult =
  | {
      ok: true;
      pmAgentRoot: string;
      stdout: string;
      oneshot: EnsureChronosClassify;
    }
  | {
      ok: false;
      pmAgentRoot: string;
      reason: string;
      stdout?: string;
    };

/**
 * Hard-kick Chronos: isolated cursor-agent oneshot for pm-bootstrap.
 * Does not rely on ambient IDE Task.
 */
export function fireChronosBootstrapKick(input: {
  engineRoot: string;
  slug: string;
  ticketKey: string;
  config?: PmKickBridgeConfig;
  env?: NodeJS.ProcessEnv;
}): FireChronosBootstrapKickResult {
  const pmRoot = resolvePmAgentRoot(
    input.engineRoot,
    input.config ?? {},
    input.env ?? process.env,
  );
  if (!existsSync(pmRoot)) {
    return {
      ok: false,
      pmAgentRoot: pmRoot,
      reason: `pm-agent root missing at ${pmRoot} — set PM_AGENT_ROOT or pm_kick.pm_agent_path`,
    };
  }

  const ensure = join(pmRoot, "scripts/ensure_chronos.sh");
  if (!existsSync(ensure)) {
    return {
      ok: false,
      pmAgentRoot: pmRoot,
      reason: "ensure_chronos.sh-missing",
    };
  }

  try {
    const stdout = execFileSync(
      "bash",
      [ensure, input.slug, "--ticket", input.ticketKey],
      {
        encoding: "utf8",
        cwd: pmRoot,
        env: input.env ?? process.env,
        timeout: 30_000,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const lines = stdout.trim().split("\n").filter(Boolean);
    const last = lines[lines.length - 1] ?? "";
    const oneshot = classifyEnsureChronosLine(last);
    if (oneshot === "armed" || oneshot === "already") {
      return { ok: true, pmAgentRoot: pmRoot, stdout, oneshot };
    }
    if (oneshot === "skipped") {
      return {
        ok: false,
        pmAgentRoot: pmRoot,
        reason: "oneshot-skipped",
        stdout,
      };
    }
    return {
      ok: false,
      pmAgentRoot: pmRoot,
      reason: oneshot === "failed" ? "oneshot-failed" : "oneshot-unrecognized",
      stdout,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stdout =
      err && typeof err === "object" && "stdout" in err
        ? String((err as { stdout?: Buffer | string }).stdout ?? "")
        : "";
    const last = stdout.trim().split("\n").filter(Boolean).at(-1) ?? "";
    const oneshot = last
      ? classifyEnsureChronosLine(last)
      : ("failed" as const);
    if (oneshot === "armed" || oneshot === "already") {
      return { ok: true, pmAgentRoot: pmRoot, stdout, oneshot };
    }
    if (oneshot === "skipped") {
      return {
        ok: false,
        pmAgentRoot: pmRoot,
        reason: "oneshot-skipped",
        stdout,
      };
    }
    return {
      ok: false,
      pmAgentRoot: pmRoot,
      reason:
        oneshot === "failed"
          ? `ensure_chronos failed: ${msg.slice(0, 160)}`
          : `ensure_chronos exec failed: ${msg.slice(0, 160)}`,
      stdout,
    };
  }
}
