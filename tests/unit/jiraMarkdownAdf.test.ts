import { describe, expect, it } from "vitest";
import { markdownToAdf, plainTextToAdf } from "../../lib/jiraClient.ts";

describe("markdownToAdf", () => {
  it("renders Argus seat-start with heading + bold", () => {
    const doc = markdownToAdf(
      [
        "### Argus started",
        "",
        "**Ticket:** TST-123",
        "**Mode:** QA validate",
        "",
        "`post_agent_started · test`",
      ].join("\n"),
    );
    expect(doc.type).toBe("doc");
    expect(doc.content[0]?.type).toBe("heading");
    expect(doc.content[0]?.attrs).toEqual({ level: 3 });
    const ticketPara = doc.content.find(
      (n) =>
        n.type === "paragraph" &&
        n.content?.some((c) => c.text === "Ticket:"),
    );
    expect(ticketPara?.content?.[0]?.marks?.[0]?.type).toBe("strong");
  });

  it("keeps plainTextToAdf as markdown alias", () => {
    const a = markdownToAdf("**Mode:** pickup");
    const b = plainTextToAdf("**Mode:** pickup");
    expect(b).toEqual(a);
  });

  it("does not italicize snake_case identifiers", () => {
    const doc = markdownToAdf("fix_login_flow and a_b_c stay plain");
    const texts = (doc.content[0]?.content ?? []).map((n) => n.text).join("");
    expect(texts).toBe("fix_login_flow and a_b_c stay plain");
    expect(doc.content[0]?.content?.every((n) => !n.marks)).toBe(true);
  });

  it("keeps pickup footer as a single italic line", () => {
    const doc = markdownToAdf("*pickup_jira_ticket · 2026-01-01T00:00:00.000Z*");
    const nodes = doc.content[0]?.content ?? [];
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.marks?.[0]?.type).toBe("em");
    expect(nodes[0]?.text).toContain("pickup_jira_ticket");
  });

  it("allows simple _italic_ without internal underscores", () => {
    const doc = markdownToAdf("_Posted by agent._");
    const nodes = doc.content[0]?.content ?? [];
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.marks?.[0]?.type).toBe("em");
    expect(nodes[0]?.text).toBe("Posted by agent.");
  });

  it("parses bullet lists", () => {
    const doc = markdownToAdf("- one\n- two\n");
    expect(doc.content[0]?.type).toBe("bulletList");
  });
});
