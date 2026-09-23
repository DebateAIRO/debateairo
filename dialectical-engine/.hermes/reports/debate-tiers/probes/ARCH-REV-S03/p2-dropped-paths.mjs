// ARCH-REV-S03 p2 — the CLASS behind the C1 discrepancy: paths that appear in a step's
// Files paragraph but that surfaces.mjs's marker-walk never captures (it stops at the first
// token after a marker that is not a backticked path — a parenthetical ends the walk).
import { readFileSync } from "node:fs";
const src = readFileSync("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/debate-tiers/slices/S03/PLAN.md", "utf8");
const lines = src.split("\n");
const steps = []; let cur = null;
for (const line of lines) {
  const m = /^\*\*S(\d+)\. /.exec(line);
  if (m) { cur = { n: +m[1], body: [] }; steps.push(cur); continue; }
  if (/^## /.test(line) && cur) cur = null;
  if (cur) cur.body.push(line);
}
const PATHY = /^[A-Za-z0-9_@./*{}-]+\/[A-Za-z0-9_@./*{},-]+/;
let total = 0;
for (const step of steps) {
  const start = step.body.findIndex((l) => /^(Files — |Files—|Files -)/.test(l));
  if (start === -1) continue;
  const para = [];
  for (let i = start; i < step.body.length && step.body[i].trim() !== ""; i += 1) para.push(step.body[i]);
  const text = para.join(" ");
  // (a) every backticked token in the paragraph that looks like a path
  const all = new Set();
  for (const m of text.matchAll(/`([^`]+)`/g)) {
    let raw = m[1].trim().replace(/(?::[\d\s,-]+)+$/u, "").replace(/[,;\s]+$/u, "");
    if (PATHY.test(raw)) all.add(raw);
  }
  // (b) exactly what surfaces.mjs captures
  const got = new Set();
  const markerRe = /(?:Create|Modify):/g; let mk;
  while ((mk = markerRe.exec(text)) !== null) {
    let i = mk.index + mk[0].length;
    for (;;) {
      const tok = /^[\s,;]*`([^`]+)`/.exec(text.slice(i)); if (!tok) break;
      let raw = tok[1].trim();
      if (raw === "none modified by this step") break;
      raw = raw.replace(/(?::[\d\s,-]+)+$/u, "").replace(/[,;\s]+$/u, "");
      if (/[\/.]/.test(raw)) got.add(raw);
      i += tok[0].length;
      const cont = /^[\s,;]*(?:and|plus)?[\s,;]*(?=`)/.exec(text.slice(i));
      if (cont) i += cont[0].length; else break;
    }
  }
  const dropped = [...all].filter((p) => !got.has(p));
  if (dropped.length) {
    total += dropped.length;
    console.log(`S${step.n}: DROPPED ${dropped.join("  ")}`);
    console.log(`    Files line: ${text.replace(/\s+/g, " ").slice(0, 240)}`);
  }
}
console.log(`\ntotal paths present in a Files paragraph but NOT in the derived surface: ${total}`);
