// ARCH-FIX-PES-S03-p3 · N1's class: a `path:line` the plan cites for a code or a behaviour must be a
// line that shows it (the throw, the condition, the call) — not a call site of something else, not a
// class's code field. Each row: the text the plan carries (checked verbatim in the plan file), the lane
// file:line, and what that line must contain. MODE=rev3 checks the revision (live PLAN.md); MODE=rev2
// runs Revision 2's citations for the same claims against the same lines — the failing fixture: its
// known-bad members must FAIL. SELFTEST=1 plants one false expectation.
import { readFileSync } from "node:fs";

const MAIN = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/";
const LANE = MAIN + ".worktrees/pes-s03/dialectical-engine/";
const MODE = process.env.MODE ?? "rev3";
const PLAN = readFileSync(process.env.PLAN ?? (MODE === "rev2"
  ? MAIN + ".hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S03-p3/PLAN-at-rev2.md"
  : MAIN + "docs/missions/provider-env-selection/slices/S03/PLAN.md"), "utf8");
const cache = new Map();
const line = (file, n) => {
  if (!cache.has(file)) cache.set(file, readFileSync(LANE + file, "utf8").split("\n"));
  return cache.get(file)[n - 1] ?? "";
};
const span = (file, a, b) => Array.from({ length: b - a + 1 }, (_, i) => line(file, a + i)).join("\n");

const P = "packages/providers/src/index.ts";
const RT = "packages/register/src/runtime-environment.ts";
const CPS = "packages/register/src/configured-provider-set.ts";
const CEP = "packages/register/src/cost-envelope-policy.ts";
// [claim, text the plan must carry, file, from, to, must contain]
const REV3 = [
  ["N1: the publish-time duplicate refusal", "(`:64`, called at `:184`), refuses a duplicate ref at publish under a DIFFERENT code, `CONFIGURED_PROVIDER_SET_INVALID` (`:82`)", CPS, 82, 82, 'throw new TypeError("CONFIGURED_PROVIDER_SET_INVALID")'],
  ["N1: the builder", "`buildConfiguredProviderSetDeploymentRow` (`packages/register/src/configured-provider-set.ts:177`)", CPS, 177, 177, "export function buildConfiguredProviderSetDeploymentRow("],
  ["N1: the builder calls the shape check", "called at `:184`", CPS, 184, 184, "assertConfiguredProviderSetShape("],
  ["N1: the shape check", "`assertConfiguredProviderSetShape` (`:64`", CPS, 64, 64, "function assertConfiguredProviderSetShape("],
  ["N1: the hosted publication check calls it too", "The hosted publication check calls the same shape check (`:159`)", CPS, 159, 159, "assertConfiguredProviderSetShape("],
  ["N1: the boot guard", "`CONFIGURED_PROVIDER_DUPLICATE` | `packages/providers/src/index.ts:255`", P, 255, 255, 'throw new TypeError("CONFIGURED_PROVIDER_DUPLICATE")'],
  ["class: row 6's throw", "`packages/register/src/runtime-environment.ts:202` (the throw;", RT, 202, 202, "throw new SupportAdmissionScopesNotSealedError"],
  ["class: row 6's mode test", "the mode test is `:199`", RT, 199, 199, 'if (mode !== "hosted") return;'],
  ["class: row 6's three budgets", "the three budgets `:200-201`", RT, 200, 201, '["supportReads", "supportSessions", "supportModelCalls"]'],
  ["class: row 6's row members", "`packages/register/src/session-policy.ts:134-136`", "packages/register/src/session-policy.ts", 134, 136, "support_model_calls"],
  ["class: row 6's call site", "called at `apps/api/src/main.ts:230`", "apps/api/src/main.ts", 230, 230, "assertHostedSupportAdmissionSealed("],
  ["class: row 6's row read", "on the row read at `:217`", "apps/api/src/main.ts", 217, 217, "readAdmissionPolicy("],
  ["class: C2-7's refusal", "`packages/register/src/runtime-environment.ts:157-158` does", RT, 157, 158, "throw new CostEnvelopesNotSealedError"],
  ["class: C2-7's api call", "(`apps/api/src/main.ts:97`, `apps/runner/src/main.ts:38`)", "apps/api/src/main.ts", 97, 97, "assertHostedCostEnvelopesSealed("],
  ["class: C2-7's runner call", "(`apps/api/src/main.ts:97`, `apps/runner/src/main.ts:38`)", "apps/runner/src/main.ts", 38, 38, "assertHostedCostEnvelopesSealed("],
  ["class: C2-7's unreachable note", "`runtime-environment.ts:112-114` says", RT, 112, 114, "is unreachable at"],
  ["class: C2-5's integer and upper bound", "the integer test and the upper bound sit in the parse, at `:193-194`", P, 193, 194, "Number.MAX_SAFE_INTEGER"],
  ["class: C2-5's floor", "The function there holds the\nfloor of 1 (`:699`)", P, 699, 699, "< 1"],
  ["checked: row 1 (:278)", "`packages/providers/src/index.ts:278` and `:195`", P, 278, 278, 'throw new TypeError("PROVIDER_DISCOVERY_TARGET_PRICE_INVALID")'],
  ["checked: row 1 (:195)", "`packages/providers/src/index.ts:278` and `:195`", P, 195, 195, 'throw new TypeError("PROVIDER_DISCOVERY_TARGET_PRICE_INVALID")'],
  ["checked: row 2 (:687)", "`packages/providers/src/index.ts:687` (and again", P, 687, 687, "PROVIDER_TARGET_PRICE_REQUIRED"],
  ["checked: row 2 (runner :117)", "`apps/runner/src/main.ts:117`", "apps/runner/src/main.ts", 117, 117, "PROVIDER_TARGET_PRICE_REQUIRED"],
  ["checked: row 2 (runner comment :103-107)", "its own comment `:103-107` says so", "apps/runner/src/main.ts", 103, 107, "cannot be null there"],
  ["checked: row 3 (:700)", "`packages/providers/src/index.ts:700` |", P, 700, 700, "PROVIDER_TARGET_PRICE_ZERO"],
  ["checked: row 4 (:165)", "`packages/register/src/cost-envelope-policy.ts:165` |", CEP, 163, 165, "COST_ENVELOPE_POLICY_UNRESOLVED"],
  ["checked: row 5 (:133)", "`packages/register/src/cost-envelope-policy.ts:133` |", CEP, 131, 133, "COST_ENVELOPE_POLICY_INVALID"],
  ["checked: §1b length-retry throw", "`packages/providers/src/index.ts:1045`", P, 1045, 1045, 'throw new TypeError("PROVIDER_LENGTH_RETRY_FAILURE_COUNT_INVALID")'],
  ["checked: §1b length-retry caller", "its only caller (`:1151`)", P, 1151, 1151, "lengthRetryTokenCeiling("],
  ["checked: §1b V-8 inventory", "`packages/providers/src/index.ts:934-946`", P, 934, 934, "PROVIDER_COST_ENVELOPE_REFUSAL_CODES"],
  ["checked: C2-8 probe max_tokens", "`packages/providers/src/provider-probe.ts:82`", "packages/providers/src/provider-probe.ts", 82, 82, "max_tokens: 8"],
  ["checked: C2-8 freshness validation", "`packages/register/src/index.ts:457`", "packages/register/src/index.ts", 457, 457, "probe_freshness_ms: z.number().int().positive()"],
  ["checked: C2-8 dev seed", "`apps/runner/src/dev-deployment-register.ts:344`", "apps/runner/src/dev-deployment-register.ts", 344, 344, "probe_freshness_ms: 600_000"]
];
// Revision 2's citations for the three claims the class sweep corrected (the failing fixture).
const REV2 = [
  ["N1 (rev2): the duplicate refusal at :155-162", "(`packages/register/src/configured-provider-set.ts:155-162`) refuses a duplicate ref", CPS, 155, 162, "CONFIGURED_PROVIDER_DUPLICATE"],
  ["class (rev2): row 6 at :176", "`packages/register/src/runtime-environment.ts:176` |", RT, 176, 176, "throw new SupportAdmissionScopesNotSealedError"],
  ["class (rev2): C2-7 at :144,147", "`packages/register/src/runtime-environment.ts:144,147` does", RT, 144, 147, "throw new CostEnvelopesNotSealedError"],
  ["checked (rev2): row 1 (:278)", "`packages/providers/src/index.ts:278` and `:195`", P, 278, 278, 'throw new TypeError("PROVIDER_DISCOVERY_TARGET_PRICE_INVALID")']
];

let bad = 0;
const expect = (label, got, want) => {
  const ok = got === want;
  if (!ok) bad += 1;
  console.log(`${ok ? "ok  " : "BAD "} ${label.padEnd(52)} got=${got}   want=${want}`);
};
const rows = MODE === "rev2" ? REV2 : REV3;
console.log(`mode ${MODE}: ${rows.length} citations\n`);
for (const [label, text, file, a, b, needle] of rows) {
  const inPlan = PLAN.includes(text) ? "in plan" : "NOT IN PLAN";
  const shows = span(file, a, b).includes(needle) ? "line shows it" : "line does NOT show it";
  const want = MODE === "rev2" && !label.startsWith("checked") ? "line does NOT show it" : "line shows it";
  expect(`${label} [${file}:${a}${b > a ? "-" + b : ""}]`, `${inPlan} / ${shows}`, `in plan / ${want}`);
}
if (MODE === "rev3") {
  console.log("\n## Revision 2's three wrong citations are gone from the plan");
  for (const old of ["configured-provider-set.ts:155-162", "runtime-environment.ts:176`", "runtime-environment.ts:144,147"]) {
    expect(`absent: ${old}`, PLAN.includes(old) ? "present" : "absent", "absent");
  }
}
if (process.env.SELFTEST === "1") {
  console.log("\n## SELFTEST: planted false expectation — Revision 2's N1 citation shows the code");
  expect("SELFTEST :155-162 shows CONFIGURED_PROVIDER_DUPLICATE", span(CPS, 155, 162).includes("CONFIGURED_PROVIDER_DUPLICATE") ? "shows" : "does not", "shows");
}
console.log(`\n${bad === 0 ? "CITATIONS_OK" : "CITATIONS_FAIL"} — ${bad} not met`);
process.exitCode = bad === 0 ? 0 : 1;
