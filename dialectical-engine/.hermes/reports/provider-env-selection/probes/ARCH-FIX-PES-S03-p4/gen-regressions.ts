
import { readFile as fsReadFile } from "node:fs/promises";
import { readFileSync as fsReadFileSync } from "node:fs";
const README_PATH = process.env.README_PATH as string;
const LANE = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03/dialectical-engine/";
function mapPath(p: string): string {
  if (/deploy\/vps\/README\.md$/u.test(p)) return README_PATH;
  const m = /(?:^|\/)((?:packages|apps|deploy)\/.*)$/u.exec(p);
  if (!m) throw new Error("shim cannot map " + p);
  return LANE + m[1];
}
async function readFile(url: URL, _enc: string): Promise<string> { return fsReadFile(mapPath(url.pathname), "utf8"); }
const read = (path: string) => fsReadFileSync(mapPath(path), "utf8");
const eq = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
function expect(actual: any, message?: string) {
  const fail = (why: string) => { throw new Error(message ?? why); };
  const api = {
    toBe: (v: any) => { if (actual !== v) fail("toBe " + v + " got " + actual); },
    toEqual: (v: any) => { if (!eq(actual, v)) fail("toEqual got " + JSON.stringify(actual)); },
    toHaveLength: (n: number) => { if (actual.length !== n) fail("toHaveLength " + n + " got " + actual.length); },
    toBeGreaterThan: (v: number) => { if (!(actual > v)) fail("toBeGreaterThan " + v); },
    toBeGreaterThanOrEqual: (v: number) => { if (!(actual >= v)) fail("toBeGreaterThanOrEqual " + v); },
    toContain: (v: string) => { if (!actual.includes(v)) fail("toContain " + v); },
    toMatch: (r: RegExp) => { if (!r.test(String(actual))) fail("toMatch " + r); },
    not: {
      toMatch: (r: RegExp) => { if (r.test(String(actual))) fail("not.toMatch " + r); },
      toContain: (v: string) => { if (actual.includes(v)) fail("not.toContain " + v); },
      toBe: (v: any) => { if (actual === v) fail("not.toBe " + v); }
    }
  };
  return api;
}
const cases: Array<[string, () => Promise<void> | void]> = [];
function it(name: string, fn: () => Promise<void> | void) { cases.push([name, fn]); }
function describe(_name: string, fn: () => void) { fn(); }
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

it("README §11's hosted target carries both price members, in the member table and in both env forms", async () => {
    const readme = await readFile(new URL("../../deploy/vps/README.md", import.meta.url), "utf8");
    const section = readme.slice(readme.indexOf("## 11. Providers and vendors"));
    const memberStart = section.indexOf("| Member | Value |");
    const members = section.slice(memberStart, section.indexOf("\n\n", memberStart));
    for (const member of ["input_price_micros_per_million", "output_price_micros_per_million"]) {
      expect(members, member).toContain(member);
    }
    const examples = section.split("\n").filter((line) =>
      /"input_price_micros_per_million":\s*\d+/u.test(line));
    expect(examples, "two distinct priced env forms").toHaveLength(2);
    for (const service of ["runner", "api"]) {
      const example = examples.find((line) => line.includes(`/etc/debateai/${service}/providers/`)) ?? "";
      expect(example, `${service} input price`).toMatch(/"input_price_micros_per_million":\s*\d+/u);
      expect(example, `${service} output price`).toMatch(/"output_price_micros_per_million":\s*\d+/u);
    }
  });

it("README §11's support-chat note names the sealed-envelope refusal, not a daily cap ceiling", async () => {
    const readme = await readFile(new URL("../../deploy/vps/README.md", import.meta.url), "utf8");
    const section = readme.slice(readme.indexOf("## 11. Providers and vendors"));
    expect(section.replace(/\s+/gu, " ")).not.toMatch(/the daily call cap is the only ceiling/u);
    const paragraph = section.split(/\n[ \t]*\n/u)
      .find((block) => block.includes("SUPPORT_MODEL_COST_UNREPORTED")) ?? "";
    expect(paragraph).toContain("COST_ENVELOPES_NOT_SEALED");
  });

it("README §11 states the paid-probe cost exposure in the tree's own numbers", async () => {
    const readme = await readFile(new URL("../../deploy/vps/README.md", import.meta.url), "utf8");
    const section = readme.slice(readme.indexOf("## 11. Providers and vendors"));
    expect(section.match(/max_tokens/gu) ?? [], "max_tokens appears once in §11").toHaveLength(1);
    const paragraph = section.split(/\n[ \t]*\n/u).find((block) => block.includes("max_tokens")) ?? "";
    for (const token of ["probe_freshness_ms", "panelDiscoveryPolicy"]) expect(paragraph, token).toContain(token);
    expect(paragraph, "the seed's 600000").toMatch(/\b600_?000\b/u);
    const withoutSpecPhrase = paragraph.replace(/no recommended value/giu, "");
    for (const word of [/\brecommend\w*/iu, /\bsuggest\w*/iu, /\bshould be\b/iu]) {
      expect(withoutSpecPhrase, `no recommended value: ${word}`).not.toMatch(word);
    }
  });

it("README's known-stale list no longer carries the bullets §11 now answers", async () => {
    const readme = await readFile(new URL("../../deploy/vps/README.md", import.meta.url), "utf8");
    const start = readme.indexOf("## Known-stale sections");
    const stale = readme.slice(start, readme.indexOf("\n---\n", start)).replace(/\s+/gu, " ");
    for (const obsolete of [
      "§11's hosted provider target example",
      "§11's refusal-code table is incomplete",
      "the daily call cap is the only ceiling"
    ]) expect(stale, obsolete).not.toContain(obsolete);
    for (const survivor of ["KEK rotation is not implemented", "deploy/vps/env/api.env.example"]) {
      expect(stale, survivor).toContain(survivor);
    }
  });

it("README rules the provider path and no longer calls the relays dev-only", () => {
    const readme = read("deploy/vps/README.md");
    expect(readme).not.toMatch(/relays[^.]*are dev-only code/u);
    expect(readme).not.toContain("The production maker path is not defined here");
    for (const needle of [
      "DEBATEAI_DEPLOYMENT_MODE=hosted",
      "DEPLOYMENT_MODE_UNRESOLVED",
      "PROVIDER_TARGET_LOOPBACK_REFUSED",
      "PROVIDER_INLINE_CREDENTIAL_REFUSED",
      "COST_ENVELOPES_NOT_SEALED",
      "authorization_file",
      "/etc/debateai/runner/providers",
      "/etc/debateai/api/providers",
      "systemd-ask-password",
      "PROVIDER_VENDOR_NOT_VETTED",
      "buildConfiguredProviderSetDeploymentRow",
      "superseded, never edited"
    ]) expect(readme, needle).toContain(needle);
    // The vetting step V approved, named as the first step of the procedure.
    expect(readme).toMatch(/data-use and retention terms/u);
    expect(readme).toMatch(/privacy notice/u);
  });

it("names every support start-up refusal in the kit's table of hosted refusals", async () => {
    const source = await readFile(
      new URL("../../apps/api/src/support/model.ts", import.meta.url), "utf8"
    );
    const declaration = source.indexOf("export const SUPPORT_MODEL_STARTUP_REFUSAL_CODES");
    expect(declaration).toBeGreaterThan(-1);
    const codes = [...source
      .slice(declaration, source.indexOf("] as const);", declaration))
      .matchAll(/"([A-Z_]+)"/gu)].map((match) => match[1]!);
    expect(codes).toEqual([...codes]);
    const kit = await readFile(
      new URL("../../deploy/vps/README.md", import.meta.url), "utf8"
    );
    const section = kit.slice(kit.indexOf("## 11. Providers and vendors"));
    expect(section).not.toBe("");
    for (const code of codes) expect(section, code).toContain(code);
  });
for (const [name, fn] of cases) {
  try { await fn(); console.log("PASS " + name); } catch (e) { console.log("FAIL " + name + " :: " + (e as Error).message); }
}
