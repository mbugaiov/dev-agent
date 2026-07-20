#!/usr/bin/env tsx
/**
 * Verify STG /api/health buildId matches expected merge commit.
 * Usage: check_stg_build.ts <slug> <expected_commit>
 *    or: check_stg_build.ts --url <STG_URL> <expected_commit>
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectConfig } from "../lib/loadProject.ts";
import { parseHealthBuildId, stgHealthUrl } from "../lib/stgBuildCheck.ts";
import { stgBuildIdMatchesMain } from "../lib/projectConfig.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const argv = process.argv.slice(2);
  let stgUrl = process.env.STG_URL ?? "";
  let expected = process.env.EXPECTED_COMMIT ?? "";

  if (argv[0] === "--url") {
    stgUrl = argv[1] ?? "";
    expected = argv[2] ?? "";
  } else {
    const slug = argv[0] ?? process.env.DEV_AGENT_SLUG ?? "";
    expected = argv[1] ?? expected;
    if (!slug) {
      console.error("Usage: check_stg_build.ts <slug> <expected_commit>");
      process.exit(2);
    }
    const config = loadProjectConfig(ROOT, slug);
    stgUrl = config.stg.base_url;
  }

  if (!stgUrl || !expected) {
    console.error("STG URL and expected commit required");
    process.exit(2);
  }

  const healthUrl = stgHealthUrl(stgUrl, "/api/health");
  const res = await fetch(healthUrl, { signal: AbortSignal.timeout(25_000) });

  if (!res.ok) {
    console.error(`STG health failed: ${res.status} ${healthUrl}`);
    console.log("STG_BUILD_MISMATCH");
    process.exit(1);
  }

  const body: unknown = await res.json();
  const stgBuildId = parseHealthBuildId(body);
  const match = stgBuildIdMatchesMain(stgBuildId, expected);

  console.log(
    JSON.stringify({
      healthUrl,
      stgBuildId,
      expected: expected.trim().slice(0, 7),
      match,
    }),
  );

  if (match) {
    console.log("STG_BUILD_OK");
    process.exit(0);
  }
  console.log("STG_BUILD_MISMATCH");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  console.log("STG_BUILD_MISMATCH");
  process.exit(1);
});
