// Shared Jira REST helpers — env from projects/<slug>/.secrets/jira.env

export type JiraAuth = { base: string; email: string; token: string };

export function jiraAuthFromEnv(): JiraAuth {
  const base = process.env.JIRA_BASE_URL ?? "";
  const email = process.env.JIRA_EMAIL ?? process.env.BITBUCKET_USERNAME ?? "";
  const token = process.env.JIRA_API_TOKEN ?? process.env.ATLASSIAN_TOKEN ?? "";
  if (!base || !email || !token) {
    throw new Error(
      "JIRA_BASE_URL + JIRA_EMAIL + JIRA_API_TOKEN required (project .secrets/jira.env)",
    );
  }
  return { base: base.replace(/\/$/, ""), email, token };
}

export async function jiraFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const { base, email, token } = jiraAuthFromEnv();
  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

type AdfMark = { type: string; attrs?: Record<string, string> };
type AdfNode = {
  type: string;
  text?: string;
  marks?: AdfMark[];
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
};

function textNode(text: string, marks?: AdfMark[]): AdfNode {
  const node: AdfNode = { type: "text", text };
  if (marks?.length) node.marks = marks;
  return node;
}

/** Inline subset: **bold**, *italic*, _italic_, `code`, [label](url).

 * Underscore italics use CommonMark-ish word boundaries so snake_case
 * tokens (e.g. fix_login_flow, VERDICT_REVIEW_PASS) are not emphasis.
 */
function parseInline(text: string): AdfNode[] {
  if (!text) return [textNode("")];
  const pattern =
    /(\*\*[^*]+\*\*|\*[^*]+\*|(?<![A-Za-z0-9_])_[^_]+_(?![A-Za-z0-9_])|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(pattern);
  const nodes: AdfNode[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("**") && part.endsWith("**")) {
      nodes.push(textNode(part.slice(2, -2), [{ type: "strong" }]));
    } else if (part.startsWith("*") && part.endsWith("*")) {
      nodes.push(textNode(part.slice(1, -1), [{ type: "em" }]));
    } else if (part.startsWith("_") && part.endsWith("_") && part.length >= 3) {
      // Only captured when word-bounded by the regex above.
      nodes.push(textNode(part.slice(1, -1), [{ type: "em" }]));
    } else if (part.startsWith("`") && part.endsWith("`")) {
      nodes.push(textNode(part.slice(1, -1), [{ type: "code" }]));
    } else if (part.startsWith("[") && part.includes("](")) {
      const m = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (m) {
        nodes.push({
          type: "text",
          text: m[1]!,
          marks: [{ type: "link", attrs: { href: m[2]! } }],
        });
      } else {
        nodes.push(textNode(part));
      }
    } else {
      nodes.push(textNode(part));
    }
  }
  return nodes.length ? nodes : [textNode("")];
}

function paragraph(text: string): AdfNode {
  return { type: "paragraph", content: parseInline(text) };
}

function heading(level: number, text: string): AdfNode {
  const lv = Math.max(1, Math.min(6, level));
  return {
    type: "heading",
    attrs: { level: lv },
    content: parseInline(text),
  };
}

function listItem(text: string): AdfNode {
  return { type: "listItem", content: [paragraph(text)] };
}

/**
 * Convert a Markdown subset to Jira ADF so comments render headings/bold/lists
 * (seat-start banners, handoffs, QA notes). Matches qa-agent `jira_adf.py` scope.
 */
export function markdownToAdf(text: string): {
  type: "doc";
  version: 1;
  content: AdfNode[];
} {
  const content: AdfNode[] = [];
  const lines = text.split(/\r?\n/);
  let i = 0;
  let ul: string[] = [];
  let ol: string[] = [];

  const flushLists = () => {
    if (ul.length) {
      content.push({
        type: "bulletList",
        content: ul.map(listItem),
      });
      ul = [];
    }
    if (ol.length) {
      content.push({
        type: "orderedList",
        attrs: { order: 1 },
        content: ol.map(listItem),
      });
      ol = [];
    }
  };

  const headingRe = /^(#{1,6})\s+(.*)$/;
  const ulRe = /^(\s*)[-*+]\s+(.*)$/;
  const olRe = /^(\s*)\d+\.\s+(.*)$/;
  const fenceRe = /^```(\w*)$/;
  const hrRe = /^(-{3,}|\*{3,}|_{3,})\s*$/;

  while (i < lines.length) {
    const line = lines[i]!.replace(/\s+$/, "");

    if (line.trim() === "") {
      flushLists();
      i += 1;
      continue;
    }

    const fence = line.trim().match(fenceRe);
    if (fence) {
      flushLists();
      const lang = fence[1] || "";
      i += 1;
      const bodyLines: string[] = [];
      while (i < lines.length && !fenceRe.test(lines[i]!.trim())) {
        bodyLines.push(lines[i]!);
        i += 1;
      }
      if (i < lines.length) i += 1;
      const block: AdfNode = {
        type: "codeBlock",
        content: [textNode(bodyLines.join("\n").replace(/\n+$/, ""))],
      };
      if (lang) block.attrs = { language: lang };
      content.push(block);
      continue;
    }

    if (hrRe.test(line.trim())) {
      flushLists();
      content.push({ type: "rule" });
      i += 1;
      continue;
    }

    const hm = line.match(headingRe);
    if (hm) {
      flushLists();
      content.push(heading(hm[1]!.length, hm[2]!.trim()));
      i += 1;
      continue;
    }

    const ulm = line.match(ulRe);
    if (ulm) {
      if (ol.length) {
        content.push({
          type: "orderedList",
          attrs: { order: 1 },
          content: ol.map(listItem),
        });
        ol = [];
      }
      ul.push(ulm[2]!.trim());
      i += 1;
      continue;
    }

    const olm = line.match(olRe);
    if (olm) {
      if (ul.length) {
        content.push({
          type: "bulletList",
          content: ul.map(listItem),
        });
        ul = [];
      }
      ol.push(olm[2]!.trim());
      i += 1;
      continue;
    }

    if (line.startsWith("> ")) {
      flushLists();
      content.push(paragraph(line.slice(2).trim()));
      i += 1;
      continue;
    }

    flushLists();
    content.push(paragraph(line.trim()));
    i += 1;
  }

  flushLists();
  if (!content.length) content.push(paragraph("(empty)"));

  return { type: "doc", version: 1, content };
}

/** Flatten ADF to searchable text (headings/paragraphs as lines). */
export function adfToPlainText(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node !== "object") return "";
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (typeof n.text === "string") return n.text;
  const inner = (n.content ?? []).map(adfToPlainText);
  if (
    n.type === "paragraph" ||
    n.type === "heading" ||
    n.type === "listItem" ||
    n.type === "codeBlock"
  ) {
    return inner.join("");
  }
  return inner.filter(Boolean).join("\n");
}

/** @deprecated Prefer markdownToAdf — kept for callers; now parses Markdown. */
export function plainTextToAdf(text: string) {
  return markdownToAdf(text);
}

export function validateTestingTransitionId(
  transitions?: { validate_testing?: string },
): string {
  return (
    process.env.JIRA_VALIDATE_TESTING_TRANSITION ??
    transitions?.validate_testing ??
    "51"
  );
}
