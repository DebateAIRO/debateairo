// ARCH-REV-S01 probe 4 — the reviewer's own fixture for PLAN.md §8's C4 claims.
// Replicates, line for line, the assertion logic of the three guards the PLAN
// says detect a CSS mutant, then runs each against KNOWN-GOOD and KNOWN-BAD input.
//   guard A  tests/unit/consent-s02-style-contract.test.ts:248-249
//   guard B  tests/render/consent-bar.test.tsx:270-280
//   guard C  tests/unit/t9-mode-tokens.test.ts:627-647 ("no mode-inert colour literal")
const fs = require("node:fs");
const LANE = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s01/dialectical-engine";
const css = fs.readFileSync(`${LANE}/apps/ui/app/globals.css`, "utf8");

const S01_OPEN = "/* === consent-ui S01 === */";
const S01_CLOSE = "/* === end consent-ui S01 === */";
const S02_OPEN = "/* === consent-ui S02 === */";
const S02_CLOSE = "/* === end consent-ui S02 === */";

// ---- guard A: after S02's close marker, only whitespace
function guardA(text) {
  const after = text.slice(text.indexOf(S02_CLOSE) + S02_CLOSE.length);
  return { pass: after.trim() === "", tail: JSON.stringify(after.slice(0, 60)) };
}
// ---- guard B: after S01's close marker — whitespace, or exactly one S02 block then whitespace
function guardB(text) {
  const tail = text.slice(text.indexOf(S01_CLOSE) + S01_CLOSE.length);
  const s02At = tail.indexOf(S02_OPEN);
  if (s02At === -1) return { pass: tail.trim() === "", why: "no S02 block" };
  const opens = tail.split(S02_OPEN).length - 1;
  const closes = tail.split(S02_CLOSE).length - 1;
  const between = tail.slice(0, s02At).trim();
  const after = tail.slice(tail.indexOf(S02_CLOSE) + S02_CLOSE.length).trim();
  return {
    pass: opens === 1 && closes === 1 && between === "" && after === "",
    opens, closes, between: JSON.stringify(between.slice(0, 40)), after: JSON.stringify(after.slice(0, 40))
  };
}
// ---- guard C: t9's colour-literal sweep over globals.css outside the two token blocks
function tokenBlockRanges(text) {
  const lines = text.split("\n");
  const find = (re, label) => {
    const start = lines.findIndex((l) => re.test(l));
    if (start === -1) throw new Error(`${label} token block not found`);
    const end = lines.findIndex((l, i) => i > start && /^\}/.test(l));
    if (end === -1) throw new Error(`${label} token block is not closed`);
    return [start + 1, end + 1];
  };
  return [find(/^:root\s*\{/, ":root"), find(/^html\[data-mode="chamber"\]\s*\{/, "chamber")];
}
function guardC(text) {
  const patterns = /oklch\(|#[0-9a-f]{3,8}\b|\brgba?\(/i;
  const ranges = tokenBlockRanges(text);
  const inside = (n) => ranges.some(([s, e]) => n >= s && n <= e);
  const hits = [];
  text.split("\n").forEach((line, i) => {
    const n = i + 1;
    if (inside(n)) return;
    if (patterns.test(line)) hits.push(`${n}:${line.trim().slice(0, 70)}`);
  });
  return { pass: hits.length === 0, hitCount: hits.length, first: hits.slice(0, 3), last: hits.slice(-2) };
}

// ---- the three inputs
const insertAt = (text, lineNo, block) => {
  const lines = text.split("\n");
  lines.splice(lineNo, 0, block);           // AFTER line `lineNo` (1-indexed)
  return lines.join("\n");
};

const KNOWN_GOOD = css;                                                  // base
const S01_PLACEMENT = insertAt(css, 6206,
  `.ndPlanTier { display: flex; gap: 8px; }\n.ndPlanTierItem[aria-checked="true"] { border-color: var(--accent); }`);
const APPENDED = `${css}\n.ndPlanTier { display: flex; gap: 8px; }\n`;   // PLAN S01-40's named mutant
const S01_WITH_LITERAL = insertAt(css, 6206,
  `.ndPlanTierItem:disabled { color: #8A63C9; background: rgba(0,0,0,.04); }`);
const NEW_TOKEN_ONLY_ROOT = css;                                         // (inventory case tested separately)

const cases = [
  ["KNOWN-GOOD (base globals.css)", KNOWN_GOOD],
  ["S01's PLANNED placement: rules inserted after .ndKeyHint (:6206)", S01_PLACEMENT],
  ["MUTANT 1: a rule appended at end-of-file (PLAN S01-40's own mutant)", APPENDED],
  ["MUTANT 2: S01's placement WITH a raw colour literal (#hex + rgba) — R17's ban", S01_WITH_LITERAL]
];

for (const [label, text] of cases) {
  console.log(`\n=== ${label} ===`);
  const a = guardA(text), b = guardB(text), c = guardC(text);
  console.log(`  guard A consent-s02-style-contract:248-249  -> ${a.pass ? "PASS" : "FAIL"}  tail=${a.tail}`);
  console.log(`  guard B consent-bar:270-280                 -> ${b.pass ? "PASS" : "FAIL"}  ${JSON.stringify(b)}`);
  console.log(`  guard C t9 "no mode-inert colour literal"   -> ${c.pass ? "PASS" : "FAIL"}  hits=${c.hitCount}  last=${JSON.stringify(c.last)}`);
}

console.log(`\n=== THE QUESTION THAT DECIDES C4's colour-literal arm ===`);
const baseHits = guardC(KNOWN_GOOD).hitCount;
const mutantHits = guardC(S01_WITH_LITERAL).hitCount;
console.log(`  guard C hits at base   = ${baseHits}  (assertion is expect(hits).toEqual([]) -> already FAILING at base)`);
console.log(`  guard C hits w/ mutant = ${mutantHits}`);
console.log(`  the case's pass/fail changes: ${(baseHits === 0) !== (mutantHits === 0)}`);
console.log(`  => t9-mode-tokens passed/failed pair moves: ${(baseHits === 0) !== (mutantHits === 0) ? "YES" : "NO — the C4 command cannot see this mutant"}`);
