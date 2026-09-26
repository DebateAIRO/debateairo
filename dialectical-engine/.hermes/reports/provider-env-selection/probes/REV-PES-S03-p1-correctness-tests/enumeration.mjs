// REV-PES-S03-p1-correctness-tests enumeration.
// Written against slice head 98264a5ea. Root is argv[2] or $WORKTREE — never a hard-coded lane.
// Anchors copied from probes/ARCH-PES-S03/enumeration.mjs so the 12-code set is the same sweep.
import { readFile } from "node:fs/promises";

const LANE = process.argv[2] ?? process.env.WORKTREE;
if (!LANE) {
  console.error("usage: node enumeration.mjs <worktree dialectical-engine dir>");
  process.exit(2);
}
const root = LANE.endsWith("/") ? LANE : `${LANE}/`;

const CODE = /[`"]([A-Z][A-Z0-9_]{4,})(?=[:`"])/gu;

function slice(source, from, until) {
  const a = source.indexOf(from);
  if (a < 0) throw new Error(`ANCHOR NOT FOUND: ${from}`);
  const b = source.indexOf(until, a + from.length);
  if (b < 0) throw new Error(`TERMINATOR NOT FOUND after ${from}: ${until}`);
  return source.slice(a, b + until.length);
}

const providers = await readFile(root + "packages/providers/src/index.ts", "utf8");
const support = await readFile(root + "apps/api/src/support/model.ts", "utf8");
const envelope = await readFile(root + "packages/register/src/cost-envelope-policy.ts", "utf8");
const runtime = await readFile(root + "packages/register/src/runtime-environment.ts", "utf8");
const readme = await readFile(root + "deploy/vps/README.md", "utf8");

const ANCHORS = [
  ["E1", "packages/providers/src/index.ts", providers, "const PROVIDER_CREDENTIAL_REFUSAL_CODES", "] as const);"],
  ["E2", "packages/providers/src/index.ts", providers, "const PROVIDER_CREDENTIAL_ABSENT_CODE = ", ";"],
  ["E3", "apps/api/src/support/model.ts", support, "export const SUPPORT_MODEL_STARTUP_REFUSAL_CODES", "] as const);"],
  ["E4", "packages/providers/src/index.ts", providers, "export function assertPricedProviderTargets", "\n}"],
  ["E5", "packages/providers/src/index.ts", providers, "function providerTargetPriceAmount", "\n}"],
  ["E6a", "packages/register/src/cost-envelope-policy.ts", envelope, "export function costEnvelopePolicyFromValue", "\n}"],
  ["E6b", "packages/register/src/cost-envelope-policy.ts", envelope, "export async function readCostEnvelopePolicy", "\n}"],
  ["E7", "packages/register/src/runtime-environment.ts", runtime, "export class SupportAdmissionScopesNotSealedError", "\n}"]
];

const union = new Set();
for (const [id, file, source, from, until] of ANCHORS) {
  const body = slice(source, from, until);
  const codes = [...new Set([...body.matchAll(CODE)].map((m) => m[1]))].sort();
  const startLine = source.slice(0, source.indexOf(from)).split("\n").length;
  const endLine = startLine + body.split("\n").length - 1;
  codes.forEach((c) => union.add(c));
  console.log(`${id}  ${file}:${startLine}-${endLine}  ->  ${codes.join(", ") || "(NONE)"}`);
}

const sectionStart = readme.indexOf("## 11. Providers and vendors");
const section = readme.slice(sectionStart);
const refusalStart = readme.indexOf("### What the hosted mode refuses, in code");
const refusalEnd = readme.indexOf("### The credential-file contract");
const refusal = readme.slice(refusalStart, refusalEnd);
const tableLines = refusal.split("\n").filter((line) => line.startsWith("|"));
const table = tableLines.join("\n");

console.log(`\nUNION: ${union.size}`);
const sorted = [...union].sort();
console.log(sorted.join("\n"));

const V8 = [
  "RUN_COST_ENVELOPE_MONEY_REACHED",
  "PROVIDER_USAGE_UNREPORTED",
  "COST_ENVELOPE_CHARGE_UNREPRESENTABLE",
  "DAILY_COST_ENVELOPE_REACHED"
];
console.log("\nV-8 in union: " + V8.filter((c) => union.has(c)).join(", ") || "(none)");
console.log("V-8 in refusal span: " + V8.filter((c) => refusal.includes(c)).join(", ") || "(none)");
console.log("V-8 in README: " + V8.filter((c) => readme.includes(c)).join(", ") || "(none)");

console.log("\ncode | in §11 | in refusal span | in a table row");
for (const code of sorted) {
  const inSection = section.includes(code);
  const inRefusal = refusal.includes(code);
  const inRow = tableLines.some((line) => line.startsWith("|") && line.includes(code));
  console.log(`${code}\tsection=${inSection}\trefusal=${inRefusal}\ttableRow=${inRow}`);
}
