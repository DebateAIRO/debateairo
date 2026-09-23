// ARCH-REV-S03 pass 2 — attack the B2 remedy from the two sides surfaces.mjs cannot see:
//  (1) a file a cluster's COMMAND runs that is in NO cluster's surface -> the cluster can run it but not fix it
//  (2) a step that names a write in PROSE with no Create:/Modify: marker -> invisible to the derivation
//  (3) a marker path that is a citation rather than a write
import { readFileSync } from "node:fs";
const PLAN = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/debate-tiers/slices/S03/PLAN.md";
const src = readFileSync(PLAN, "utf8");
const lines = src.split("\n");

// ---- surfaces, re-derived exactly as surfaces.mjs does (same markers) ----
const CLUSTER_OF = (n) => {
  if (n >= 1 && n <= 13) return "C1";
  if (n === 14 || n === 16 || n === 17) return "C2";
  if (n === 24 || n === 35 || n === 36) return "C4";
  if (n === 15 || (n >= 18 && n <= 23) || (n >= 25 && n <= 34)) return "C3";
  return null;
};
const steps = [];
let cur = null;
for (const line of lines) {
  const m = /^\*\*S(\d+)\. /.exec(line);
  if (m) { cur = { n: Number(m[1]), body: [] }; steps.push(cur); continue; }
  if (/^## /.test(line) && cur) cur = null;
  if (cur) cur.body.push(line);
}
const surface = new Map();            // file -> cluster
for (const step of steps) {
  const cluster = CLUSTER_OF(step.n); if (!cluster) continue;
  const start = step.body.findIndex((l) => /^(Files — |Files—|Files -)/.test(l));
  if (start === -1) continue;
  const para = [];
  for (let i = start; i < step.body.length && step.body[i].trim() !== ""; i += 1) para.push(step.body[i]);
  const text = para.join(" ");
  const markerRe = /(?:Create|Modify):/g; let mk;
  while ((mk = markerRe.exec(text)) !== null) {
    let i = mk.index + mk[0].length;
    for (;;) {
      const tok = /^[\s,;]*`([^`]+)`/.exec(text.slice(i)); if (!tok) break;
      let raw = tok[1].trim();
      if (raw === "none modified by this step") break;
      raw = raw.replace(/(?::[\d\s,-]+)+$/u, "").replace(/[,;\s]+$/u, "");
      if (/[\/.]/.test(raw)) surface.set(raw, cluster);
      i += tok[0].length;
      const cont = /^[\s,;]*(?:and|plus)?[\s,;]*(?=`)/.exec(text.slice(i));
      if (cont) i += cont[0].length; else break;
    }
  }
}

// ---- the four cluster COMMANDS, taken from §2's rows ----
const cmds = new Map();
for (const line of lines) {
  const m = /^\|\s*`(S03-C\d)`\s*\|/.exec(line);
  if (!m) continue;
  const files = [...line.matchAll(/tests\/[A-Za-z0-9_./-]+\.tsx?/g)].map((x) => x[0]);
  const cmdPart = line.split("npx vitest run")[1] ?? "";
  const inCmd = [...cmdPart.matchAll(/tests\/[A-Za-z0-9_./-]+\.tsx?/g)].map((x) => x[0]);
  cmds.set(m[1].replace("S03-", ""), [...new Set(inCmd)]);
}

console.log("=== (1) files a cluster's COMMAND runs but NO cluster's surface owns ===");
let hole1 = 0;
for (const [c, files] of cmds) {
  for (const f of files) {
    if (!surface.has(f)) { console.log(`   ${c} runs ${f}  -> in NO surface (cluster can run it, cannot edit it)`); hole1 += 1; }
    else if (surface.get(f) !== c) console.log(`   note: ${c} runs ${f}, owned by ${surface.get(f)} (legal: a command may run another cluster's file)`);
  }
}
console.log(hole1 === 0 ? "   none" : `   ${hole1} HOLE(S)`);

console.log("\n=== (2) steps whose prose names a write with no Create:/Modify: marker ===");
// heuristic: inside a step body, a sentence with a write verb naming a backticked path
const WRITE = /\b(is added to|gains|adds a case|deletes|is deleted|re-fixtured|rewritten|takes the|moves to|is replaced|becomes)\b/i;
let hole2 = 0;
for (const step of steps) {
  const cluster = CLUSTER_OF(step.n); if (!cluster) continue;
  const body = step.body.join(" ");
  const paths = [...body.matchAll(/`((?:tests|apps|packages|config|docs)\/[A-Za-z0-9_@./*-]+\.[A-Za-z0-9]+)(?::[\d,\s-]+)?`/g)].map((x) => x[1]);
  for (const p of [...new Set(paths)]) {
    if (surface.has(p)) continue;                       // already a declared write somewhere
    // does a write-verb sentence mention it?
    for (const sentence of body.split(/(?<=\.)\s+/)) {
      if (sentence.includes("`" + p) && WRITE.test(sentence)) {
        console.log(`   S${step.n} (${cluster}) -> ${p}`);
        console.log(`      "${sentence.trim().replace(/\s+/g, " ").slice(0, 200)}"`);
        hole2 += 1; break;
      }
    }
  }
}
console.log(hole2 === 0 ? "   none" : `   ${hole2} candidate(s) — each judged by hand below`);

console.log("\n=== (3) the full derived surface, for the record ===");
for (const c of ["C1", "C2", "C3", "C4"]) {
  const fs = [...surface].filter(([, cc]) => cc === c).map(([f]) => f).sort();
  console.log(`${c} (${fs.length}): ${fs.join("  ")}`);
}
