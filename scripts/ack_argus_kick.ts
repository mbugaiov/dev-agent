/**
 * Ack Hephaestus-side Argus kick latch after spawning Argus Task / qa drain started.
 * Usage: npx tsx scripts/ack_argus_kick.ts [--ticket KEY]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  consumePendingArgusKickState,
  PENDING_ARGUS_KICK_PATH,
  type PendingArgusKickState,
} from "../lib/argusKickPending.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? "") : "";
}

const path = join(ROOT, PENDING_ARGUS_KICK_PATH);
if (!existsSync(path)) {
  console.log("ARGUS_KICK_ACK_SKIP {\"reason\":\"no-pending\"}");
  process.exit(0);
}

const pending = JSON.parse(readFileSync(path, "utf8")) as PendingArgusKickState;
const ticket = arg("--ticket");
if (ticket && pending.ticket !== ticket) {
  console.log(
    `ARGUS_KICK_ACK_SKIP ${JSON.stringify({ reason: "ticket-mismatch", pending: pending.ticket, ticket })}`,
  );
  process.exit(0);
}

writeFileSync(
  path,
  JSON.stringify(consumePendingArgusKickState(pending), null, 2) + "\n",
  "utf8",
);
console.log(
  `ARGUS_KICK_ACK_OK ${JSON.stringify({ ticket: pending.ticket, slug: pending.slug })}`,
);
