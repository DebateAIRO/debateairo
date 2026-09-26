
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
describe("S03 the kit names the cost-envelope refusal a hosted operator meets (V-11, V-14)", () => {
  const kit = () => readFile(new URL("../../deploy/vps/README.md", import.meta.url), "utf8");
  const collapse = (text: string) => text.replace(/\s+/gu, " ");
  const supportNote = (readme: string) => readme
    .slice(readme.indexOf("## 11. Providers and vendors"))
    .split(/\n[ \t]*\n/u)
    .find((block) => block.includes("SUPPORT_MODEL_COST_UNREPORTED")) ?? "";
  const ROW_START = "| `COST_ENVELOPES_NOT_SEALED` |";


  it("README §11's refusal row for COST_ENVELOPES_NOT_SEALED calls it a build-integrity check (R3.4b a)", async () => {
    const readme = await kit();
    const refusal = readme.slice(
      readme.indexOf("### What the hosted mode refuses, in code"),
      readme.indexOf("### The credential-file contract")
    ).split("\n");
    expect(refusal.filter((line) => line.startsWith(ROW_START)), "the row, EXACT, once, in the table (C3-5)").toEqual([
      "| `COST_ENVELOPES_NOT_SEALED` | a check on the integrity of the build: the envelope row this build ships was removed, emptied or made invalid. With the shipped source it is unreachable at runtime. The refusal a hosted operator meets is `COST_ENVELOPE_POLICY_UNRESOLVED` or `COST_ENVELOPE_POLICY_INVALID`, the two rows below. |"
    ]);
    const rowAt = (code: string) => refusal.findIndex((line) => line.startsWith("| `" + code + "` |"));
    for (const code of ["COST_ENVELOPE_POLICY_UNRESOLVED", "COST_ENVELOPE_POLICY_INVALID"]) {
      expect(rowAt(code), `${code}'s row is one of "the two rows below"`).toBeGreaterThan(rowAt("COST_ENVELOPES_NOT_SEALED"));
    }
    for (const stale of ["are not published yet", "refuses to claim work until they are"]) {
      expect(collapse(readme), `no "${stale}" anywhere in the README`).not.toContain(stale);
    }
  });

  it("README §10's production-maker bullet names the live refusal, and two lines name COST_ENVELOPES_NOT_SEALED (R3.4b b)", async () => {
    const readme = await kit();
    const start = readme.indexOf("- **The production maker path is now ruled");
    expect(start, "§10's bullet exists").toBeGreaterThanOrEqual(0);
    const bullet = readme.slice(start, readme.indexOf("\n- ", start + 1));
    expect([...bullet.matchAll(/`([A-Z][A-Z0-9_]{4,})`/gu)].map((match) => match[1]), "the bullet names these two codes and no other (C3-6)")
      .toEqual(["COST_ENVELOPE_POLICY_UNRESOLVED", "COST_ENVELOPE_POLICY_INVALID"]);
    expect(collapse(bullet), "R3.4b (b), EXACT (C3-6)").toContain(
      "Until V-28's cost-envelope policy is sealed at the register version a hosted deployment runs, that deployment refuses to start with `COST_ENVELOPE_POLICY_UNRESOLVED` or `COST_ENVELOPE_POLICY_INVALID`."
    );
    const mentions = readme.split("\n").filter((line) => line.includes("COST_ENVELOPES_NOT_SEALED"));
    expect(mentions, "exactly two README lines name COST_ENVELOPES_NOT_SEALED (R3.4b)").toHaveLength(2);
    expect(mentions.filter((line) => line.startsWith(ROW_START)), "one of them is the table row").toHaveLength(1);
    const noteLines = supportNote(readme).split("\n");
    expect(mentions.filter((line) => noteLines.includes(line)), "the other is inside the support-chat note").toHaveLength(1);
  });
});
for (const [name, fn] of cases) {
  try { await fn(); console.log("PASS " + name); } catch (e) { console.log("FAIL " + name + " :: " + (e as Error).message); }
}
