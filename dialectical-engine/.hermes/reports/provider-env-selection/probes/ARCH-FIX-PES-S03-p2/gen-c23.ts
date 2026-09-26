
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
  const m = {
    toBe: (v: any) => { if (actual !== v) fail("toBe " + v + " got " + actual); },
    toBeGreaterThan: (v: number) => { if (!(actual > v)) fail("toBeGreaterThan " + v); },
    toBeGreaterThanOrEqual: (v: number) => { if (!(actual >= v)) fail("toBeGreaterThanOrEqual " + v); },
    toContain: (v: string) => { if (!String(actual).includes(v)) fail("toContain " + v); },
    toMatch: (r: RegExp) => { if (!r.test(String(actual))) fail("toMatch " + r); },
    toHaveLength: (n: number) => { if (actual.length !== n) fail("toHaveLength " + n + " got " + actual.length); },
    not: { toMatch: (r: RegExp) => { if (r.test(String(actual))) fail("not.toMatch " + r); } }
  };
  return m;
}
const cases: Array<[string, () => Promise<void>]> = [];
function it(name: string, fn: () => Promise<void>) { cases.push([name, fn]); }

it("C2-3 fragment", async () => {
  const readme = await readFile(new URL("../../deploy/vps/README.md", import.meta.url), "utf8");
  const section = readme.slice(readme.indexOf("## 11. Providers and vendors"));
expect(section.match(/max_tokens/gu) ?? [], "max_tokens appears once in §11").toHaveLength(1);
const paragraph = section.split(/\n[ \t]*\n/u).find((block) => block.includes("max_tokens")) ?? "";
for (const token of ["probe_freshness_ms", "panelDiscoveryPolicy"]) expect(paragraph, token).toContain(token);
// ARCH-REV p1 N2.1 — the seed line is `probe_freshness_ms: 600_000`; SPEC R3.6 spells it 600000. Both pass.
expect(paragraph, "the seed's 600000").toMatch(/\b600_?000\b/u);
// ARCH-REV p1 N2.2 — R3.6's own phrase is allowed; every other form of recommendation is not.
const withoutSpecPhrase = paragraph.replace(/no recommended value/giu, "");
for (const word of [/\brecommend\w*/iu, /\bsuggest\w*/iu, /\bshould be\b/iu]) {
  expect(withoutSpecPhrase, `no recommended value: ${word}`).not.toMatch(word);
}
});

for (const [, fn] of cases) {
  try { await fn(); console.log("PASS"); } catch (e) { console.log("FAIL " + (e as Error).message); }
}
