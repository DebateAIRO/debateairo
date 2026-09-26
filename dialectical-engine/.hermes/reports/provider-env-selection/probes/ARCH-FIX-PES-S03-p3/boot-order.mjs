// ARCH-FIX-PES-S03-p3 · the hosted boot order, measured by CONTENT in the lane (read-only).
// B1 (ARCH-REV p2) says the EXACT sentence and the C1-2 Meaning cell place
// PROVIDER_DISCOVERY_TARGET_PRICE_INVALID "before any hosted rule runs". This script prints every
// guard's CALL SITE (never an import line — the reviewer's §E matched imports first, §P corrected it)
// and every throw line the revision cites, then asserts the order relations the Revision 3 text
// claims and the ones that falsify Revision 2's text.
// SELFTEST=1 plants one false relation (parse before the envelope seal) and must FAIL on exactly one.
import { readFileSync } from "node:fs";

const LANE = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03/dialectical-engine/";
const lines = (p) => readFileSync(LANE + p, "utf8").split("\n");
const api = lines("apps/api/src/main.ts");
const runner = lines("apps/runner/src/main.ts");
const providers = lines("packages/providers/src/index.ts");
const runtime = lines("packages/register/src/runtime-environment.ts");
const envelope = lines("packages/register/src/cost-envelope-policy.ts");
const shape = lines("packages/register/src/configured-provider-set.ts");

let bad = 0;
const check = (label, ok, detail = "") => {
  if (!ok) bad += 1;
  console.log(`${ok ? "ok  " : "BAD "} ${label}${detail ? "  — " + detail : ""}`);
};
// first line (1-based) whose text contains `needle` and is not an import/export-list line
const call = (file, needle) => {
  const i = file.findIndex((l) => l.includes(needle) && !/^\s*import\b/u.test(l) && !/^\s+[A-Za-z]+,?\s*$/u.test(l) && !/^\s*\*/u.test(l));
  return i < 0 ? -1 : i + 1;
};
const at = (file, n) => (file[n - 1] ?? "").trim();

console.log("## 1. API boot — call sites, in file order");
const A = {
  loader: call(api, "loadApiEnvironment()"),
  seal: call(api, "assertHostedCostEnvelopesSealed("),
  admissionRead: call(api, "readAdmissionPolicy("),
  support: call(api, "assertHostedSupportAdmissionSealed("),
  policy: call(api, "readCostEnvelopePolicy("),
  parse: call(api, "parseProviderDiscoveryTargets("),
  deployment: call(api, "assertDeploymentProviderTargets("),
  priced: call(api, "assertPricedProviderTargets("),
  credentials: call(api, "resolveProviderTargetCredentials(")
};
for (const [k, n] of Object.entries(A)) console.log(`api  ${k.padEnd(13)} :${n}  ${at(api, n).slice(0, 110)}`);
console.log("\n## 2. Runner boot — call sites, in file order");
const R = {
  loader: call(runner, "loadRunnerEnvironment()"),
  seal: call(runner, "assertHostedCostEnvelopesSealed("),
  parse: call(runner, "parseProviderDiscoveryTargets("),
  deployment: call(runner, "assertDeploymentProviderTargets("),
  priced: call(runner, "assertPricedProviderTargets("),
  credentials: call(runner, "resolveProviderTargetCredentials("),
  policy: call(runner, "readCostEnvelopePolicy("),
  topology: call(runner, "createRunnerProviderTopology(")
};
for (const [k, n] of Object.entries(R)) console.log(`run  ${k.padEnd(13)} :${n}  ${at(runner, n).slice(0, 110)}`);
console.log(`run  support-admission call present: ${runner.some((l) => l.includes("assertHostedSupportAdmissionSealed("))}`);

console.log("\n## 3. What Revision 3's C1-3 sentence claims — parse runs before the price rule, in both services");
check("api: parse < assertDeploymentProviderTargets < assertPricedProviderTargets", A.parse > 0 && A.parse < A.deployment && A.deployment < A.priced, `:${A.parse} < :${A.deployment} < :${A.priced}`);
check("runner: parse < assertDeploymentProviderTargets < assertPricedProviderTargets", R.parse > 0 && R.parse < R.deployment && R.deployment < R.priced, `:${R.parse} < :${R.deployment} < :${R.priced}`);
const parseStart = providers.findIndex((l) => l.startsWith("export function parseProviderDiscoveryTargets(")) + 1;
const parseEnd = providers.findIndex((l, i) => i >= parseStart && l === "}") + 1;
console.log(`index.ts parseProviderDiscoveryTargets spans :${parseStart}-:${parseEnd}`);
check("index.ts:278 throws PRICE_INVALID inside parseProviderDiscoveryTargets", at(providers, 278).includes('"PROVIDER_DISCOVERY_TARGET_PRICE_INVALID"') && 278 > parseStart && 278 < parseEnd, at(providers, 278));
check("index.ts:195 throws PRICE_INVALID inside providerTargetPriceAmount", at(providers, 195).includes('"PROVIDER_DISCOVERY_TARGET_PRICE_INVALID"') && at(providers, 192).startsWith("function providerTargetPriceAmount("), at(providers, 192));
const amountCalls = providers.map((l, i) => (l.includes("providerTargetPriceAmount(row.") ? i + 1 : 0)).filter(Boolean);
check("providerTargetPriceAmount is called only inside the parse (:283, :285)", amountCalls.length === 2 && amountCalls.every((n) => n > parseStart && n < parseEnd), `calls at :${amountCalls.join(", :")}`);
check("index.ts:683 returns early unless hosted; :687 REQUIRED; :700 ZERO", at(providers, 683) === 'if (mode !== "hosted") return;' && at(providers, 687).includes("PROVIDER_TARGET_PRICE_REQUIRED") && at(providers, 700).includes("PROVIDER_TARGET_PRICE_ZERO"));
check("api runSync rethrows (boot-custody.ts: `throw failure;` after closeNow)", readFileSync(LANE + "apps/api/src/boot-custody.ts", "utf8").includes("closeNow(stage);\n        throw failure;"));

console.log("\n## 4. What falsifies Revision 2's words — hosted rules that RUN before the parse");
check("api: the envelope seal runs before parse", A.seal > 0 && A.seal < A.parse, `:${A.seal} < :${A.parse}`);
check("api: support admission runs before parse", A.support > 0 && A.support < A.parse, `:${A.support} < :${A.parse}`);
check("api: the cost-envelope policy is read before parse (hosted only)", A.policy > 0 && A.policy < A.parse && at(api, A.policy - 4).includes('environment.DEPLOYMENT_MODE === "hosted"'), `:${A.policy} < :${A.parse}; guard :${A.policy - 4} ${at(api, A.policy - 4)}`);
check("runner: the envelope seal runs before parse", R.seal > 0 && R.seal < R.parse, `:${R.seal} < :${R.parse}`);
check("runner: the cost-envelope policy is read AFTER parse", R.policy > R.parse, `:${R.policy} > :${R.parse}`);
check("runtime-environment.ts:199-202 — hosted, any support scope absent → SUPPORT_ADMISSION_SCOPES_NOT_SEALED", at(runtime, 199) === 'if (mode !== "hosted") return;' && at(runtime, 200).includes('["supportReads", "supportSessions", "supportModelCalls"]') && at(runtime, 202).includes("throw new SupportAdmissionScopesNotSealedError"));
check("cost-envelope-policy.ts:163-165 — no row → COST_ENVELOPE_POLICY_UNRESOLVED", at(envelope, 163) === "if (row === undefined) {" && at(envelope, 165).includes("COST_ENVELOPE_POLICY_UNRESOLVED"));
check("cost-envelope-policy.ts:131-133 — does not parse, or blank source_ref → COST_ENVELOPE_POLICY_INVALID", at(envelope, 131).includes("!parsed.success || sourceRef.trim() === \"\"") && at(envelope, 133).includes("COST_ENVELOPE_POLICY_INVALID"));
const unreachable = runtime.findIndex((l) => l.includes("`COST_ENVELOPES_NOT_SEALED` is unreachable at")) + 1;
check("the verdict's own input (envelopes unsealed) cannot be built with the shipped source", unreachable > 0 && at(runtime, 157) === 'if (mode !== "hosted") return;' && at(runtime, 158).includes("throw new CostEnvelopesNotSealedError"), `runtime-environment.ts:${unreachable} "${at(runtime, unreachable)}"`);

console.log("\n## 5. Citations the revision corrects (N1 and its class)");
check("configured-provider-set.ts:82 throws CONFIGURED_PROVIDER_SET_INVALID on a duplicate ref", at(shape, 82) === 'if (refs.has(provider.providerRef)) throw new TypeError("CONFIGURED_PROVIDER_SET_INVALID");');
check("  inside assertConfiguredProviderSetShape (:64)", at(shape, 64).startsWith("function assertConfiguredProviderSetShape("));
check("  called at :159 (in assertHostedConfiguredProviderSetVetted, :146) and :184 (in buildConfiguredProviderSetDeploymentRow, :177)", at(shape, 159).startsWith("assertConfiguredProviderSetShape(") && at(shape, 146).startsWith("export function assertHostedConfiguredProviderSetVetted(") && at(shape, 184).startsWith("assertConfiguredProviderSetShape(input.requiredDistinctMakers") && at(shape, 177).startsWith("export function buildConfiguredProviderSetDeploymentRow("));
check("  :155-162 name no CONFIGURED_PROVIDER_DUPLICATE (the Revision 2 citation)", !shape.slice(154, 162).join("\n").includes("CONFIGURED_PROVIDER_DUPLICATE"));
check("index.ts:255 throws CONFIGURED_PROVIDER_DUPLICATE (the boot guard)", at(providers, 255).includes('throw new TypeError("CONFIGURED_PROVIDER_DUPLICATE")'));
check("runtime-environment.ts:176 is the class's code field, not a throw (Revision 2's row-6 source)", at(runtime, 176) === 'readonly code = "SUPPORT_ADMISSION_SCOPES_NOT_SEALED";' && !at(runtime, 176).includes("throw"));
check("runtime-environment.ts:144/:147 are the class's code field and super call, not the refusal (Revision 2's C2-7 source)", at(runtime, 144) === 'readonly code = "COST_ENVELOPES_NOT_SEALED";' && at(runtime, 147) === 'super("COST_ENVELOPES_NOT_SEALED");');
check("index.ts:193-194 hold the integer and upper bound, :699 the floor of 1 (C2-5's rule, beside :679)", at(providers, 193).includes("Number.isInteger(value)") && at(providers, 194).includes("Number.MAX_SAFE_INTEGER") && at(providers, 699).includes("< 1") && at(providers, 679).startsWith("export function assertPricedProviderTargets("));

if (process.env.SELFTEST === "1") {
  console.log("\n## SELFTEST: planted false relation — the API parses BEFORE the envelope seal");
  check("SELFTEST api: parse < seal", A.parse < A.seal, `:${A.parse} < :${A.seal}`);
}
console.log(`\n${bad === 0 ? "BOOT_ORDER_OK" : "BOOT_ORDER_FAIL"} — ${bad} not met`);
process.exitCode = bad === 0 ? 0 : 1;
