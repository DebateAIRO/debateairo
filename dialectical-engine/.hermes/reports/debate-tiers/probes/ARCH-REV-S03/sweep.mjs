// ARCH-REV-S03 — two mechanical sweeps over PLAN.md:
//  (A) every `path:line` citation: does that line exist in the LANE file?
//  (B) the SPEC<->PLAN trace, parsed BOTH WAYS from the plan's own tables, independently of its prose.
import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const LANE = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s03/dialectical-engine";
const PLAN = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/debate-tiers/slices/S03/PLAN.md";
const plan = readFileSync(PLAN, "utf8");
const planLines = plan.split("\n");

// ---------- (A) citation sweep ----------
// `path/to/file.ext:NN` or `:NN-MM`, inside backticks, as the plan writes them.
const citeRe = /([A-Za-z0-9_./-]+\.(?:ts|tsx|mjs|js|sql|json|css|md|yaml|yml))[:](\d+)(?:\s*[-–]\s*(\d+))?/g;
const lens = new Map();
function lineCount(rel) {
  if (lens.has(rel)) return lens.get(rel);
  const p = join(LANE, rel);
  let n = -1;
  if (existsSync(p) && statSync(p).isFile()) n = readFileSync(p, "utf8").split("\n").length;
  lens.set(rel, n);
  return n;
}
const bad = [], missing = [], ok = [];
for (let i = 0; i < planLines.length; i++) {
  for (const m of planLines[i].matchAll(citeRe)) {
    const [, rel, aRaw, bRaw] = m;
    if (rel.startsWith("docs/") || rel.includes("missions/") || rel.endsWith(".md")) continue; // mission docs, not lane code
    const a = Number(aRaw), b = bRaw ? Number(bRaw) : a;
    const n = lineCount(rel);
    if (n === -1) { missing.push(`PLAN:${i + 1}  ${rel}:${aRaw}${bRaw ? "-" + bRaw : ""}  -> FILE NOT IN LANE`); continue; }
    if (Math.max(a, b) > n) bad.push(`PLAN:${i + 1}  ${rel}:${aRaw}${bRaw ? "-" + bRaw : ""}  -> file has only ${n} lines`);
    else ok.push(`${rel}:${a}`);
  }
}
console.log("=== (A) citation sweep over PLAN.md ===");
console.log(`citations checked against lane files: ${ok.length + bad.length + missing.length}`);
console.log(`-- OUT OF RANGE (${bad.length}) --`);
for (const b of bad) console.log("  " + b);
console.log(`-- FILE NOT PRESENT IN LANE (${missing.length}; a path a step CREATES is legitimate) --`);
for (const m of missing) console.log("  " + m);

// ---------- (B) the trace, both ways, from the plan's own tables ----------
console.log("\n=== (B) SPEC<->PLAN trace, parsed both ways ===");
// Forward table: rows `| R7 | ... | S12 | C1 |`
const fwd = new Map();
for (const line of planLines) {
  const m = line.match(/^\|\s*(R\d+)\s*\|(.*)\|(.*)\|(.*)\|\s*$/);
  if (!m) continue;
  const steps = [...m[3].matchAll(/S(\d+)/g)].map((x) => Number(x[1]));
  if (steps.length === 0) continue;
  const prev = fwd.get(m[1]) ?? [];
  fwd.set(m[1], [...new Set([...prev, ...steps])]);
}
// Reverse prose: `S1 → R1 ...; S2 → R2/R3/R4;`
const revBlock = plan.slice(plan.indexOf("**Reverse trace"), plan.indexOf("**Zero orphans"));
const rev = new Map();
for (const m of revBlock.matchAll(/S(\d+)\s*→\s*([^;.]*)/g)) {
  const reqs = [...m[2].matchAll(/R(\d+)/g)].map((x) => "R" + x[1]);
  rev.set(Number(m[1]), [...new Set(reqs)]);
}
// Steps actually declared in §1 as bold headings `**Sn. ...**`
const declared = new Set();
for (const m of plan.matchAll(/^\*\*S(\d+)\.\s/gm)) declared.add(Number(m[1]));

const allReq = [];
for (let i = 1; i <= 33; i++) allReq.push("R" + i);
const fwdMissing = allReq.filter((r) => !fwd.has(r));
console.log(`requirements R1..R33 present in the forward table: ${33 - fwdMissing.length}/33`);
if (fwdMissing.length) console.log("  MISSING from forward table: " + fwdMissing.join(", "));

const declaredArr = [...declared].sort((a, b) => a - b);
console.log(`steps declared as headings in §1: ${declaredArr.length} -> S${declaredArr[0]}..S${declaredArr[declaredArr.length - 1]}`);
const gaps = [];
for (let i = 1; i <= 36; i++) if (!declared.has(i)) gaps.push("S" + i);
console.log(`  steps S1..S36 with no heading: ${gaps.length ? gaps.join(", ") : "none"}`);

const revMissing = [];
for (let i = 1; i <= 36; i++) if (!rev.has(i)) revMissing.push("S" + i);
console.log(`steps in the reverse trace: ${36 - revMissing.length}/36${revMissing.length ? "  MISSING: " + revMissing.join(", ") : ""}`);

// cross-check: forward says R->S; reverse says S->R. Do they agree?
const disagree = [];
for (const [req, steps] of fwd) {
  for (const s of steps) {
    const back = rev.get(s) ?? [];
    if (!back.includes(req)) disagree.push(`forward ${req} -> S${s}, but reverse S${s} -> [${back.join(",")}] omits ${req}`);
  }
}
for (const [s, reqs] of rev) {
  for (const r of reqs) {
    const fs = fwd.get(r) ?? [];
    if (!fs.includes(s)) disagree.push(`reverse S${s} -> ${r}, but forward ${r} -> [${fs.map((x) => "S" + x).join(",")}] omits S${s}`);
  }
}
console.log(`\n-- both-ways disagreements (${disagree.length}) --`);
for (const d of disagree) console.log("  " + d);

// steps claimed by no requirement at all (true orphans)
const orphans = declaredArr.filter((s) => ![...fwd.values()].some((arr) => arr.includes(s)) && !(rev.get(s) ?? []).length);
console.log(`\n-- steps traced to no requirement either way: ${orphans.length ? orphans.map((s) => "S" + s).join(", ") : "none"}`);

// ---------- (C) banned words ----------
console.log("\n=== (C) banned words in PLAN.md ===");
for (const w of ["improve", "better", "robust", "handle", "appropriate"]) {
  const hits = [];
  for (let i = 0; i < planLines.length; i++) {
    const re = new RegExp(`\\b${w}\\w*\\b`, "i");
    if (re.test(planLines[i])) hits.push(`PLAN:${i + 1}: ${planLines[i].trim().slice(0, 130)}`);
  }
  console.log(`${w}: ${hits.length}`);
  for (const h of hits) console.log("   " + h);
}
