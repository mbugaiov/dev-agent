/**
 * List open merge requests / PRs for a Hephaestus project.
 * Usage: npx tsx scripts/project_open_mrs.ts <slug>
 * Prints: OPEN_MRS {"slug","count","items":[{id,url,title,head?}]}
 * Exit 0 always when probe succeeds (count may be 0).
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectConfig } from "../lib/loadProject.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

type MrItem = { id: string; url: string; title: string; head?: string };

function ghOpenPrs(owner: string, repo: string): MrItem[] {
  const raw = execFileSync(
    "gh",
    [
      "pr",
      "list",
      "-R",
      `${owner}/${repo}`,
      "--state",
      "open",
      "--limit",
      "50",
      "--json",
      "number,title,url,headRefName",
    ],
    { encoding: "utf8" },
  );
  const rows = JSON.parse(raw) as {
    number: number;
    title: string;
    url: string;
    headRefName?: string;
  }[];
  return rows.map((r) => ({
    id: String(r.number),
    url: r.url,
    title: r.title,
    head: r.headRefName,
  }));
}

async function bbOpenPrs(
  workspace: string,
  repo: string,
): Promise<MrItem[]> {
  const user = process.env.BITBUCKET_USERNAME ?? "";
  const token = process.env.BITBUCKET_TOKEN ?? "";
  if (!user || !token) {
    throw new Error("BITBUCKET_USERNAME + BITBUCKET_TOKEN required for open MR probe");
  }
  const auth = Buffer.from(`${user}:${token}`).toString("base64");
  const url =
    `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/pullrequests?state=OPEN&pagelen=50`;
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Bitbucket PRs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = (await res.json()) as {
    values?: { id: number; title: string; links?: { html?: { href?: string } }; source?: { branch?: { name?: string } } }[];
  };
  return (body.values ?? []).map((r) => ({
    id: String(r.id),
    url: r.links?.html?.href ?? `https://bitbucket.org/${workspace}/${repo}/pull-requests/${r.id}`,
    title: r.title,
    head: r.source?.branch?.name,
  }));
}

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: project_open_mrs.ts <slug>");
    process.exit(2);
  }
  const config = loadProjectConfig(ROOT, slug);
  let items: MrItem[] = [];
  if (config.git.provider === "github") {
    items = ghOpenPrs(config.git.workspace, config.git.repo);
  } else {
    items = await bbOpenPrs(config.git.workspace, config.git.repo);
  }
  console.log(
    `OPEN_MRS ${JSON.stringify({
      slug,
      provider: config.git.provider,
      repo: `${config.git.workspace}/${config.git.repo}`,
      count: items.length,
      items: items.map((i) => ({
        id: i.id,
        url: i.url,
        title: i.title.slice(0, 120),
        head: i.head,
      })),
    })}`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
