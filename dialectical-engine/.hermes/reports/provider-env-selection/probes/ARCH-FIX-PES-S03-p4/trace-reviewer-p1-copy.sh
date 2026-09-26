#!/bin/zsh
# Corrects the first trace parse, which kept only the line that starts "C1-1 →"
# and therefore dropped the C2 continuation lines. This is the parser of record.
set -u
export PATH="/opt/homebrew/bin:$PATH"
node --input-type=module <<'EOF'
import { readFileSync } from "node:fs";
const MAIN = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/";
const spec = readFileSync(MAIN + "docs/missions/provider-env-selection/slices/S03/SPEC.md", "utf8");
const plan = readFileSync(MAIN + "docs/missions/provider-env-selection/slices/S03/PLAN.md", "utf8");
const reqs = [...spec.matchAll(/^\*\*(R3\.\d+)\*\*/gm)].map((m) => m[1]);
const steps = [...plan.matchAll(/^\*\*(C[12]-\d+) ·/gm)].map((m) => m[1]);
const forward = new Map();
for (const line of plan.split("\n")) {
  const m = line.match(/^\| (R3\.\d+) \|/);
  if (!m) continue;
  forward.set(m[1], [...line.matchAll(/C[12]-\d+/g)].map((x) => x[0]));
}
const start = plan.indexOf("**Reverse trace");
const end = plan.indexOf("### 2b");
const chunk = plan.slice(start, end);
const reverse = new Map();
for (const m of chunk.matchAll(/(C[12]-\d+) → ([^·\n]+)/g)) {
  reverse.set(m[1], [...m[2].matchAll(/R3\.\d+/g)].map((x) => x[0]));
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
EOF
echo "===== wc -l README ====="
wc -l /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03/dialectical-engine/deploy/vps/README.md
