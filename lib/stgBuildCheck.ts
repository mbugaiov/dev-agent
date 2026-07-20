// STG /api/health buildId verification — pure, no I/O.

import { stgBuildIdMatchesMain } from "./projectConfig.ts";

export type HealthPayload = {
  buildId?: string;
  status?: string;
};

export function parseHealthBuildId(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const buildId = (json as HealthPayload).buildId;
  return typeof buildId === "string" ? buildId.trim() : "";
}

export function stgHealthUrl(baseUrl: string, healthPath = "/api/health"): string {
  return `${baseUrl.replace(/\/$/, "")}${healthPath.startsWith("/") ? healthPath : `/${healthPath}`}`;
}

export type StgVerifyInput = {
  merged: boolean;
  deploySuccessful: boolean;
  deploySkippedNonAppOnly: boolean;
  stgBuildId: string;
  mainCommit: string;
};

export function mayTransitionToValidateTesting(input: StgVerifyInput): boolean {
  if (!input.merged) return false;
  if (
    !stgBuildIdMatchesMain(input.stgBuildId.trim(), input.mainCommit.trim())
  ) {
    return false;
  }
  if (input.deploySuccessful) return true;
  if (input.deploySkippedNonAppOnly) return true;
  return false;
}

export function formatDeployComment(input: {
  stgUrl: string;
  buildId: string;
  pipelineBuildNumber: number | string;
  commit: string;
}): string {
  const url = input.stgUrl.replace(/\/$/, "");
  const shortCommit = input.commit.trim().slice(0, 7);
  return (
    `Deployed to STG: ${url} buildId=${input.buildId} ` +
    `(health: ${url}/api/health) — pipeline #${input.pipelineBuildNumber}, commit ${shortCommit}.`
  );
}
