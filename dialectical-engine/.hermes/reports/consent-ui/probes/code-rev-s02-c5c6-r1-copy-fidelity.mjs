// CODE-REV-S02-C5C6 r1 — copy fidelity, codepoint-level, SPEC §Copy vs the shipped component.
// SPEC is read from the MAIN tree (COMMON §10.36); the component from $LANE.
import { readFileSync } from "node:fs";
const SPEC = process.env.SPEC ?? "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/consent-ui/slices/S02/SPEC.md";
const LANE = process.env.LANE ?? process.argv[2];
if (!LANE) { console.error("set LANE"); process.exit(97); }
const spec = readFileSync(SPEC, "utf8").split("\n");
const comp = readFileSync(`${LANE}/apps/ui/components/consent/PrivacyPolicyModal.tsx`, "utf8");

const dump = (s) => [...s].map((c) => {
  const cp = c.codePointAt(0);
  return cp > 126 ? `U+${cp.toString(16).toUpperCase().padStart(4,"0")}` : c;
}).join("");

// SPEC lines that carry the header copy verbatim (bullet form "- eyebrow: `…`")
const grab = (prefix) => {
  const line = spec.find((l) => l.startsWith(prefix));
  if (line === undefined) return null;
  const m = line.match(/`([^`]*)`\s*$/);
  return m ? m[1] : null;
};
const expected = {
  eyebrow: grab("- eyebrow: "),
  title: grab("- title: "),
  lede: grab("- lede: ")
};
// End marker: the SPEC line "**End marker** — `…`"
const endLine = spec.find((l) => l.startsWith("**End marker**"));
expected.end = endLine ? endLine.match(/`([^`]*)`/)[1] : null;

// Shipped constants, read out of the component source as JS string literals.
const constOf = (name) => {
  const re = new RegExp(`const ${name} =\\s*\\n?\\s*("(?:[^"\\\\]|\\\\.)*")`, "m");
  const m = comp.match(re);
  return m ? JSON.parse(m[1]) : null;
};
const shipped = {
  eyebrow: constOf("EYEBROW"),
  title: constOf("TITLE"),
  lede: constOf("LEDE"),
  end: constOf("END_MARKER"),
  gateHint: constOf("GATE_HINT")
};

let bad = 0;
for (const k of ["eyebrow", "title", "lede", "end"]) {
  const e = expected[k], s = shipped[k];
  const ok = e !== null && s !== null && e === s;
  if (!ok) bad++;
  console.log(`${ok ? "MATCH" : "MISMATCH"}  ${k}  len(spec)=${e?.length} len(ship)=${s?.length}`);
  if (!ok) { console.log("  spec: " + dump(String(e))); console.log("  ship: " + dump(String(s))); }
}
console.log("");
console.log("codepoint profile of the shipped constants:");
for (const [k, v] of Object.entries(shipped)) {
  if (v === null) { console.log(`  ${k}: <not found>`); bad++; continue; }
  const nonAscii = [...v].map((c,i)=>[c,i]).filter(([c])=>c.codePointAt(0)>126)
    .map(([c,i])=>`U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4,"0")}@${i}`);
  console.log(`  ${k}: len=${v.length} nonAscii=[${nonAscii.join(" ")}]`);
}
console.log("");
// The SPEC's declared footer contact + the honesty rule
console.log("contact literal present in component:",
  comp.includes('"Questions: "') && comp.includes('"privacy@dezbatere.ro"'));
console.log('literal \\uXXXX escapes in the component source:',
  (comp.match(/\\u[0-9A-Fa-f]{4}/g) ?? []).length);
console.log('the word "Download PDF" anywhere in the component:', comp.includes("Download PDF"));
console.log("");
// Inlined policy prose: does any SECTION body or bullet string appear literally in the component?
const bodies = [];
for (const l of spec) {
  const m = l.match(/^\*\*\d\d · .*\*\* — `(.+)`$/);
  if (m) bodies.push(m[1]);
  const b = l.match(/^- `(.+)`$/);
  if (b && b[1].length > 40) bodies.push(b[1]);
}
const inlined = bodies.filter((b) => comp.includes(b.slice(0, 40)));
console.log(`policy section bodies/bullets scanned: ${bodies.length}; inlined into the component: ${inlined.length}`);
for (const i of inlined) console.log("  INLINED> " + i.slice(0, 60));
process.exit(bad === 0 ? 0 : 1);
