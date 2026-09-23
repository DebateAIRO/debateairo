// ARCH-REV-S03 — trace parser v2: expands ranges (R2-R6, S8-S10) and sub-numbers (R14.2), splits on ";" only.
import { readFileSync } from "node:fs";
const PLAN = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/debate-tiers/slices/S03/PLAN.md";
const plan = readFileSync(PLAN, "utf8");
const L = plan.split("\n");

const DASH = "[-–—]";
function expand(text, letter) {
  const out = new Set();
  const rangeRe = new RegExp(`${letter}(\\d+)(?:\\.\\d+)?\\s*${DASH}\\s*(?:${letter})?(\\d+)`, "g");
  const consumed = [];
  for (const m of text.matchAll(rangeRe)) {
    const a = Number(m[1]), b = Number(m[2]);
    if (b >= a && b - a < 40) { for (let i = a; i <= b; i++) out.add(i); consumed.push(m[0]); }
  }
  let rest = text;
  for (const c of consumed) rest = rest.split(c).join(" ");
  const oneRe = new RegExp(`${letter}(\\d+)`, "g");
  for (const m of rest.matchAll(oneRe)) out.add(Number(m[1]));
  return [...out].sort((a, b) => a - b);
}

// forward table (§3): | R7 | clause | S12 | C1 |
const fwd = new Map();
for (const line of L) {
  const m = line.match(/^\|\s*(R\d+)\s*\|([^|]*)\|([^|]*)\|([^|]*)\|\s*$/);
  if (!m) continue;
  const steps = expand(m[3], "S");
  const prev = fwd.get(m[1]) ?? [];
  fwd.set(m[1], [...new Set([...prev, ...steps])].sort((a, b) => a - b));
}
// reverse prose
const revBlock = plan.slice(plan.indexOf("**Reverse trace"), plan.indexOf("**Zero orphans"));
const rev = new Map();
for (const chunk of revBlock.split(";")) {
  const m = chunk.match(/(S[\dS/–-]*\d)\s*→\s*([\s\S]*)/);
  if (!m) continue;
  const steps = expand(m[1], "S");
  const reqs = expand(m[2], "R").map((n) => "R" + n);
  for (const s of steps) rev.set(s, [...new Set([...(rev.get(s) ?? []), ...reqs])]);
}
const declared = new Set([...plan.matchAll(/^\*\*S(\d+)\.\s/gm)].map((m) => Number(m[1])));

console.log("=== trace v2 ===");
const noFwd = [];
for (let i = 1; i <= 33; i++) if (!fwd.has("R" + i)) noFwd.push("R" + i);
console.log(`R1..R33 with a forward row naming numbered steps: ${33 - noFwd.length}/33${noFwd.length ? "  (no numbered step: " + noFwd.join(", ") + ")" : ""}`);
const noRev = [];
for (let i = 1; i <= 36; i++) if (!rev.has(i)) noRev.push("S" + i);
console.log(`S1..S36 present in the reverse trace: ${36 - noRev.length}/36${noRev.length ? "  MISSING: " + noRev.join(", ") : ""}`);
console.log(`S1..S36 declared as §1 headings: ${declared.size}/36`);

const dis = [];
for (const [req, steps] of fwd) for (const s of steps) {
  const back = rev.get(s) ?? [];
  if (!back.includes(req)) dis.push(`forward ${req}->S${s} ; reverse S${s}->[${back.join(",")}] omits ${req}`);
}
for (const [s, reqs] of rev) for (const r of reqs) {
  const fs = fwd.get(r) ?? [];
  if (!fs.includes(s)) dis.push(`reverse S${s}->${r} ; forward ${r}->[${fs.map((x) => "S" + x).join(",")}] omits S${s}`);
}
console.log(`\n-- asymmetries after range/sub-number expansion (${dis.length}) --`);
for (const d of dis) console.log("  " + d);

// every step claimed by at least one requirement somewhere
const covered = new Set();
for (const arr of fwd.values()) for (const s of arr) covered.add(s);
const orphan = [...declared].filter((s) => !covered.has(s) && !(rev.get(s) ?? []).length).sort((a, b) => a - b);
console.log(`\n-- true orphans (no requirement either way): ${orphan.length ? orphan.map((s) => "S" + s).join(", ") : "none"}`);
const fwdOnlyMissing = [...declared].filter((s) => !covered.has(s)).sort((a, b) => a - b);
console.log(`-- steps absent from the FORWARD table (reverse may still carry them): ${fwdOnlyMissing.length ? fwdOnlyMissing.map((s) => "S" + s).join(", ") : "none"}`);
