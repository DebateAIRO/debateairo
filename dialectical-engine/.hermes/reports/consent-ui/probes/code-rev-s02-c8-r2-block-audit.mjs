// CODE-REV-S02-C8-r2 — N2 duplicate-comment scan + block discipline. Lane from argv (COMMON §10.35).
import { readFileSync } from "node:fs";
const lane = process.argv[2];
const css = readFileSync(`${lane}/apps/ui/app/globals.css`, "utf8");
const OPEN = "/* === consent-ui S02 === */", CLOSE = "/* === end consent-ui S02 === */";
const o = css.indexOf(OPEN), c = css.indexOf(CLOSE);
console.log(`markers: open occurrences=${css.split(OPEN).length - 1} close occurrences=${css.split(CLOSE).length - 1}`);
console.log(`after the closing marker: ${JSON.stringify(css.slice(c + CLOSE.length))}`);
const block = css.slice(o + OPEN.length, c);
// --- N2: duplicated comments inside the block
const comments = [...block.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => m[0]);
const norm = (s) => s.replace(/\s+/g, " ").trim();
const seen = new Map();
for (const cm of comments) seen.set(norm(cm), (seen.get(norm(cm)) || 0) + 1);
const dups = [...seen].filter(([, n]) => n > 1);
console.log(`comments in block: ${comments.length}   DUPLICATED (normalised): ${dups.length}`);
for (const [t, n] of dups) console.log(`   x${n}  ${t.slice(0, 80)}`);
// the surviving gate-hint comment and what follows it
const lines = css.split("\n");
const hits = lines.map((l, i) => [i + 1, l]).filter(([, l]) => l.includes("The reason the button is disabled reaches assistive technology"));
console.log(`gate-hint comment copies in the FILE: ${hits.length} at lines ${hits.map(([n]) => n).join(", ")}`);
for (const [n] of hits) console.log(`   line ${n + 5}: ${lines[n + 4]}`);
// --- block discipline
const colour = block.match(/oklch\(|#[0-9a-f]{3,8}\b|\brgba?\(/gi) || [];
const tokens = block.match(/^\s*--[a-z0-9-]+\s*:/gim) || [];
console.log(`colour literals in block (raw text, comments included): ${colour.length} ${JSON.stringify(colour)}`);
console.log(`token declarations in block: ${tokens.length}`);
console.log(`var(--focus) references in block: ${(block.match(/var\(--focus\)/g) || []).length}`);
console.log(`:focus-visible selector lines in block: ${(block.match(/:focus-visible/g) || []).length}`);
// at-rule counts, for the record (the handoff's number, not the file's)
console.log(`@keyframes in the WHOLE file: ${(css.match(/@keyframes\b/g) || []).length}   @media: ${(css.match(/@media\b/g) || []).length}`);
console.log(`@keyframes in the block: ${(block.match(/@keyframes\b/g) || []).length}   @media in the block: ${(block.match(/@media\b/g) || []).length}`);
// top-level rules / duplicate selectors
let depth = 0, start = 0, pre = -1; const rules = [];
for (let i = 0; i < block.length; i += 1) {
  const ch = block[i];
  if (ch === "{") { if (depth === 0) pre = i; depth += 1; }
  else if (ch === "}") { depth -= 1; if (depth === 0) { rules.push(block.slice(start, pre).trim()); start = i + 1; } }
}
const sel = rules.filter((r) => r && !r.startsWith("@"));
const dupSel = [...sel.reduce((m, s) => m.set(s, (m.get(s) || 0) + 1), new Map())].filter(([, n]) => n > 1);
console.log(`top-level rules: ${rules.length}   non-at-rule selectors: ${sel.length}   DUPLICATE selectors: ${JSON.stringify(dupSel)}`);
