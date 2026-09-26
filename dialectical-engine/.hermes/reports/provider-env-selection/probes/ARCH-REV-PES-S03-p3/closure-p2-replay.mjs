// ARCH-REV-PES-S03-p2 — own probes of the Revision 2 closures.
// Reads the lane and the main-tree plan. Writes nothing outside this process's stdout.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const LANE = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03/dialectical-engine";
const MAIN = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const readme0 = readFileSync(`${LANE}/deploy/vps/README.md`, "utf8");
const plan = readFileSync(`${MAIN}/docs/missions/provider-env-selection/slices/S03/PLAN.md`, "utf8");
const spec = readFileSync(`${MAIN}/docs/missions/provider-env-selection/slices/S03/SPEC.md`, "utf8");

function fail(msg) {
  console.log("FAIL", msg);
}
function ok(msg) {
  console.log("OK", msg);
}

console.log("===== A. angle-bracket regex on the unedited refusal span =====");
const hRef = readme0.indexOf("### What the hosted mode refuses, in code");
const hCred = readme0.indexOf("### The credential-file contract");
const refusal0 = readme0.slice(hRef, hCred);
const angle = /<[a-z-]+>/u;
const angleHits = [...refusal0.matchAll(/<[a-z-]+>/gu)].map((m) => m[0]);
console.log("refusal chars", refusal0.length, "angle hits", angleHits.length, angleHits.join(",") || "(none)");
console.log("contains '<'", refusal0.includes("<"), "contains '>'", refusal0.includes(">"));

console.log("\n===== B. anchor extraction, plan's own slice (C1-1 code) =====");
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
const union = new Set();
for (const [source, from, until] of anchors) {
  const start = source.indexOf(from);
  const end = source.indexOf(until, start + from.length);
  const body = end < 0 ? "" : source.slice(start, end + until.length);
  const codes = [...body.matchAll(/[`"]([A-Z][A-Z0-9_]{4,})(?=[:`"])/gu)].map((m) => m[1]);
  console.log(`anchor ${JSON.stringify(from)} start=${start} end=${end} codes=${codes.join(",") || "(none)"}`);
  for (const c of codes) union.add(c);
}
console.log("UNION", union.size, [...union].join(", "));
const section0 = readme0.slice(readme0.indexOf("## 11. Providers and vendors"));
const six = [
  "PROVIDER_TARGET_PRICE_REQUIRED",
  "PROVIDER_TARGET_PRICE_ZERO",
  "PROVIDER_DISCOVERY_TARGET_PRICE_INVALID",
  "COST_ENVELOPE_POLICY_UNRESOLVED",
  "COST_ENVELOPE_POLICY_INVALID",
  "SUPPORT_ADMISSION_SCOPES_NOT_SEALED"
];
const absent = [...union].filter((c) => !section0.includes(c)).sort();
console.log("ABSENT", absent.join(", "));
console.log("ABSENT === R3.3 SIX", JSON.stringify(absent) === JSON.stringify([...six].sort()));

console.log("\n===== C. own TypeError scan of packages/providers/src/index.ts =====");
const idiom = /throw new TypeError\(\s*[`"]([A-Z][A-Z0-9_]{4,})/g;
const idiomCodes = [...new Set([...providers.matchAll(idiom)].map((m) => m[1]))].sort();
const idiomAbsent = idiomCodes.filter((c) => !section0.includes(c));
console.log("distinct", idiomCodes.length);
console.log(idiomCodes.join(", "));
console.log("absent from §11", idiomAbsent.length, idiomAbsent.join(", "));

console.log("\n===== D. publish-time duplicate guard vs the plan's citation =====");
const shape = readFileSync(`${LANE}/packages/register/src/configured-provider-set.ts`, "utf8");
const lines = shape.split("\n");
console.log("line 82:", lines[81]);
console.log("line 159:", lines[158]);
console.log("line 184:", lines[183]);
console.log("builder calls shape check", shape.includes("export function buildConfiguredProviderSetDeploymentRow") && shape.slice(shape.indexOf("export function buildConfiguredProviderSetDeploymentRow")).includes("assertConfiguredProviderSetShape"));
const boot = providers.split("\n")[254];
console.log("index.ts:255:", boot.trim());

console.log("\n===== E. boot order vs the EXACT sentence =====");
const api = readFileSync(`${LANE}/apps/api/src/main.ts`, "utf8").split("\n");
const runner = readFileSync(`${LANE}/apps/runner/src/main.ts`, "utf8").split("\n");
function firstLine(fileLines, needle) {
  const i = fileLines.findIndex((l) => l.includes(needle));
  return i < 0 ? -1 : i + 1;
}
for (const needle of [
  "assertHostedCostEnvelopesSealed",
  "assertHostedSupportAdmissionSealed",
  "parseProviderDiscoveryTargets",
  "assertDeploymentProviderTargets",
  "assertPricedProviderTargets"
]) {
  console.log(`api ${needle} ${firstLine(api, needle)} | runner ${firstLine(runner, needle)}`);
}
const sentence = plan.split("\n").find((l) => l.includes("before any hosted rule runs and before"));
console.log("EXACT sentence present", Boolean(sentence));
console.log("meaning-cell copies", plan.split("\n").filter((l) => l.includes("before any hosted rule runs")).length);

console.log("\n===== F. C1-1 assertions on simulated README states =====");
const SIX_ROWS = [
  "| `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` | one member without the other. Raised while the targets are PARSED, before any hosted rule runs |",
  "| `PROVIDER_TARGET_PRICE_REQUIRED:` and the provider ref | hosted mode, no price pair |",
  "| `PROVIDER_TARGET_PRICE_ZERO:` and the provider ref | hosted mode, amount below 1 |",
  "| `COST_ENVELOPE_POLICY_UNRESOLVED` | no row |",
  "| `COST_ENVELOPE_POLICY_INVALID` | row does not parse |",
  "| `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` | scopes not sealed |"
];
const SENTENCE = "`PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` is raised while the targets are parsed, before any hosted rule runs and before `PROVIDER_TARGET_PRICE_REQUIRED` or `PROVIDER_TARGET_PRICE_ZERO` can be: a target whose price is malformed refuses with the first code and never reaches the other two.";
const TRUE_SENTENCE = "`PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` is raised while the targets are parsed, before `assertDeploymentProviderTargets` and before `PROVIDER_TARGET_PRICE_REQUIRED` or `PROVIDER_TARGET_PRICE_ZERO`: a malformed price refuses with the first code and never reaches the other two.";

function insertRows(text, rows) {
  const marker = "| `SUPPORT_MODEL_PATH_NOT_RATIFIED` |";
  const i = text.indexOf(marker);
  const nl = text.indexOf("\n", i);
  return text.slice(0, nl + 1) + rows.join("\n") + "\n" + text.slice(nl + 1);
}
function insertSentence(text, sentence) {
  const at = text.indexOf("### The credential-file contract");
  return text.slice(0, at) + sentence + "\n\n" + text.slice(at);
}
function runCase(label, text) {
  const refusal = text.slice(text.indexOf("### What the hosted mode refuses, in code"), text.indexOf("### The credential-file contract"));
  const section = text.slice(text.indexOf("## 11. Providers and vendors"));
  const messages = [];
  if (angle.test(refusal)) messages.push("FAIL no angle-bracket placeholder in §11's refusal table");
  else {
    let missing = null;
    for (const code of union) {
      if (!section.includes(code)) { missing = code; break; }
    }
    if (missing) messages.push("FAIL " + missing);
    else {
      const ls = refusal.split("\n");
      const below = ls.slice(ls.map((line) => line.startsWith("|")).lastIndexOf(true) + 1).join("\n");
      for (const token of ["PROVIDER_DISCOVERY_TARGET_PRICE_INVALID", "PROVIDER_TARGET_PRICE_REQUIRED"]) {
        if (!below.includes(token)) messages.push("FAIL guard-order sentence below the table: " + token);
      }
      if (!messages.length && !/\bbefore\b/u.test(below)) messages.push("FAIL guard-order sentence below the table: before");
      if (!messages.length) messages.push("PASS");
    }
  }
  console.log(label, messages[0]);
}
runCase("base", readme0);
runCase("C1-2 six rows, no sentence", insertRows(readme0, SIX_ROWS));
runCase("C1-2 + EXACT sentence", insertSentence(insertRows(readme0, SIX_ROWS), SENTENCE));
runCase("C1-2 + true sentence (still has tokens)", insertSentence(insertRows(readme0, SIX_ROWS), TRUE_SENTENCE));
runCase("five rows + sentence", insertSentence(insertRows(readme0, SIX_ROWS.slice(0, 5)), SENTENCE));
const mutant = insertRows(readme0, ["| `PROVIDER_TARGET_PRICE_REQUIRED:<ref>` | mutant |", ...SIX_ROWS]);
runCase("angle row at C1-1 boundary + six + sentence", insertSentence(mutant, SENTENCE));
runCase("sentence only, no rows", insertSentence(readme0, SENTENCE));

console.log("\n===== G. N2 oracle, own fixtures =====");
function n2(label, paragraph) {
  const count = (paragraph.match(/max_tokens/gu) ?? []).length;
  const seed = /\b600_?000\b/u.test(paragraph);
  const stripped = paragraph.replace(/no recommended value/giu, "");
  const bans = [
    [/\brecommend\w*/iu, "recommend"],
    [/\bsuggest\w*/iu, "suggest"],
    [/\bshould be\b/iu, "should be"]
  ].filter(([re]) => re.test(stripped)).map(([, name]) => name);
  const wholeWordRecommend = /\brecommend\b/iu.test(paragraph);
  console.log(
    label,
    "max_tokens=" + count,
    "seed=" + seed,
    "banned=" + (bans.join("+") || "(none)"),
    "wholeWordRecommend=" + wholeWordRecommend
  );
}
n2("faithful 600000 + spec phrase", "The probe spends max_tokens: 8 per target. The window is the panelDiscoveryPolicy row's probe_freshness_ms. The seed publishes 600000. The paragraph states no recommended value.");
n2("faithful 600_000 + spec phrase", "The probe spends max_tokens: 8 per target. The window is the panelDiscoveryPolicy row's probe_freshness_ms. The seed publishes 600_000. The paragraph states no recommended value.");
n2("spec phrase alone beside numbers", "max_tokens: 8, panelDiscoveryPolicy, probe_freshness_ms, 600000. It states no recommended value.");
n2("recommended value", "max_tokens 8 probe_freshness_ms panelDiscoveryPolicy. The recommended value is 600000.");
n2("suggest", "max_tokens 8 probe_freshness_ms panelDiscoveryPolicy 600000. We suggest raising it.");
n2("should be", "max_tokens 8 probe_freshness_ms panelDiscoveryPolicy. It should be at least 600000.");
n2("6000000", "max_tokens 8 probe_freshness_ms panelDiscoveryPolicy. The seed publishes 6000000. The paragraph states no recommended value.");
n2("whole-word WHEN would miss recommended", "The recommended value is 600000.");

console.log("\n===== H. own SPEC↔PLAN trace =====");
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
if (reverseLine) {
  for (const part of reverseLine.split("·")) {
    const mm = part.match(/(C[12]-\d+) → (.+)/);
    if (!mm) continue;
    reverse.set(mm[1], [...mm[2].matchAll(/R3\.\d+/g)].map((x) => x[0]));
  }
}
const reqNoStep = reqs.filter((r) => !(forward.get(r) || []).length);
const stepNoReq = steps.filter((s) => !(reverse.get(s) || []).length);
console.log("reqs", reqs.length, reqs.join(","));
console.log("steps", steps.length, steps.join(","));
console.log("reverse line found", Boolean(reverseLine));
console.log("req with no step", reqNoStep.join(",") || "(none)");
console.log("step with no req", stepNoReq.join(",") || "(none)");
for (const [r, ids] of forward) {
  const back = new Set(ids.flatMap((id) => reverse.get(id) || []));
  if (!back.has(r)) console.log("forward not reciprocated", r, "steps", ids.join(","));
}
for (const [s, rs] of reverse) {
  for (const r of rs) {
    if (!(forward.get(r) || []).includes(s)) console.log("reverse not reciprocated", s, r);
  }
}
console.log("reciprocity check done");

console.log("\n===== I. shell oracles on simulated files (caller prints) =====");
console.log("readme bytes", readme0.length);
