import { readFileSync } from "node:fs";
import { extractBlockingSection, reviewHasBlockers } from "../lib/reviewGate.ts";

const file = process.argv[2] ?? "review.md";
const text = readFileSync(file, "utf8");

if (reviewHasBlockers(text)) {
  const section = extractBlockingSection(text);
  console.error("Review gate FAILED — blocking issues found:");
  if (section) console.error(section);
  process.exit(1);
}

console.log("Review gate: pass");
