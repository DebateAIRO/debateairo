// ARCH-REV-PES-S03-p3 — own checks of Revision 3. Reads lane + main-tree plan. Writes nothing.
import { readFileSync } from "node:fs";

const LANE = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03/dialectical-engine";
const MAIN = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const plan = readFileSync(`${MAIN}/docs/missions/provider-env-selection/slices/S03/PLAN.md`, "utf8");
const spec = readFileSync(`${MAIN}/docs/missions/provider-env-selection/slices/S03/SPEC.md`, "utf8");
const readme0 = readFileSync(`${LANE}/deploy/vps/README.md`, "utf8");

const problems = [];
function note(msg) {
  problems.push(msg);
  console.log("PROBLEM", msg);
}

function lineAt(rel, n) {
  const lines = readFileSync(`${LANE}/${rel}`, "utf8").split("\n");
  return lines[n - 1] ?? "";
}
function calls(rel, needle) {
  return readFileSync(`${LANE}/${rel}`, "utf8")
    .split("\n")
    .map((l, i) => ({ n: i + 1, l }))
    .filter((x) => x.l.includes(needle))
    .map((x) => x.n);
}

console.log("===== 1. sentence the step writes vs the sentence assertion (3) pins =====");
const fence = plan.split("```text\n")[1]?.split("\n```")[0]?.trimEnd() ?? "";
const pinMatch = plan.match(/\.toContain\(\n\s*"([\s\S]*?)"\n\s*\)/);
const pinned = pinMatch ? pinMatch[1] : "";
console.log("fence bytes", fence.length, "pinned bytes", pinned.length, "equal", fence === pinned);
if (fence !== pinned) note("C1-3 fence text !== C1-1 toContain string");
console.log("FENCE", JSON.stringify(fence));

const reLine = plan.split("\n").find((l) => l.includes("hosted rules?"));
const reSrc = reLine ? reLine.match(/(\/.*\/iu)/) : null;
const orderRe = reSrc ? new RegExp(reSrc[1].slice(1, reSrc[1].lastIndexOf("/")), reSrc[1].slice(reSrc[1].lastIndexOf("/") + 1)) : null;
console.log("order regex", reSrc ? reSrc[1] : "MISSING");
if (!orderRe) note("could not extract assertion (1b) regex");
console.log("(1b) matches the EXACT sentence", orderRe.test(fence));
if (orderRe.test(fence)) note("(1b) rejects the sentence C1-3 tells the seat to write");

console.log("\n===== 2. plan lines that still say 'before any hosted rule' =====");
plan.split("\n").forEach((l, i) => {
  if (l.includes("before any hosted rule")) console.log(String(i + 1).padStart(4), l.slice(0, 180));
});

console.log("\n===== 3. anchor union and C1-1 gate on simulated READMEs =====");
function body(source, from, until) {
  const start = source.indexOf(from);
  if (start < 0) throw new Error("anchor missing " + from);
  return source.slice(start, source.indexOf(until, start + from.length) + until.length);
}
const providers = readFileSync(`${LANE}/packages/providers/src/index.ts`, "utf8");
const support = readFileSync(`${LANE}/apps/api/src/support/model.ts`, "utf8");
const envelope = readFileSync(`${LANE}/packages/register/src/cost-envelope-policy.ts`, "utf8");
const runtime = readFileSync(`${LANE}/packages/register/src/runtime-environment.ts`, "utf8");
const anchors = [
  [providers, "const PROVIDER_CREDENTIAL_REFUSAL_CODES", "] as const);"],
  [providers, "const PROVIDER_CREDENTIAL_ABSENT_CODE = ", ";"],
  [support, "export const SUPPORT_MODEL_STARTUP_REFUSAL_CODES", "] as const);"],
  [providers, "export function assertPricedProviderTargets", "\n}"],
  [providers, "function providerTargetPriceAmount", "\n}"],
  [envelope, "export function costEnvelopePolicyFromValue", "\n}"],
  [envelope, "export async function readCostEnvelopePolicy", "\n}"],
  [runtime, "export class SupportAdmissionScopesNotSealedError", "\n}"]
];
const union = [];
for (const [source, from, until] of anchors) {
  const codes = [...body(source, from, until).matchAll(/[`"]([A-Z][A-Z0-9_]{4,})(?=[:`"])/gu)].map((m) => m[1]);
  console.log("anchor", JSON.stringify(from), "n", codes.length, codes.join(","));
  for (const c of codes) if (!union.includes(c)) union.push(c);
}
console.log("UNION", union.length, union.join(","));
if (union.length !== 12) note("union.size is " + union.length + " not 12");

const NEW_ROWS = [
  "| `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` | one of the two price members is declared without the other, or a declared amount is not an integer in [0, Number.MAX_SAFE_INTEGER] |",
  "| `PROVIDER_TARGET_PRICE_REQUIRED:` and the provider ref | hosted mode, and a debate target declares no price pair at all |",
  "| `PROVIDER_TARGET_PRICE_ZERO:` and the provider ref | hosted mode, and a declared input or output amount is below 1 micro-unit per million tokens |",
  "| `COST_ENVELOPE_POLICY_UNRESOLVED` | no costEnvelopePolicy row exists at the resolved REGISTER_VERSION |",
  "| `COST_ENVELOPE_POLICY_INVALID` | the row exists but does not parse, or its source_ref is blank |",
  "| `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` | hosted mode, and the admissionPolicy row in force lacks at least one of support_reads, support_sessions, support_model_calls |"
];
const OLD_CELL = "| `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` | one member without the other. Raised while the targets are PARSED, before any hosted rule runs |";
const OLD_SENTENCE = "`PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` is raised while the targets are parsed, before any hosted rule runs and before `PROVIDER_TARGET_PRICE_REQUIRED` or `PROVIDER_TARGET_PRICE_ZERO` can be: a target whose price is malformed refuses with the first code and never reaches the other two.";
const TRUE_OTHER = "`PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` is raised while the targets are parsed, before `assertDeploymentProviderTargets` and before `PROVIDER_TARGET_PRICE_REQUIRED` or `PROVIDER_TARGET_PRICE_ZERO`: a malformed price refuses with the first code and never reaches the other two.";
const FIRST_CODE = fence.replace(
  "never reaches the other two.",
  "refuses with the first code and never reaches the other two."
);

function insertRows(text, rows) {
  const marker = "| `SUPPORT_MODEL_PATH_NOT_RATIFIED` |";
  const i = text.indexOf(marker);
  const nl = text.indexOf("\n", i);
  return text.slice(0, nl + 1) + rows.join("\n") + "\n" + text.slice(nl + 1);
}
function insertBeforeContract(text, block) {
  const at = text.indexOf("### The credential-file contract");
  return text.slice(0, at) + block + "\n\n" + text.slice(at);
}
function gate(text) {
  const refusal = text.slice(
    text.indexOf("### What the hosted mode refuses, in code"),
    text.indexOf("### The credential-file contract")
  );
  const section = text.slice(text.indexOf("## 11. Providers and vendors"));
  if (/<[a-z-]+>/u.test(refusal)) return "FAIL no angle-bracket placeholder in §11's refusal table";
  if (orderRe.test(refusal)) return "FAIL no 'before any hosted rule' order claim in §11's refusal span";
  for (const code of union) if (!section.includes(code)) return "FAIL " + code;
  const lines = refusal.split("\n");
  const below = lines
    .slice(lines.map((line) => line.startsWith("|")).lastIndexOf(true) + 1)
    .join(" ")
    .replace(/\s+/gu, " ");
  if (!below.includes(fence)) return "FAIL guard-order sentence below the table, EXACT (C1-3)";
  return "PASS";
}
function show(label, text) {
  const got = gate(text);
  console.log(label, "got=" + got);
  return got;
}

const baseGot = show("S0 base", readme0);
if (baseGot !== "FAIL PROVIDER_TARGET_PRICE_REQUIRED") note("base message is " + baseGot);

const six = insertRows(readme0, NEW_ROWS);
show("S1 six new rows, no sentence", six);
const s2 = show("S2 six new rows + EXACT sentence", insertBeforeContract(six, fence));
if (s2 !== "PASS") note("correct state did not pass");
const wrapped = fence.replace("parsed, before", "parsed,\nbefore");
show("S2w EXACT sentence hard-wrapped", insertBeforeContract(six, wrapped));
show("S2_rev2 old rows + old sentence", insertBeforeContract(insertRows(readme0, [OLD_CELL, ...NEW_ROWS.slice(1)]), OLD_SENTENCE));
show("M_r2cell old cell + new sentence", insertBeforeContract(insertRows(readme0, [OLD_CELL, ...NEW_ROWS.slice(1)]), fence));
show("M_trueother different wording", insertBeforeContract(six, TRUE_OTHER));
show("M_firstcode first-code clause put back", insertBeforeContract(six, FIRST_CODE));
show("M_intable sentence only in row 1", insertRows(readme0, [
  "| `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` | " + fence + " |",
  ...NEW_ROWS.slice(1)
]));
const mutantLine = "| `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` | mutant — raised while the targets are parsed, before any hosted rule runs |";
const b1b = show("M_b1b (1b) mutant at C1-1 boundary, no six rows", insertRows(readme0, [mutantLine]));
if (!b1b.includes("before any hosted rule")) note("(1b) mutant did not fail on (1b): " + b1b);
show("M_angle at C1-1 boundary", insertRows(readme0, ["| `PROVIDER_TARGET_PRICE_REQUIRED:<ref>` | mutant |"]));
show("M_outside_pattern 'before a hosted rule' + EXACT below", insertBeforeContract(
  insertRows(readme0, [
    "| `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` | raised before a hosted rule runs |",
    ...NEW_ROWS.slice(1)
  ]),
  fence
));

console.log("\n===== 4. SELFTEST — old sentence must not pass the revised gate =====");
const oldGot = gate(insertBeforeContract(insertRows(readme0, [OLD_CELL, ...NEW_ROWS.slice(1)]), OLD_SENTENCE));
if (oldGot === "PASS") note("SELFTEST_BROKEN old sentence passed");
else console.log("SELFTEST_OK old sentence", oldGot);
if (gate(readme0) === "PASS") note("SELFTEST_BROKEN base passed");
else console.log("SELFTEST_OK base fails");

console.log("\n===== 5. call order (lines containing the call paren, not the import) =====");
function callLines(rel, name) {
  return calls(rel, name + "(");
}
const apiSeal = callLines("apps/api/src/main.ts", "assertHostedCostEnvelopesSealed");
const apiSupport = callLines("apps/api/src/main.ts", "assertHostedSupportAdmissionSealed");
const apiPolicy = callLines("apps/api/src/main.ts", "readCostEnvelopePolicy");
const apiParse = callLines("apps/api/src/main.ts", "parseProviderDiscoveryTargets");
const apiPriced = callLines("apps/api/src/main.ts", "assertPricedProviderTargets");
const runSeal = callLines("apps/runner/src/main.ts", "assertHostedCostEnvelopesSealed");
const runParse = callLines("apps/runner/src/main.ts", "parseProviderDiscoveryTargets");
const runPriced = callLines("apps/runner/src/main.ts", "assertPricedProviderTargets");
const runPolicy = callLines("apps/runner/src/main.ts", "readCostEnvelopePolicy");
console.log("api seal", apiSeal, "support", apiSupport, "policy", apiPolicy, "parse", apiParse, "priced", apiPriced);
console.log("runner seal", runSeal, "parse", runParse, "priced", runPriced, "policy", runPolicy);
function before(a, b, label) {
  if (!(a.length && b.length && a[0] < b[0])) note(label + " not before (" + a + " vs " + b + ")");
  else console.log("OK", label, a[0], "<", b[0]);
}
before(apiSeal, apiSupport, "api seal < support");
before(apiSupport, apiPolicy, "api support < policy");
before(apiPolicy, apiParse, "api policy < parse");
before(apiParse, apiPriced, "api parse < priced");
before(runSeal, runParse, "runner seal < parse");
before(runParse, runPriced, "runner parse < priced");
before(runPriced, runPolicy, "runner priced < policy read");

console.log("parse throws INVALID at", calls("packages/providers/src/index.ts", "PROVIDER_DISCOVERY_TARGET_PRICE_INVALID"));
console.log(":283", lineAt("packages/providers/src/index.ts", 283).trim());
console.log(":285", lineAt("packages/providers/src/index.ts", 285).trim());
console.log(":277-278", lineAt("packages/providers/src/index.ts", 277).trim(), "|", lineAt("packages/providers/src/index.ts", 278).trim());

console.log("\n===== 6. citations the revision names =====");
const cites = [
  ["packages/providers/src/index.ts", 195, "PROVIDER_DISCOVERY_TARGET_PRICE_INVALID"],
  ["packages/providers/src/index.ts", 193, "Number.isInteger"],
  ["packages/providers/src/index.ts", 194, "MAX_SAFE_INTEGER"],
  ["packages/providers/src/index.ts", 278, "PROVIDER_DISCOVERY_TARGET_PRICE_INVALID"],
  ["packages/providers/src/index.ts", 255, "CONFIGURED_PROVIDER_DUPLICATE"],
  ["packages/providers/src/index.ts", 683, "hosted"],
  ["packages/providers/src/index.ts", 687, "PROVIDER_TARGET_PRICE_REQUIRED"],
  ["packages/providers/src/index.ts", 700, "PROVIDER_TARGET_PRICE_ZERO"],
  ["packages/register/src/configured-provider-set.ts", 64, "assertConfiguredProviderSetShape"],
  ["packages/register/src/configured-provider-set.ts", 82, "CONFIGURED_PROVIDER_SET_INVALID"],
  ["packages/register/src/configured-provider-set.ts", 159, "assertConfiguredProviderSetShape"],
  ["packages/register/src/configured-provider-set.ts", 177, "buildConfiguredProviderSetDeploymentRow"],
  ["packages/register/src/configured-provider-set.ts", 184, "assertConfiguredProviderSetShape"],
  ["packages/register/src/register-publication.ts", 557, "assertHostedConfiguredProviderSetVetted"],
  ["packages/register/src/runtime-environment.ts", 112, "unreachable"],
  ["packages/register/src/runtime-environment.ts", 157, "hosted"],
  ["packages/register/src/runtime-environment.ts", 158, "CostEnvelopesNotSealedError"],
  ["packages/register/src/runtime-environment.ts", 199, "hosted"],
  ["packages/register/src/runtime-environment.ts", 200, "supportReads"],
  ["packages/register/src/runtime-environment.ts", 202, "SupportAdmissionScopesNotSealedError"],
  ["packages/register/src/session-policy.ts", 134, "support_reads"],
  ["packages/register/src/session-policy.ts", 135, "support_sessions"],
  ["packages/register/src/session-policy.ts", 136, "support_model_calls"],
  ["packages/register/src/cost-envelope-policy.ts", 133, "COST_ENVELOPE_POLICY_INVALID"],
  ["packages/register/src/cost-envelope-policy.ts", 165, "COST_ENVELOPE_POLICY_UNRESOLVED"],
  ["apps/api/src/main.ts", 97, "assertHostedCostEnvelopesSealed("],
  ["apps/api/src/main.ts", 230, "assertHostedSupportAdmissionSealed("],
  ["apps/api/src/main.ts", 242, "readCostEnvelopePolicy("],
  ["apps/api/src/main.ts", 300, "parseProviderDiscoveryTargets("],
  ["apps/api/src/main.ts", 312, "assertPricedProviderTargets("],
  ["apps/runner/src/main.ts", 38, "assertHostedCostEnvelopesSealed("],
  ["apps/runner/src/main.ts", 74, "parseProviderDiscoveryTargets("],
  ["apps/runner/src/main.ts", 87, "assertPricedProviderTargets("],
  ["apps/runner/src/main.ts", 111, "readCostEnvelopePolicy("],
  ["apps/runner/src/main.ts", 117, "PROVIDER_TARGET_PRICE_REQUIRED"]
];
for (const [file, n, token] of cites) {
  const text = lineAt(file, n);
  const ok = text.includes(token);
  console.log(ok ? "OK" : "MISS", file + ":" + n, JSON.stringify(text.trim().slice(0, 160)));
  if (!ok) note("citation miss " + file + ":" + n + " missing " + token);
}

console.log("\n===== 7. own SPEC↔step trace =====");
const reqs = [...spec.matchAll(/^\*\*(R3\.\d+)\*\*/gm)].map((m) => m[1]);
const steps = [...plan.matchAll(/^\*\*(C[12]-\d+) ·/gm)].map((m) => m[1]);
const forward = new Map();
for (const line of plan.split("\n")) {
  const m = line.match(/^\| (R3\.\d+) \|/);
  if (!m) continue;
  forward.set(m[1], [...line.matchAll(/C[12]-\d+/g)].map((x) => x[0]));
}
const reverseLine = plan.split("\n").find((l) => l.startsWith("C1-1 →"));
const reverse = new Map();
for (const part of (reverseLine ?? "").split("·")) {
  const mm = part.match(/(C[12]-\d+) → (.+)/);
  if (!mm) continue;
  reverse.set(mm[1], [...mm[2].matchAll(/R3\.\d+/g)].map((x) => x[0]));
}
console.log("reqs", reqs.join(","));
console.log("steps", steps.join(","));
console.log("reverse line found", Boolean(reverseLine));
const reqNoStep = reqs.filter((r) => !(forward.get(r) || []).length);
const stepNoReq = steps.filter((s) => !(reverse.get(s) || []).length);
const forwardOrphans = [...forward.keys()].filter((r) => !reqs.includes(r));
const reverseOrphans = [...reverse.keys()].filter((s) => !steps.includes(s));
console.log("req with no step", reqNoStep.join(",") || "(none)");
console.log("step with no req", stepNoReq.join(",") || "(none)");
console.log("forward id not in SPEC", forwardOrphans.join(",") || "(none)");
console.log("reverse id not a step heading", reverseOrphans.join(",") || "(none)");
let recip = 0;
for (const [r, ids] of forward) {
  for (const id of ids) {
    if (!(reverse.get(id) || []).includes(r)) {
      recip++;
      console.log("forward not reciprocated", r, id);
    }
  }
}
for (const [s, rs] of reverse) {
  for (const r of rs) {
    if (!(forward.get(r) || []).includes(s)) {
      recip++;
      console.log("reverse not reciprocated", s, r);
    }
  }
}
console.log("reciprocity breaks", recip);
if (reqNoStep.length || stepNoReq.length || forwardOrphans.length || reverseOrphans.length || recip) {
  note("trace gap");
}

console.log("\n===== 8. count oracle on the new six rows =====");
function pipeCount(text) {
  const span = text.slice(
    text.indexOf("### What the hosted mode refuses, in code"),
    text.indexOf("### The credential-file contract")
  );
  return span.split("\n").filter((l) => l.startsWith("|")).length;
}
console.log("base pipes", pipeCount(readme0));
console.log("six new rows", pipeCount(six));
console.log("six + sentence", pipeCount(insertBeforeContract(six, fence)));
console.log("six + wrapped sentence", pipeCount(insertBeforeContract(six, wrapped)));
console.log("five rows", pipeCount(insertRows(readme0, NEW_ROWS.slice(0, 5))));

console.log("\n===== 9. four RED-at-base files vs README / v9 =====");
for (const f of [
  "tests/integration/dev-api-environment.test.ts",
  "tests/integration/dev-api-process.test.ts",
  "tests/integration/dev-provider-panel.test.ts",
  "tests/integration/t16-algorithm-register.test.ts"
]) {
  const t = readFileSync(`${LANE}/${f}`, "utf8");
  console.log(f, "README", t.includes("README"), "v9-provider-credential-files", t.includes("v9-provider-credential-files"), "deploy/vps", t.includes("deploy/vps"));
}

console.log("\n===== 10. keys, listeners, banned words in the plan =====");
console.log("sk- hits", (plan.match(/sk-[A-Za-z0-9]/g) || []).length);
console.log("listen( hits", (plan.match(/listen\(/g) || []).length);
for (const w of ["improve", "better", "robust", "appropriate"]) {
  const n = plan.split("\n").filter((l) => new RegExp("\\b" + w + "\\b", "i").test(l)).length;
  console.log("banned", w, n);
}
const handleLines = plan.split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => /\bhandle\b/i.test(l));
console.log("handle lines", handleLines.length);
for (const [n, l] of handleLines) console.log(n, l.slice(0, 160));

console.log("\n===== 11. C2-7 paraphrase vs the V-ROW =====");
const c27 = plan.split("**C2-7")[1]?.split("**C2-8")[0] ?? "";
console.log("says 'at run time'", c27.includes("at run time"));
console.log("names COST_ENVELOPE_POLICY_UNRESOLVED", c27.includes("COST_ENVELOPE_POLICY_UNRESOLVED"));
console.log("names COST_ENVELOPES_NOT_SEALED", c27.includes("COST_ENVELOPES_NOT_SEALED"));

console.log("\nPROBLEMS", problems.length);
for (const p of problems) console.log(" -", p);
