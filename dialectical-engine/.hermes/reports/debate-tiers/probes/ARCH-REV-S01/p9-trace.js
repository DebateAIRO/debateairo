// ARCH-REV-S01 probe 9 — the reviewer's OWN both-ways SPEC<->PLAN trace parser.
// Built from the two files, not from the PLAN's §2 table: the table is what it checks.
const fs = require("node:fs");
const M = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/debate-tiers/slices/S01";
const spec = fs.readFileSync(`${M}/SPEC-v2.md`, "utf8");
const plan = fs.readFileSync(`${M}/PLAN.md`, "utf8");

// --- requirements DECLARED in the SPEC (the "- **Rn.**" bullets of §1)
const declared = [...spec.matchAll(/^- \*\*(R\d+)\.\*\*/gm)].map((m) => m[1]);
console.log(`SPEC declares ${declared.length} requirements: ${declared.join(" ")}`);

// --- steps DECLARED in the PLAN (the "- **S01-n (…)" bullets of §3)
const steps = [...plan.matchAll(/^- \*\*(S01-\d+)\b/gm)].map((m) => m[1]);
console.log(`PLAN declares ${steps.length} steps: ${steps[0]} … ${steps[steps.length - 1]}`);
const stepNums = steps.map((s) => Number(s.split("-")[1]));
const gaps = [];
for (let i = 1; i <= Math.max(...stepNums); i += 1) if (!stepNums.includes(i)) gaps.push(`S01-${i}`);
console.log(`step-number gaps: ${gaps.length === 0 ? "none" : gaps.join(" ")}`);
const dupes = stepNums.filter((n, i) => stepNums.indexOf(n) !== i);
console.log(`duplicate step numbers: ${dupes.length === 0 ? "none" : dupes.join(" ")}`);

// --- the PLAN's §2 forward table: "| Rn … | steps | cluster |"
const forward = new Map();
for (const line of plan.split("\n")) {
  const m = /^\| (R\d+)\b(.*)\| ([^|]*)\| ([^|]*)\|\s*$/.exec(line);
  if (!m) continue;
  const cited = [...m[3].matchAll(/S01-\d+/g)].map((x) => x[0]);
  forward.set(m[1], { steps: cited, cluster: m[4].trim(), raw: m[3].trim() });
}
console.log(`\n§2 forward table rows: ${forward.size}`);

// FORWARD: every declared requirement has a row, and every step it names exists
const noRow = declared.filter((r) => !forward.has(r));
console.log(`FORWARD · requirements with NO §2 row: ${noRow.length === 0 ? "none" : noRow.join(" ")}`);
const rowNoStep = [...forward].filter(([, v]) => v.steps.length === 0).map(([k]) => k);
console.log(`FORWARD · §2 rows citing NO step: ${rowNoStep.length === 0 ? "none" : rowNoStep.join(" ")}`);
const ghost = [];
for (const [r, v] of forward) for (const s of v.steps) if (!steps.includes(s)) ghost.push(`${r}->${s}`);
console.log(`FORWARD · §2 rows citing a step that does not exist: ${ghost.length === 0 ? "none" : ghost.join(" ")}`);
const extraRows = [...forward.keys()].filter((r) => !declared.includes(r));
console.log(`FORWARD · §2 rows for a requirement the SPEC does not declare: ${extraRows.length === 0 ? "none" : extraRows.join(" ")}`);

// REVERSE: every step is cited by at least one §2 row, or by the §2 reverse-trace prose
const cited = new Set([...forward.values()].flatMap((v) => v.steps));
const uncited = steps.filter((s) => !cited.has(s));
console.log(`\nREVERSE · steps NOT cited by any §2 forward row: ${uncited.length === 0 ? "none" : uncited.join(" ")}`);

// each uncited step: does the PLAN's own reverse prose (ranges like "S01-1…S01-11 -> R11") cover it?
const ranges = [...plan.matchAll(/S01-(\d+)…S01-(\d+)\s*→\s*([^.]*)\./g)]
  .map((m) => ({ from: Number(m[1]), to: Number(m[2]), serves: m[3].trim() }));
console.log(`§2 reverse-trace ranges found: ${ranges.length}`);
for (const s of uncited) {
  const n = Number(s.split("-")[1]);
  const hit = ranges.find((r) => n >= r.from && n <= r.to);
  console.log(`   ${s}: ${hit ? `covered by the range S01-${hit.from}…S01-${hit.to} → ${hit.serves}` : "*** COVERED BY NOTHING"}`);
}

// --- which cluster does each step actually live in, per §3's headings?
const clusterOf = {};
let current = null;
for (const line of plan.split("\n")) {
  const h = /^### Cluster (S01-C\d)/.exec(line);
  if (h) { current = h[1]; continue; }
  const s = /^- \*\*(S01-\d+)\b/.exec(line);
  if (s && current) clusterOf[s[1]] = current;
}
const mismatch = [];
for (const [r, v] of forward) {
  for (const s of v.steps) {
    const real = clusterOf[s];
    if (real && !v.cluster.replace(/S01-/g, "").includes(real.replace("S01-", ""))) {
      mismatch.push(`${r}: cites ${s} (actually in ${real}) but the row's cluster column says "${v.cluster}"`);
    }
  }
}
console.log(`\n§2 rows whose CLUSTER column disagrees with §3's heading for a step it cites:`);
console.log(mismatch.length === 0 ? "   none" : mismatch.map((x) => `   ${x}`).join("\n"));

// --- every step must carry a "Done when" or be an explicit assertion row
const bodies = plan.split(/^- \*\*(S01-\d+)/m);
const noDone = [];
for (let i = 1; i < bodies.length; i += 2) {
  const id = bodies[i], body = bodies[i + 1] || "";
  if (!/\*\*Done when:\*\*/.test(body)) noDone.push(id);
}
console.log(`\nsteps with NO "**Done when:**" clause: ${noDone.length === 0 ? "none" : noDone.join(" ")}`);
