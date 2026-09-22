// CODE-REV-S02-C5C6 r1 — design extract -> component, codepoint-exact, skipping the SPEC.
import { readFileSync } from "node:fs";
const D = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/consent-ui/design/turn-10-cookie-consent.html";
const C = (process.env.LANE ?? process.argv[2]) + "/apps/ui/components/consent/PrivacyPolicyModal.tsx";
const design = readFileSync(D, "utf8");
const comp = readFileSync(C, "utf8");
const constOf = (n) => {
  const m = comp.match(new RegExp(`const ${n} =\\s*\\n?\\s*("(?:[^"\\\\]|\\\\.)*")`, "m"));
  return m ? JSON.parse(m[1]) : null;
};
const cases = [
  ["EYEBROW", constOf("EYEBROW")],
  ["TITLE", constOf("TITLE")],
  ["LEDE", constOf("LEDE")],
  ["END_MARKER", constOf("END_MARKER")],
  ["contact", "Questions: "],
  ["mail", "privacy@dezbatere.ro"]
];
for (const [name, s] of cases) {
  const present = s !== null && design.includes(s);
  console.log(`${present ? "PRESENT-IN-DESIGN" : "ABSENT-FROM-DESIGN"}  ${name}  len=${s?.length}`);
}
console.log(`design contains "Download PDF": ${design.includes("Download PDF")} (V-3 removes it; component contains it: ${comp.includes("Download PDF")})`);
