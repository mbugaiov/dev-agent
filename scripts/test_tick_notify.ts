#!/usr/bin/env tsx
/**
 * Smoke test for dev factory tick notifications.
 *
 * Sends a real Adaptive Card to the configured webhook and reports the outcome
 * loudly. Use after editing projects/<slug>/.secrets/jira.env to prove delivery
 * works rather than discovering silence hours later.
 *
 * Usage: npx tsx scripts/test_tick_notify.ts <slug> [--idle]
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkWebhookUrl,
  formatTickNotifyFailure,
  getDevFactoryTeamsWebhookUrl,
  postDevFactoryTickNotify,
  shouldReportTickNotifyOutcome,
} from "../lib/devFactoryTickNotify.ts";
import { loadProjectConfig } from "../lib/loadProject.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv[2] ?? process.env.DEV_AGENT_SLUG ?? "";
const idle = process.argv.includes("--idle");

if (!slug) {
  console.error("Usage: test_tick_notify.ts <slug> [--idle]");
  process.exit(2);
}

// Fail fast with a readable reason before attempting a POST.
const check = checkWebhookUrl(getDevFactoryTeamsWebhookUrl());
if (!check.ok) {
  console.error(
    `TICK_NOTIFY_SMOKE_FAILED {"slug":"${slug}","problem":"${check.problem}","detail":${JSON.stringify(check.detail)}}`,
  );
  if (check.problem === "not_configured") {
    console.error(
      "Teams notification is optional. To enable it, set a QUOTED DEV_FACTORY_TEAMS_WEBHOOK_URL in " +
        `projects/${slug}/.secrets/jira.env`,
    );
  }
  process.exit(1);
}

const config = loadProjectConfig(ROOT, slug);
const nextWakeUtc = new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");

const outcome = await postDevFactoryTickNotify(
  idle
    ? { slug: config.slug, kind: "idle", nextWakeUtc }
    : {
        slug: config.slug,
        kind: "wake",
        count: 1,
        pickKey: "SMOKE-TEST",
        pickSummary: "Tick notify smoke test — safe to ignore",
        issues: [
          { key: "SMOKE-TEST", summary: "Tick notify smoke test — safe to ignore" },
        ],
        nextWakeUtc,
      },
);

if (outcome.delivered) {
  console.log(
    `TICK_NOTIFY_SMOKE_OK {"slug":"${config.slug}","status":${outcome.status},"kind":"${idle ? "idle" : "wake"}"}`,
  );
  process.exit(0);
}

if (shouldReportTickNotifyOutcome(outcome)) {
  console.error(formatTickNotifyFailure(config.slug, idle ? "idle" : "wake", outcome));
}
process.exit(1);
