import { describe, expect, it } from "vitest";
import { markdownToAdf, plainTextToAdf } from "../../lib/jiraClient.ts";

describe("markdownToAdf", () => {
  it("renders Argus seat-start with heading + bold", () => {
    const doc = markdownToAdf(
      [
        "### Argus started",
        "",
        "**Ticket:** RQ-2052",
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

  it("parses ordered lists for QA PASS verified sections", () => {
    const doc = markdownToAdf("**Verified:**\n\n1. one\n2. two\n");
    expect(doc.content.some((n) => n.type === "orderedList")).toBe(true);
  });
});
