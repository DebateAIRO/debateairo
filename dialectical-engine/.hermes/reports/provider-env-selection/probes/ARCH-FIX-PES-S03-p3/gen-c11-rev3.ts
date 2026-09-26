
import { readFile as fsReadFile } from "node:fs/promises";
const README_PATH = process.env.README_PATH as string;
const LANE = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03/dialectical-engine/";
async function readFile(url: URL, _enc: string): Promise<string> {
  const p = url.pathname;
  if (/deploy\/vps\/README\.md$/u.test(p)) return fsReadFile(README_PATH, "utf8");
  const m = /(?:^|\/)((?:packages|apps)\/.*)$/u.exec(p);
  if (!m) throw new Error("shim cannot map " + p);
  return fsReadFile(LANE + m[1], "utf8");
}
function expect(actual: any, message?: string) {
  const fail = (why: string) => { throw new Error(message ?? why); };
  return {
    toBe: (v: any) => { if (actual !== v) fail("toBe " + v + " got " + actual); },
    toBeGreaterThan: (v: number) => { if (!(actual > v)) fail("toBeGreaterThan " + v); },
    toBeGreaterThanOrEqual: (v: number) => { if (!(actual >= v)) fail("toBeGreaterThanOrEqual " + v); },
    toContain: (v: string) => { if (!String(actual).includes(v)) fail("toContain " + v); },
    toMatch: (r: RegExp) => { if (!r.test(String(actual))) fail("toMatch " + r); },
    not: { toMatch: (r: RegExp) => { if (r.test(String(actual))) fail("not.toMatch " + r); } }
  };
}
const cases: Array<[string, () => Promise<void>]> = [];
function it(name: string, fn: () => Promise<void>) { cases.push([name, fn]); }
it("names every start-up refusal the price and cost-envelope surfaces can raise", async () => {
  const read = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
  const providers = await read("packages/providers/src/index.ts");
  const support = await read("apps/api/src/support/model.ts");
  const envelope = await read("packages/register/src/cost-envelope-policy.ts");
  const runtime = await read("packages/register/src/runtime-environment.ts");
  // slices/S03/PLAN.md §1b, rows E1…E7 in order. Anchors are strings, never line numbers.
  const anchors: ReadonlyArray<readonly [string, string, string]> = [
    [providers, "const PROVIDER_CREDENTIAL_REFUSAL_CODES", "] as const);"],
    [providers, "const PROVIDER_CREDENTIAL_ABSENT_CODE = ", ";"],
    [support, "export const SUPPORT_MODEL_STARTUP_REFUSAL_CODES", "] as const);"],
    [providers, "export function assertPricedProviderTargets", "\n}"],
    [providers, "function providerTargetPriceAmount", "\n}"],
    [envelope, "export function costEnvelopePolicyFromValue", "\n}"],
    [envelope, "export async function readCostEnvelopePolicy", "\n}"],
    [runtime, "export class SupportAdmissionScopesNotSealedError", "\n}"]
  ];
  const union = new Set<string>();
  for (const [source, from, until] of anchors) {
    const start = source.indexOf(from);
    expect(start, from).toBeGreaterThanOrEqual(0);
    const body = source.slice(start, source.indexOf(until, start + from.length) + until.length);
    const codes = [...body.matchAll(/[`"]([A-Z][A-Z0-9_]{4,})(?=[:`"])/gu)].map((match) => match[1]!);
    expect(codes.length, from).toBeGreaterThan(0);
    for (const code of codes) union.add(code);
  }
  expect(union.size).toBe(12);
  const readme = await read("deploy/vps/README.md");
  const section = readme.slice(readme.indexOf("## 11. Providers and vendors"));
  const refusal = readme.slice(
    readme.indexOf("### What the hosted mode refuses, in code"),
    readme.indexOf("### The credential-file contract")
  );
  // (1) ARCH-REV p1 N4 — the house style of C1-2's rows has a guard of its own.
  expect(refusal, "no angle-bracket placeholder in §11's refusal table").not.toMatch(/<[a-z-]+>/u);
  // (1b) ARCH-REV p2 B1 — hosted boot runs rules before the parse (C1-3), so this order claim is false.
  expect(refusal, "no 'before any hosted rule' order claim in §11's refusal span").not.toMatch(
    /\bbefore (?:any|every|all|the) hosted rules?\b/iu
  );
  // (2) R3.5 — every enumerated code is in §11.
  for (const code of union) expect(section, code).toContain(code);
  // (3) ARCH-REV p1 N1, p2 B1 — C1-3's EXACT sentence, BELOW the table only, whitespace collapsed.
  const lines = refusal.split("\n");
  const belowTable = lines
    .slice(lines.map((line) => line.startsWith("|")).lastIndexOf(true) + 1)
    .join(" ")
    .replace(/\s+/gu, " ");
  expect(belowTable, "guard-order sentence below the table, EXACT (C1-3)").toContain(
    "`PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` is raised while the targets are parsed, before `PROVIDER_TARGET_PRICE_REQUIRED` or `PROVIDER_TARGET_PRICE_ZERO` can be: a target whose price is malformed never reaches the other two."
  );
});
for (const [, fn] of cases) {
  try { await fn(); console.log("PASS"); } catch (e) { console.log("FAIL " + (e as Error).message); }
}
