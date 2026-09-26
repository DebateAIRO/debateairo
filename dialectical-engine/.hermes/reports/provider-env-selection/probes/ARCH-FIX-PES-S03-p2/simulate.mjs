// ARCH-FIX-PES-S03-p2 · the detector for B1 (all three members + the class sweep), N1, N2, N4.
//
// Builds the README a CORRECT BUILD seat leaves at every step boundary of the REVISED plan
// (S0 base … S7 after C2-9), plus MUTANTS that re-introduce each finding's defect, and writes
// them under snap/. It then runs the widened pin's C1-1 case and the four C2 cases (as the
// revised plan specifies them, and as pass 1 specified them) against every snapshot.
// The shell-level oracles (the literal commands the PLAN prints) run in oracles.sh against the
// same files. Nothing is written in the lane: the lane README is READ, snapshots live here.
//
// Every expectation is asserted; the run ends CHECKER_OK only if every correct snapshot PASSES
// and every mutant FAILS for the reason it was built to show.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const LANE = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03/dialectical-engine/";
const OUT = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S03-p2/snap/";
mkdirSync(OUT, { recursive: true });

const base = readFileSync(LANE + "deploy/vps/README.md", "utf8");

// ---------- edit helpers (text-anchored, as a BUILD seat would edit) ----------
function insertAfterLine(src, lineStartsWith, text) {
  const lines = src.split("\n");
  const i = lines.findIndex((l) => l.startsWith(lineStartsWith));
  if (i < 0) throw new Error("ANCHOR NOT FOUND: " + lineStartsWith);
  lines.splice(i + 1, 0, ...text.split("\n"));
  return lines.join("\n");
}
function replaceLines(src, fromStartsWith, count, text) {
  const lines = src.split("\n");
  const i = lines.findIndex((l) => l.startsWith(fromStartsWith));
  if (i < 0) throw new Error("ANCHOR NOT FOUND: " + fromStartsWith);
  lines.splice(i, count, ...text.split("\n"));
  return lines.join("\n");
}

// ---------- the correct edits, faithful to the revised plan's text ----------
const C1_2_ROWS = [
  "| `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` | one of the two price members is declared without the other, or a declared amount is not an integer in `[0, Number.MAX_SAFE_INTEGER]`. Raised while the targets are parsed, before any hosted rule runs. |",
  "| `PROVIDER_TARGET_PRICE_REQUIRED:` and the provider ref | hosted mode, and a debate target declares no price pair at all. |",
  "| `PROVIDER_TARGET_PRICE_ZERO:` and the provider ref | hosted mode, and a declared input or output amount is below 1 micro-unit per million tokens. |",
  "| `COST_ENVELOPE_POLICY_UNRESOLVED` | no `costEnvelopePolicy` row exists at the resolved `REGISTER_VERSION`. |",
  "| `COST_ENVELOPE_POLICY_INVALID` | the `costEnvelopePolicy` row exists but does not parse, or its `source_ref` is blank. |",
  "| `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` | hosted start-up, and the support admission scopes row is not sealed. |"
].join("\n");

// C1-3, EXACT in the revised plan.
const C1_3_SENTENCE =
  "`PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` is raised while the targets are parsed, before any hosted rule runs and before `PROVIDER_TARGET_PRICE_REQUIRED` or `PROVIDER_TARGET_PRICE_ZERO` can be: a target whose price is malformed refuses with the first code and never reaches the other two.";

// C2-5 — two faithful prose variants. B cross-mentions the other member, which C2-5's own
// instruction ("declaring one without the other refuses with …") invites.
const C2_5_ROWS_A = [
  "| `input_price_micros_per_million` | the vendor's input price in micro-USD per million tokens: an integer, at least 1, at most `Number.MAX_SAFE_INTEGER`. Declared together with the output price or not at all; one without the other refuses with `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID`. |",
  "| `output_price_micros_per_million` | the vendor's output price, in the same unit and under the same rule. |"
].join("\n");
const C2_5_ROWS_B = [
  "| `input_price_micros_per_million` | the vendor's input price in micro-USD per million tokens: an integer, at least 1, at most `Number.MAX_SAFE_INTEGER`. Declaring it without `output_price_micros_per_million` refuses with `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID`. |",
  "| `output_price_micros_per_million` | the vendor's output price, same unit and rule. Declaring it without `input_price_micros_per_million` refuses with `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID`. |"
].join("\n");

const JSON_RUNNER = '{"provider_ref":"vendor:acme","base_url":"https://api.acme.example/v1","model":"acme-large","input_price_micros_per_million":3000000,"output_price_micros_per_million":15000000,"authorization_file":"/etc/debateai/runner/providers/acme.header"}';
const JSON_API = JSON_RUNNER.replace("/etc/debateai/runner/providers/", "/etc/debateai/api/providers/");
const C2_6_BLOCK = [
  "In `runner.env` the entry for the example above reads:",
  "`" + JSON_RUNNER + "`",
  "In `api.env` it reads:",
  "`" + JSON_API + "`",
  "The two amounts are the vendor's own published rate in micro-USD per million tokens, and are replaced for each vendor."
].join("\n");

const C2_7_PARAGRAPH = [
  "**What the support chat cannot tell you yet.** Its spend row records the tokens a vendor",
  "reports, but most vendors report no money at all, so the `cost_usd` column stays empty. That is",
  "not an unbounded spend on this host: a hosted deployment refuses to start until the cost",
  "envelopes (V-28) are sealed, with `COST_ENVELOPES_NOT_SEALED` (the table below). A reply that",
  "carries no cost is logged once as `SUPPORT_MODEL_COST_UNREPORTED`, so an empty column is never",
  "mistaken for a call that was free."
].join("\n");

const COST_PARA = (body) => "\n" + body;
const C2_8_FAITHFUL =
  "**What the discovery probe costs.** Each provider target is probed with one completion of `max_tokens: 8` per staleness window. The window is `probe_freshness_ms` in the `panelDiscoveryPolicy` register row, validated only as a positive integer; the development seed publishes `600000`. Hosted mode enforces no minimum, so the number an operator publishes is the whole control over this spend.";

// ---------- build the correct snapshots ----------
const S = {};
S.S0 = base;
S.S1 = insertAfterLine(S.S0, "| `SUPPORT_MODEL_PATH_NOT_RATIFIED` |", C1_2_ROWS);                 // after C1-2
S.S2 = insertAfterLine(S.S1, "| `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` |", "\n" + C1_3_SENTENCE);   // after C1-3
S.S3a = insertAfterLine(S.S2, "| `model` |", C2_5_ROWS_A);                                         // after C2-5 (A)
S.S3b = insertAfterLine(S.S2, "| `model` |", C2_5_ROWS_B);                                         // after C2-5 (B)
const exampleCount = 2; // the runner.env line and the api.env sentence
S.S4a = replaceLines(S.S3a, "In `runner.env` the entry for the example above reads", exampleCount, C2_6_BLOCK);
S.S4b = replaceLines(S.S3b, "In `runner.env` the entry for the example above reads", exampleCount, C2_6_BLOCK);
S.S5 = replaceLines(S.S4a, "**What the support chat cannot tell you yet.**", 5, C2_7_PARAGRAPH);  // after C2-7
S.S6 = insertAfterLine(S.S5, "mistaken for a call that was free.", COST_PARA(C2_8_FAITHFUL));      // after C2-8
// C2-9: remove B1 (5 lines), B2 (4), B3 (4) = the 13 lines from B1's first line.
S.S7 = replaceLines(S.S6, "- **§11's hosted provider target example**", 13, "").replace("\n\n- **\"KEK", "\n- **\"KEK");

// ---------- mutants ----------
const M = {};
// N4: an angle-bracket ref in the refusal table, at base (C1-1's boundary) and after C1-3.
M.N4_base = insertAfterLine(S.S0, "| `SUPPORT_MODEL_PATH_NOT_RATIFIED` |", "| `PROVIDER_TARGET_PRICE_REQUIRED:<ref>` | mutant row |");
M.N4_S2 = S.S2.replace("| `PROVIDER_TARGET_PRICE_REQUIRED:` and the provider ref |", "| `PROVIDER_TARGET_PRICE_REQUIRED:<ref>` |");
// B1.1: one of the six rows missing.
M.B11_five = S.S1.replace(/\n\| `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` \|[^\n]*/, "");
// B1.2: one of the two member rows missing.
M.B12_one = S.S3a.replace(/\n\| `output_price_micros_per_million` \|[^\n]*/, "");
// B1.3: the api.env line lost its output price.
M.B13_noOut = S.S4a.replace('"output_price_micros_per_million":15000000,"authorization_file":"/etc/debateai/api/', '"authorization_file":"/etc/debateai/api/');
// C2-9: B3 not removed.
M.C29_keepB3 = replaceLines(S.S6, "- **§11's hosted provider target example**", 9, "").replace("\n\n- **\"the daily", "\n- **\"the daily");

for (const [k, v] of Object.entries({ ...S, ...M })) writeFileSync(OUT + k + ".md", v);

// ---------- the test-case logic: pass-1 (OLD) and revised (NEW) ----------
const CODE = /[`"]([A-Z][A-Z0-9_]{4,})(?=[:`"])/gu;
const src = (rel) => readFileSync(LANE + rel, "utf8");
function sl(source, from, until) {
  const a = source.indexOf(from); const b = source.indexOf(until, a + from.length);
  if (a < 0 || b < 0) throw new Error("anchor " + from);
  return source.slice(a, b + until.length);
}
const providers = src("packages/providers/src/index.ts");
const anchors = [
  [providers, "const PROVIDER_CREDENTIAL_REFUSAL_CODES", "] as const);"],
  [providers, "const PROVIDER_CREDENTIAL_ABSENT_CODE = ", ";"],
  [src("apps/api/src/support/model.ts"), "export const SUPPORT_MODEL_STARTUP_REFUSAL_CODES", "] as const);"],
  [providers, "export function assertPricedProviderTargets", "\n}"],
  [providers, "function providerTargetPriceAmount", "\n}"],
  [src("packages/register/src/cost-envelope-policy.ts"), "export function costEnvelopePolicyFromValue", "\n}"],
  [src("packages/register/src/cost-envelope-policy.ts"), "export async function readCostEnvelopePolicy", "\n}"],
  [src("packages/register/src/runtime-environment.ts"), "export class SupportAdmissionScopesNotSealedError", "\n}"]
];
const union = new Set();
for (const [s, f, u] of anchors) for (const m of sl(s, f, u).matchAll(CODE)) union.add(m[1]);

const REFUSAL_FROM = "### What the hosted mode refuses, in code";
const REFUSAL_TO = "### The credential-file contract";
const s11 = (r) => r.slice(r.indexOf("## 11. Providers and vendors"));
const refusalSpan = (r) => r.slice(r.indexOf(REFUSAL_FROM), r.indexOf(REFUSAL_TO));
function afterTable(r) {
  const lines = refusalSpan(r).split("\n");
  let last = -1; lines.forEach((l, i) => { if (l.startsWith("|")) last = i; });
  return lines.slice(last + 1).join("\n");
}

function c1CaseOLD(r) {                       // pass 1: union + loop only
  if (union.size !== 12) return "FAIL union";
  for (const c of union) if (!s11(r).includes(c)) return "FAIL code:" + c;
  return "PASS";
}
function c1CaseNEW(r) {                       // revised: union → angle → loop → guard order (after the table)
  if (union.size !== 12) return "FAIL union";
  if (/<[a-z-]+>/u.test(refusalSpan(r))) return "FAIL angle-bracket";
  for (const c of union) if (!s11(r).includes(c)) return "FAIL code:" + c;
  const t = afterTable(r);
  for (const tok of ["PROVIDER_DISCOVERY_TARGET_PRICE_INVALID", "PROVIDER_TARGET_PRICE_REQUIRED"]) if (!t.includes(tok)) return "FAIL guard-order:" + tok;
  if (!/\bbefore\b/u.test(t)) return "FAIL guard-order:before";
  return "PASS";
}
function c1GuardWholeSpan(r) {                // the NAIVE guard-order check a seat might write: whole span
  const t = refusalSpan(r);
  const ok = t.includes("PROVIDER_DISCOVERY_TARGET_PRICE_INVALID") && t.includes("PROVIDER_TARGET_PRICE_REQUIRED") && /\bbefore\b/u.test(t);
  return ok ? "PASS" : "FAIL";
}

const paragraphOf = (text, needle) => text.split(/\n[ \t]*\n/).find((p) => p.includes(needle)) ?? "";
const memberSpan = (r) => { const a = r.indexOf("| Member | Value |"); const rest = r.slice(a); const b = rest.indexOf("\n\n"); return rest.slice(0, b < 0 ? rest.length : b); };
function c21(r) {
  const m = memberSpan(r);
  if (!m.includes("input_price_micros_per_million") || !m.includes("output_price_micros_per_million")) return "FAIL member-table";
  const hits = s11(r).split("\n").filter((l) => /"input_price_micros_per_million":\s*\d+/u.test(l));
  if (!hits.some((l) => l.includes("/etc/debateai/runner/providers/")) || !hits.some((l) => l.includes("/etc/debateai/api/providers/"))) return "FAIL env-forms";
  return "PASS";
}
function c22(r) {
  if (/the daily call cap is the only ceiling/u.test(s11(r))) return "FAIL phrase";
  return paragraphOf(s11(r), "SUPPORT_MODEL_COST_UNREPORTED").includes("COST_ENVELOPES_NOT_SEALED") ? "PASS" : "FAIL paragraph";
}
function c23OLD(r) {
  const x = s11(r); const n = (x.match(/max_tokens/gu) ?? []).length; if (n !== 1) return "FAIL count=" + n;
  const p = paragraphOf(x, "max_tokens");
  for (const t of ["probe_freshness_ms", "panelDiscoveryPolicy", "600000"]) if (!p.includes(t)) return "FAIL lacks " + t;
  for (const w of ["recommend", "suggest", "should be"]) if (p.includes(w)) return "FAIL word " + w;
  return "PASS";
}
function c23WHOLEWORD(r) {                   // the reviewer's WHEN, implemented literally
  const x = s11(r); const n = (x.match(/max_tokens/gu) ?? []).length; if (n !== 1) return "FAIL count=" + n;
  const p = paragraphOf(x, "max_tokens");
  for (const t of ["probe_freshness_ms", "panelDiscoveryPolicy"]) if (!p.includes(t)) return "FAIL lacks " + t;
  if (!(p.includes("600000") || p.includes("600_000"))) return "FAIL lacks 600000";
  for (const w of [/\brecommend\b/iu, /\bsuggest\b/iu, /\bshould be\b/iu]) if (w.test(p)) return "FAIL word " + w;
  return "PASS";
}
function c23NEW(r) {                         // revised: \b600_?000\b ; strip "no recommended value", ban the families
  const x = s11(r); const n = (x.match(/max_tokens/gu) ?? []).length; if (n !== 1) return "FAIL count=" + n;
  const p = paragraphOf(x, "max_tokens");
  for (const t of ["probe_freshness_ms", "panelDiscoveryPolicy"]) if (!p.includes(t)) return "FAIL lacks " + t;
  if (!/\b600_?000\b/u.test(p)) return "FAIL lacks 600000";
  const q = p.replace(/no recommended value/giu, "");
  for (const w of [/\brecommend\w*/iu, /\bsuggest\w*/iu, /\bshould be\b/iu]) if (w.test(q)) return "FAIL word " + w;
  return "PASS";
}
function c24(r) {
  const a = r.indexOf("## Known-stale sections"); const span = r.slice(a, r.indexOf("\n---\n", a));
  for (const g of ["§11's hosted provider target example", "§11's refusal-code table is incomplete", "the daily call cap is the only ceiling"]) if (span.includes(g)) return "FAIL has " + g.slice(0, 24);
  for (const k of ["KEK rotation is not implemented", "deploy/vps/env/api.env.example"]) if (!span.includes(k)) return "FAIL lost " + k.slice(0, 24);
  return "PASS";
}

// N2 fixtures: the cost paragraph written seven ways, dropped into S6's place.
const F = {
  F1_faithful_600000: C2_8_FAITHFUL,
  F2_faithful_600_000: C2_8_FAITHFUL.replace("`600000`", "`600_000`"),
  F3_spec_sentence: C2_8_FAITHFUL + " It states no recommended value.",
  F4_recommended_value: C2_8_FAITHFUL + " The recommended value is 600000.",
  F5_suggest: C2_8_FAITHFUL + " We suggest raising it.",
  F6_should_be: C2_8_FAITHFUL + " It should be at least 600000.",
  F7_six_million: C2_8_FAITHFUL.replace("`600000`", "`6000000`")
};

// ---------- run, with expectations ----------
let bad = 0;
function expect(label, got, want) {
  const ok = want instanceof RegExp ? want.test(got) : got === want;
  if (!ok) bad += 1;
  console.log(`${ok ? "ok  " : "BAD "} ${label.padEnd(58)} got=${got}   want=${want}`);
}

console.log("union.size =", union.size);
console.log("\n## C1-1 case — pass-1 design (OLD) vs revised (NEW), each snapshot");
expect("OLD @S0 base", c1CaseOLD(S.S0), /^FAIL code:PROVIDER_TARGET_PRICE_REQUIRED$/);
expect("OLD @S1 after C1-2  [reproduces N1: C1-3 has no RED case]", c1CaseOLD(S.S1), "PASS");
expect("OLD @M.N4_S2 <ref> row  [reproduces N4: not caught]", c1CaseOLD(M.N4_S2), "PASS");
expect("NEW @S0 base  [C1-1's RED, same message as pass 1]", c1CaseNEW(S.S0), /^FAIL code:PROVIDER_TARGET_PRICE_REQUIRED$/);
expect("NEW @S1 after C1-2  [N1: C1-3 now has a RED case]", c1CaseNEW(S.S1), /^FAIL guard-order:PROVIDER_DISCOVERY_TARGET_PRICE_INVALID$/);
expect("NEW @S2 after C1-3", c1CaseNEW(S.S2), "PASS");
expect("NEW @M.N4_base <ref> row at C1-1's boundary  [N4 RED]", c1CaseNEW(M.N4_base), "FAIL angle-bracket");
expect("NEW @M.N4_S2 <ref> row after C1-3  [N4 RED]", c1CaseNEW(M.N4_S2), "FAIL angle-bracket");
expect("NAIVE whole-span guard @S1  [why the check is scoped AFTER the table]", c1GuardWholeSpan(S.S1), "PASS");
expect("NEW @S7 final", c1CaseNEW(S.S7), "PASS");

console.log("\n## C2 cases at each C2 boundary (revised C2-3)");
const row = (r) => [c21(r), c22(r), c23NEW(r), c24(r)];
const tally = (r) => { const x = row(r); return `${x.filter((v) => v === "PASS").length} pass / ${x.filter((v) => v !== "PASS").length} fail`; };
expect("@S2 (C1 done, C2 not started) → 4 C2 cases fail", tally(S.S2), "0 pass / 4 fail");
expect("@S3a after C2-5: C2-1 still fails (env forms)", c21(S.S3a), "FAIL env-forms");
expect("@S4a after C2-6: C2-1 passes", c21(S.S4a), "PASS");
expect("@S4b after C2-6 (prose variant B): C2-1 passes", c21(S.S4b), "PASS");
expect("@S5 after C2-7: C2-2 passes", c22(S.S5), "PASS");
expect("@S6 after C2-8: C2-3 passes", c23NEW(S.S6), "PASS");
expect("@S7 after C2-9: C2-4 passes", c24(S.S7), "PASS");
expect("@S7 final → 4 C2 cases pass", tally(S.S7), "4 pass / 0 fail");
expect("@M.C29_keepB3: C2-4 fails", c24(M.C29_keepB3), /^FAIL has the daily/);

console.log("\n## N2 — the cost-paragraph oracle on seven fixtures: OLD · WHOLE-WORD (reviewer's WHEN, literal) · NEW");
const WANT = {
  F1_faithful_600000: ["PASS", "PASS", "PASS"],
  F2_faithful_600_000: [/^FAIL lacks 600000$/, "PASS", "PASS"],
  F3_spec_sentence: [/^FAIL word recommend$/, "PASS", "PASS"],
  F4_recommended_value: [/^FAIL word recommend$/, "PASS", /^FAIL word/],
  F5_suggest: [/^FAIL word suggest$/, /^FAIL word/, /^FAIL word/],
  F6_should_be: [/^FAIL word should be$/, /^FAIL word/, /^FAIL word/],
  F7_six_million: ["PASS", "PASS", /^FAIL lacks 600000$/]
};
for (const [k, para] of Object.entries(F)) {
  const r = S.S6.replace(C2_8_FAITHFUL, para);
  const [o, w, n] = [c23OLD(r), c23WHOLEWORD(r), c23NEW(r)];
  console.log(`   ${k.padEnd(22)} OLD=${o.padEnd(26)} WHOLE-WORD=${w.padEnd(26)} NEW=${n}`);
  expect(`   ${k} OLD`, o, WANT[k][0]); expect(`   ${k} WHOLE-WORD`, w, WANT[k][1]); expect(`   ${k} NEW`, n, WANT[k][2]);
}

if (process.env.SELFTEST === "1") {
  console.log("\n## SELFTEST: the pass-1 belief 'C1-3 had a RED case' planted as an expectation — must make this checker FAIL");
  expect("SELFTEST OLD @S1 wanted a failure", c1CaseOLD(S.S1), /^FAIL/);
}

console.log(`\n${bad === 0 ? "CHECKER_OK" : "CHECKER_FAIL"} — ${bad} expectation(s) not met`);
process.exitCode = bad === 0 ? 0 : 1;
