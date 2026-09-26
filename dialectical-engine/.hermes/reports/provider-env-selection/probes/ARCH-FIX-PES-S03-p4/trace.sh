#!/bin/zsh
# ARCH-FIX-PES-S03-p4: the reviewer's parser of record (ARCH-REV-PES-S03-p1/trace.sh), adapted to
# SPEC-v3.md, steps C[123]-n and requirement ids R3.n[b]. SPEC and PLAN overridable by env (mutants).
set -u
export PATH="/opt/homebrew/bin:$PATH"
node --input-type=module <<'EOF'
import { readFileSync } from "node:fs";
const MAIN = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/";
const spec = readFileSync(process.env.SPEC ?? (MAIN + "docs/missions/provider-env-selection/slices/S03/SPEC-v3.md"), "utf8");
const plan = readFileSync(process.env.PLAN ?? (MAIN + "docs/missions/provider-env-selection/slices/S03/PLAN.md"), "utf8");
const reqs = [...spec.matchAll(/^\*\*(R3\.\d+b?)\*\*/gm)].map((m) => m[1]);
const steps = [...plan.matchAll(/^\*\*(C[123]-\d+) ·/gm)].map((m) => m[1]);
const forward = new Map();
for (const line of plan.split("\n")) {
  const m = line.match(/^\| (R3\.\d+b?) \|/);
  if (!m) continue;
  forward.set(m[1], [...line.matchAll(/C[123]-\d+/g)].map((x) => x[0]));
}
const start = plan.indexOf("**Reverse trace");
const end = plan.indexOf("### 2b");
const chunk = plan.slice(start, end);
const reverse = new Map();
for (const m of chunk.matchAll(/(C[123]-\d+) → ([^·\n]+)/g)) {
  reverse.set(m[1], [...m[2].matchAll(/R3\.\d+b?/g)].map((x) => x[0]));
}
const reqNoStep = reqs.filter((r) => !(forward.get(r) || []).length);
const stepNoReq = steps.filter((s) => !(reverse.get(s) || []).length);
const fwdOrphan = [...forward.entries()].flatMap(([r, ids]) => ids.filter((id) => !steps.includes(id)).map((id) => r + "->" + id));
const revOrphan = [...reverse.entries()].flatMap(([s, rs]) => rs.filter((r) => !reqs.includes(r)).map((r) => s + "->" + r));
console.log("reqs", reqs.length, reqs.join(","));
console.log("steps", steps.length, steps.join(","));
console.log("forward rows", forward.size);
console.log("reverse entries", reverse.size, [...reverse.entries()].map(([s, rs]) => s + "→" + rs.join("+")).join(" | "));
console.log("req with no step", reqNoStep.join(",") || "(none)");
console.log("step with no req", stepNoReq.join(",") || "(none)");
console.log("forward unknown step", fwdOrphan.join(",") || "(none)");
console.log("reverse unknown req", revOrphan.join(",") || "(none)");
const gaps = reqNoStep.length + stepNoReq.length + fwdOrphan.length + revOrphan.length;
console.log(gaps === 0 ? "TRACE_OK" : "TRACE_FAIL " + gaps);
process.exitCode = gaps === 0 ? 0 : 1;
EOF
echo "===== wc -l README ====="
wc -l /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03/dialectical-engine/deploy/vps/README.md
