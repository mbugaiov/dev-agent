/**
 * Factory latch: which ticket receives mid-flight ### progress comments.
 * Written on pickup; cleared on handoff; read by wait_pr_pipeline wrappers.
 *
 * Optional companion: progress-pr.key — Bitbucket/GitHub PR id for dual-write
 * when tracker is Jira but git.provider is bitbucket (or github).
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function progressTicketKeyPath(root: string, slug: string): string {
  return join(root, "projects", slug, "factory", "progress-ticket.key");
}

export function progressPrKeyPath(root: string, slug: string): string {
  return join(root, "projects", slug, "factory", "progress-pr.key");
}

export function writeProgressTicketKey(
  root: string,
  slug: string,
  ticketKey: string,
): string {
  const path = progressTicketKeyPath(root, slug);
  mkdirSync(join(root, "projects", slug, "factory"), { recursive: true });
  writeFileSync(path, `${ticketKey.trim()}\n`, "utf8");
  return path;
}

export function writeProgressPrKey(
  root: string,
  slug: string,
  prId: string | number,
): string {
  const path = progressPrKeyPath(root, slug);
  mkdirSync(join(root, "projects", slug, "factory"), { recursive: true });
  writeFileSync(path, `${String(prId).trim()}\n`, "utf8");
  return path;
}

export function readProgressTicketKey(
  root: string,
  slug: string,
): string | undefined {
  const path = progressTicketKeyPath(root, slug);
  if (!existsSync(path)) return undefined;
  try {
    const v = readFileSync(path, "utf8").trim();
    return v || undefined;
  } catch {
    return undefined;
  }
}

export function readProgressPrKey(
  root: string,
  slug: string,
): string | undefined {
  const path = progressPrKeyPath(root, slug);
  if (!existsSync(path)) return undefined;
  try {
    const v = readFileSync(path, "utf8").trim();
    return v || undefined;
  } catch {
    return undefined;
  }
}

export function clearProgressTicketKey(root: string, slug: string): void {
  const path = progressTicketKeyPath(root, slug);
  try {
    unlinkSync(path);
  } catch {
    /* missing ok */
  }
}

export function clearProgressPrKey(root: string, slug: string): void {
  const path = progressPrKeyPath(root, slug);
  try {
    unlinkSync(path);
  } catch {
    /* missing ok */
  }
}

/** Clear both ticket and PR progress latches (handoff). */
export function clearProgressLatches(root: string, slug: string): void {
  clearProgressTicketKey(root, slug);
  clearProgressPrKey(root, slug);
}
