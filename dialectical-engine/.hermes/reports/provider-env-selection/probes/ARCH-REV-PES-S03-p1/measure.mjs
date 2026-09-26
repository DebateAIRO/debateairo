// ARCH-REV-PES-S03-p1 · independent measurements. Does not import the ARCH seat's enumeration.mjs.
import { readFileSync } from "node:fs";

const LANE = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03/dialectical-engine/";
const MAIN = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/";
const CODE = /[`"]([A-Z][A-Z0-9_]{4,})(?=[:`"])/gu;

function read(rel) {
  return readFileSync(LANE + rel, "utf8");
}

function span(source, from, until) {
  const a = source.indexOf(from);
  if (a < 0) throw new Error("ANCHOR NOT FOUND: " + from);
  const b = source.indexOf(until, a + from.length);
  if (b < 0) throw new Error("TERMINATOR NOT FOUND after " + from + ": " + JSON.stringify(until));
  return source.slice(a, b + until.length);
}

function lineNo(source, idx) {
  return source.slice(0, idx).split("\n").length;
}

console.log("===== 1. pipe-space counts (the plan's done-when patterns) =====");
const readme = read("deploy/vps/README.md");
const lines = readme.split("\n");
console.log("README lines", lines.length);

const hRef = readme.indexOf("### What the hosted mode refuses, in code");
const hCred = readme.indexOf("### The credential-file contract");
const refusal = readme.slice(hRef, hCred).split("\n");
const pipeSpace = (arr) => arr.filter((l) => /^\| /.test(l));
const pipeAny = (arr) => arr.filter((l) => /^\|/.test(l));
const refusalStart = lineNo(readme, hRef);
console.log("refusal span lines", refusal.length, "start", refusalStart, "end-exclusive", lineNo(readme, hCred));
console.log("refusal ^|  (pipe then space)", pipeSpace(refusal).length);
console.log("refusal ^|   (pipe, any second char)", pipeAny(refusal).length);
refusal.forEach((l, i) => {
  if (!/^\|/.test(l)) return;
  console.log(`  L${refusalStart + i} space=${/^\| /.test(l)} repr0-8=${JSON.stringify(l.slice(0, 8))}`);
});

const memStart = readme.indexOf("| Member | Value |");
const afterMem = readme.slice(memStart);
const blankAt = afterMem.indexOf("\n\n");
const member = afterMem.slice(0, blankAt < 0 ? afterMem.length : blankAt).split("\n");
console.log("member span lines", member.length, "start", lineNo(readme, memStart));
console.log("member ^|  (pipe then space)", pipeSpace(member).length);
console.log("member ^|   (pipe, any second char)", pipeAny(member).length);
for (const l of member.filter((l) => /^\|/.test(l))) {
  console.log(`  space=${/^\| /.test(l)} repr0-12=${JSON.stringify(l.slice(0, 12))}`);
}

console.log("\n===== 2. input_price hits (whole file) =====");
lines.forEach((l, i) => {
  if (l.includes("input_price_micros_per_million")) console.log(`${i + 1}: ${l.slice(0, 160)}`);
});

console.log("\n===== 3. anchor extraction (own implementation of PLAN §1b) =====");
const providers = read("packages/providers/src/index.ts");
const support = read("apps/api/src/support/model.ts");
const envelope = read("packages/register/src/cost-envelope-policy.ts");
const runtime = read("packages/register/src/runtime-environment.ts");
const anchors = [
  ["E1", providers, "const PROVIDER_CREDENTIAL_REFUSAL_CODES", "] as const);"],
  ["E2", providers, "const PROVIDER_CREDENTIAL_ABSENT_CODE = ", ";"],
  ["E3", support, "export const SUPPORT_MODEL_STARTUP_REFUSAL_CODES", "] as const);"],
  ["E4", providers, "export function assertPricedProviderTargets", "\n}"],
  ["E5", providers, "function providerTargetPriceAmount", "\n}"],
  ["E6a", envelope, "export function costEnvelopePolicyFromValue", "\n}"],
  ["E6b", envelope, "export async function readCostEnvelopePolicy", "\n}"],
  ["E7", runtime, "export class SupportAdmissionScopesNotSealedError", "\n}"]
];
const union = new Set();
for (const [id, source, from, until] of anchors) {
  const body = span(source, from, until);
  const codes = [...new Set([...body.matchAll(CODE)].map((m) => m[1]))].sort();
  const start = lineNo(source, source.indexOf(from));
  const end = start + body.split("\n").length - 1;
  // first column-0 close vs first any close, so a wrong terminator is visible
  const rel = source.slice(source.indexOf(from));
  const col0 = rel.indexOf("\n}");
  const anyClose = rel.search(/\n\s*\}/);
  codes.forEach((c) => union.add(c));
  console.log(`${id} ${start}-${end} col0CloseDelta=${col0} anyCloseDelta=${anyClose} -> ${codes.join(", ") || "(NONE)"}`);
}
const section = readme.slice(readme.indexOf("## 11. Providers and vendors"));
const absent = [...union].filter((c) => !section.includes(c)).sort();
const present = [...union].filter((c) => section.includes(c)).sort();
const six = [
  "PROVIDER_TARGET_PRICE_REQUIRED", "PROVIDER_TARGET_PRICE_ZERO",
  "PROVIDER_DISCOVERY_TARGET_PRICE_INVALID", "COST_ENVELOPE_POLICY_UNRESOLVED",
  "COST_ENVELOPE_POLICY_INVALID", "SUPPORT_ADMISSION_SCOPES_NOT_SEALED"
].sort();
console.log("UNION", union.size);
console.log("IN §11", present.join(", "));
console.log("ABSENT", absent.join(", "));
console.log("ABSENT === R3.3 SIX", JSON.stringify(absent) === JSON.stringify(six));

console.log("\n===== 4. seed token at dev-deployment-register.ts:344 and probe max_tokens =====");
const seed = read("apps/runner/src/dev-deployment-register.ts").split("\n");
console.log("344:", seed[343]);
console.log("344 contains 600000", seed[343].includes("600000"), "contains 600_000", seed[343].includes("600_000"));
const probe = read("packages/providers/src/provider-probe.ts").split("\n");
console.log("82:", probe[81].trim());

console.log("\n===== 5. throw-site codes vs refusal-table span vs §11 vs the 12 =====");
const files = [
  "packages/providers/src/index.ts",
  "packages/providers/src/provider-probe.ts",
  "packages/register/src/cost-envelope-policy.ts",
  "packages/register/src/runtime-environment.ts",
  "packages/register/src/index.ts",
  "apps/api/src/support/model.ts",
  "apps/api/src/main.ts",
  "apps/runner/src/main.ts",
  "apps/runner/src/index.ts",
  "packages/kernel/src/index.ts"
];
const throwRe = /throw new (?:TypeError|TypedDomainError|CostEnvelopesNotSealedError|SupportAdmissionScopesNotSealedError)\(\s*[`"]([A-Z][A-Z0-9_]{4,})/g;
const superRe = /super\(\s*"([A-Z][A-Z0-9_]{4,})"/g;
const codeFieldRe = /readonly code = "([A-Z][A-Z0-9_]{4,})"/g;
const tableSpan = readme.slice(hRef, hCred);
const found = new Map();
for (const f of files) {
  let src;
  try { src = read(f); } catch { console.log("MISSING", f); continue; }
  for (const re of [throwRe, superRe, codeFieldRe]) {
    re.lastIndex = 0;
    for (const m of src.matchAll(re)) {
      if (!found.has(m[1])) found.set(m[1], new Set());
      found.get(m[1]).add(f);
    }
  }
}
const rows = [...found.keys()].sort();
let absentTable = 0;
for (const code of rows) {
  const inTable = tableSpan.includes(code);
  const in11 = section.includes(code);
  const in12 = union.has(code);
  if (!inTable) absentTable += 1;
  console.log(`${inTable ? "TABLE" : "notab"} ${in11 ? "S11" : "no11"} ${in12 ? "IN12" : "no12"} ${code}  [${[...found.get(code)].join(", ")}]`);
}
console.log("throw-site codes", rows.length, "absent from refusal-table span", absentTable);

console.log("\n===== 6. index.ts throw-new-TypeError idiom scan (DECISIONS claim: 15 codes, 8 absent) =====");
const idiom = /throw new TypeError\(\s*[`"]([A-Z][A-Z0-9_]{4,})/g;
const idiomCodes = [...new Set([...providers.matchAll(idiom)].map((m) => m[1]))].sort();
const idiomAbsent = idiomCodes.filter((c) => !section.includes(c));
console.log("distinct", idiomCodes.length);
console.log(idiomCodes.join(", "));
console.log("absent from §11", idiomAbsent.length, idiomAbsent.join(", "));

console.log("\n===== 7. SPEC↔PLAN trace (own parser) =====");
const spec = readFileSync(MAIN + "docs/missions/provider-env-selection/slices/S03/SPEC.md", "utf8");
const plan = readFileSync(MAIN + "docs/missions/provider-env-selection/slices/S03/PLAN.md", "utf8");
const reqs = [...spec.matchAll(/^\*\*(R3\.\d+)\*\*/gm)].map((m) => m[1]);
const steps = [...plan.matchAll(/^\*\*(C[12]-\d+) ·/gm)].map((m) => m[1]);
const forward = new Map();
for (const line of plan.split("\n")) {
  const m = line.match(/^\| (R3\.\d+) \|/);
  if (!m) continue;
  const ids = [...line.matchAll(/C[12]-\d+/g)].map((x) => x[0]);
  forward.set(m[1], ids);
}
const reverseLine = plan.split("\n").find((l) => l.startsWith("C1-1 →"));
const reverse = new Map();
if (reverseLine) {
  for (const part of reverseLine.split("·")) {
    const mm = part.match(/(C[12]-\d+) → (.+)/);
    if (!mm) continue;
    reverse.set(mm[1], [...mm[2].matchAll(/R3\.\d+/g)].map((x) => x[0]));
  }
}
const reqNoStep = reqs.filter((r) => !(forward.get(r) || []).length);
const stepNoReq = steps.filter((s) => !(reverse.get(s) || []).length);
const forwardUnknown = [];
for (const [r, ids] of forward) for (const id of ids) if (!steps.includes(id)) forwardUnknown.push(r + "→" + id);
const reverseUnknown = [];
for (const [s, rs] of reverse) for (const r of rs) if (!reqs.includes(r)) reverseUnknown.push(s + "→" + r);
console.log("reqs", reqs.join(","));
console.log("steps", steps.join(","));
console.log("req with no forward step", reqNoStep.join(",") || "(none)");
console.log("step with no reverse req", stepNoReq.join(",") || "(none)");
console.log("forward cites unknown step", forwardUnknown.join(",") || "(none)");
console.log("reverse cites unknown req", reverseUnknown.join(",") || "(none)");
const noDone = [];
const blocks = plan.split(/\n(?=\*\*C[12]-\d+ ·)/);
for (const b of blocks) {
  const id = b.match(/^\*\*(C[12]-\d+)/);
  if (!id) continue;
  if (!b.includes("**Done when:**")) noDone.push(id[1]);
}
console.log("steps missing Done when", noDone.join(",") || "(none)");
console.log("reverse line found", Boolean(reverseLine));
