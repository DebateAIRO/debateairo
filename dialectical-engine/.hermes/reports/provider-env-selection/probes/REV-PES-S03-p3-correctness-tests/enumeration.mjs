// REV-PES-S03-p3-correctness-tests: copy of ARCH-PES-S03/enumeration.mjs with the lane from argv/$WORKTREE (written against 9f29022f3).
// ARCH-PES-S03 · proves the R3.5 enumeration BEFORE it is written into a test.
// Every anchor is a STRING the reader finds (TOOLING-TRAPS :329 — anchor on the symbol,
// never on a line number). The extraction covers BOTH quote styles, because the price
// codes are raised from BACKTICK templates and the inventories use double quotes
// (TOOLING-TRAPS :3088 — a surface derived from ONE idiom misses what the SPEC names).
import { readFile } from "node:fs/promises";

const LANE = (process.argv[2] ?? process.env.WORKTREE ?? (() => { throw new Error("usage: node enumeration.mjs <lane dialectical-engine dir>"); })()).replace(/\/?$/u, "/");

// A refusal code as this tree writes one: SCREAMING_SNAKE, >= 5 chars, closed by the
// quote that opened it or by the `:` that prefixes an interpolated ref.
const CODE = /[`"]([A-Z][A-Z0-9_]{4,})(?=[:`"])/gu;

/** slice from the first occurrence of `from` to the first `until` at or after it. */
function slice(source, from, until) {
  const a = source.indexOf(from);
  if (a < 0) throw new Error(`ANCHOR NOT FOUND: ${from}`);
  const b = source.indexOf(until, a + from.length);
  if (b < 0) throw new Error(`TERMINATOR NOT FOUND after ${from}: ${until}`);
  return source.slice(a, b + until.length);
}

const providers = await readFile(LANE + "packages/providers/src/index.ts", "utf8");
const support = await readFile(LANE + "apps/api/src/support/model.ts", "utf8");
const envelope = await readFile(LANE + "packages/register/src/cost-envelope-policy.ts", "utf8");
const runtime = await readFile(LANE + "packages/register/src/runtime-environment.ts", "utf8");

const ANCHORS = [
  ["E1", "packages/providers/src/index.ts", providers,
    "const PROVIDER_CREDENTIAL_REFUSAL_CODES", "] as const);"],
  ["E2", "packages/providers/src/index.ts", providers,
    "const PROVIDER_CREDENTIAL_ABSENT_CODE = ", ";"],
  ["E3", "apps/api/src/support/model.ts", support,
    "export const SUPPORT_MODEL_STARTUP_REFUSAL_CODES", "] as const);"],
  ["E4", "packages/providers/src/index.ts", providers,
    "export function assertPricedProviderTargets", "\n}"],
  ["E5", "packages/providers/src/index.ts", providers,
    "function providerTargetPriceAmount", "\n}"],
  ["E6a", "packages/register/src/cost-envelope-policy.ts", envelope,
    "export function costEnvelopePolicyFromValue", "\n}"],
  ["E6b", "packages/register/src/cost-envelope-policy.ts", envelope,
    "export async function readCostEnvelopePolicy", "\n}"],
  ["E7", "packages/register/src/runtime-environment.ts", runtime,
    "export class SupportAdmissionScopesNotSealedError", "\n}"]
];

const union = new Set();
for (const [id, file, source, from, until] of ANCHORS) {
  const body = slice(source, from, until);
  const codes = [...new Set([...body.matchAll(CODE)].map((m) => m[1]))].sort();
  const startLine = source.slice(0, source.indexOf(from)).split("\n").length;
  const endLine = startLine + body.split("\n").length - 1;
  codes.forEach((c) => union.add(c));
  console.log(`${id}  ${file}:${startLine}-${endLine}  ->  ${codes.join(", ") || "(NONE — DEFECT)"}`);
}

const readme = await readFile(LANE + "deploy/vps/README.md", "utf8");
const section = readme.slice(readme.indexOf("## 11. Providers and vendors"));
console.log(`\nUNION: ${union.size} distinct codes`);
const absent = [...union].filter((c) => !section.includes(c)).sort();
const present = [...union].filter((c) => section.includes(c)).sort();
console.log(`IN §11 (${present.length}): ${present.join(", ")}`);
console.log(`ABSENT from §11 (${absent.length}):`);
absent.forEach((c) => console.log(`   ${c}`));

const SPEC_SIX = [
  "PROVIDER_TARGET_PRICE_REQUIRED", "PROVIDER_TARGET_PRICE_ZERO",
  "PROVIDER_DISCOVERY_TARGET_PRICE_INVALID", "COST_ENVELOPE_POLICY_UNRESOLVED",
  "COST_ENVELOPE_POLICY_INVALID", "SUPPORT_ADMISSION_SCOPES_NOT_SEALED"
].sort();
console.log(`\nCLOSES WITH SPEC R3.3's SIX? ${JSON.stringify(absent) === JSON.stringify(SPEC_SIX)}`);
console.log(`  absent   : ${JSON.stringify(absent)}`);
console.log(`  R3.3 six : ${JSON.stringify(SPEC_SIX)}`);

// KNOWN-HIT proof of the regex itself: it must find a backtick-with-colon code,
// a double-quoted code, and must NOT find a lowercase or too-short token.
const fixture = 'throw new TypeError(`AAA_BBB_CCC:${x}`); const y = "DDD_EEE"; const z = "lower"; const w = "ABC";';
const found = [...new Set([...fixture.matchAll(CODE)].map((m) => m[1]))].sort();
console.log(`\nREGEX KNOWN-HIT: ${JSON.stringify(found)}  (expect ["AAA_BBB_CCC","DDD_EEE"])`);
