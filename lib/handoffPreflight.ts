// Handoff preflight helpers — pure.

import {
  buildPrUrlPattern,
  formatHandoffComment,
  formatMergedPrUrl,
  handoffCommentValid,
  MIN_GIT_HASH_LEN,
  stgBuildIdMatchesMain,
  type GitConfig,
} from "./projectConfig.ts";

export function handoffTemplateRegression(git: GitConfig): boolean {
  const sample = formatHandoffComment({
    mergedPrUrl: formatMergedPrUrl(git, 1),
    pipelineBuildNumber: 99,
    stgBuildId: "abc1234",
    mainCommit: "abc1234def567",
    summary: "preflight sample",
  });
  return handoffCommentValid(sample, buildPrUrlPattern(git));
}

export function handoffDocsMentionRequiredFields(
  dodText: string,
  pipelineSkillText: string,
): boolean {
  const required = [
    "handoff",
    "buildId",
    "pipeline",
    "Validate/Testing",
    "PR",
  ];
  const corpus = `${dodText}\n${pipelineSkillText}`;
  return required.every((k) => corpus.toLowerCase().includes(k.toLowerCase()));
}

export function stgBuildIdHashLengthOk(
  stgBuildId: string,
  mainCommit: string,
): boolean {
  const a = stgBuildId.trim();
  const b = mainCommit.trim();
  if (!a || !b) return false;
  if (a.length < MIN_GIT_HASH_LEN || b.length < MIN_GIT_HASH_LEN) return false;
  return stgBuildIdMatchesMain(stgBuildId, mainCommit);
}

export function runHandoffPreflight(input: {
  git: GitConfig;
  dodDoc: string;
  pipelineDoc: string;
}): { ok: true } | { ok: false; reason: string } {
  if (!handoffTemplateRegression(input.git)) {
    return {
      ok: false,
      reason: "formatHandoffComment sample fails handoffCommentValid",
    };
  }
  if (!handoffDocsMentionRequiredFields(input.dodDoc, input.pipelineDoc)) {
    return { ok: false, reason: "DoD or dev-mr-pipeline missing handoff fields" };
  }
  if (!stgBuildIdHashLengthOk("abc1234", "abc1234def567")) {
    return { ok: false, reason: "stgBuildIdMatchesMain min hash length regression" };
  }
  if (stgBuildIdHashLengthOk("abc12", "abc1234def567")) {
    return {
      ok: false,
      reason: "stgBuildIdMatchesMain accepts hash shorter than min length",
    };
  }
  return { ok: true };
}
