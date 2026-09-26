// ARCH-FIX-PES-S03-p2 · runs the PLAN'S OWN code blocks — not a re-implementation — against every
// simulated README state. It extracts from slices/S03/PLAN.md: C1-1's ```ts case, C2-3's ```ts
// assertions, C1-3's EXACT ```text sentence and C2-6's EXACT JSON line, and checks that the
// simulator (simulate.mjs) used those exact strings. Each extracted block is written into a
// generated .ts file with a minimal `it`/`expect`/`readFile` shim (product files are read from the
// LANE, the README from a snapshot) and executed by Node 26's built-in type stripping.
// Expectations: correct states PASS, mutants FAIL with the message the plan names.
// SELFTEST=1 plants one false expectation to watch this checker fail.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const MAIN = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/";
const PROBE = MAIN + ".hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S03-p2/";
const LANE = MAIN + ".worktrees/pes-s03/dialectical-engine/";
const plan = readFileSync(MAIN + "docs/missions/provider-env-selection/slices/S03/PLAN.md", "utf8");

function blockAfter(marker, fence) {
  const at = plan.indexOf(marker);
  if (at < 0) throw new Error("step marker not found: " + marker);
  const open = plan.indexOf("\n" + fence + "\n", at);
  const close = plan.indexOf("\n```\n", open + 1);
  if (open < 0 || close < 0) throw new Error("fence not found after " + marker);
  return plan.slice(open + fence.length + 2, close);
}
const c11 = blockAfter("**C1-1 ·", "```ts");
const c23 = blockAfter("**C2-3 ·", "```ts");
const c13 = blockAfter("**C1-3 ·", "```text").trim();
const c26 = blockAfter("**C2-6 ·", "```").trim();

let bad = 0;
const expectEq = (label, got, want) => {
  const ok = want instanceof RegExp ? want.test(got) : got === want;
  if (!ok) bad += 1;
  console.log(`${ok ? "ok  " : "BAD "} ${label.padEnd(60)} got=${got}   want=${want}`);
};

// The simulator must have used the plan's EXACT strings, or its snapshots test something else.
const sim = readFileSync(PROBE + "simulate.mjs", "utf8");
expectEq("simulate.mjs uses C1-3's EXACT sentence", sim.includes(JSON.stringify(c13)) ? "yes" : "no", "yes");
expectEq("simulate.mjs uses C2-6's EXACT runner.env JSON", sim.includes("'" + c26 + "'") ? "yes" : "no", "yes");

const SHIM = `
import { readFile as fsReadFile } from "node:fs/promises";
const README_PATH = process.env.README_PATH as string;
const LANE = ${JSON.stringify(LANE)};
async function readFile(url: URL, _enc: string): Promise<string> {
  const p = url.pathname;
  if (/deploy\\/vps\\/README\\.md$/u.test(p)) return fsReadFile(README_PATH, "utf8");
  const m = /(?:^|\\/)((?:packages|apps)\\/.*)$/u.exec(p);
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
`;
const RUNNER = `
for (const [, fn] of cases) {
  try { await fn(); console.log("PASS"); } catch (e) { console.log("FAIL " + (e as Error).message); }
}
`;
// C2-3's block is a fragment over \`section\`: wrap it in a case that builds \`section\` as C1-1 does.
const C23_CASE = `
it("C2-3 fragment", async () => {
  const readme = await readFile(new URL("../../deploy/vps/README.md", import.meta.url), "utf8");
  const section = readme.slice(readme.indexOf("## 11. Providers and vendors"));
${c23}
});
`;
writeFileSync(PROBE + "gen-c11.ts", SHIM + c11 + RUNNER);
writeFileSync(PROBE + "gen-c23.ts", SHIM + C23_CASE + RUNNER);

function run(gen, snapshot) {
  const r = spawnSync(process.execPath, [PROBE + gen], {
    env: { ...process.env, README_PATH: PROBE + "snap/" + snapshot + ".md" }, encoding: "utf8"
  });
  const out = (r.stdout + r.stderr).trim().split("\n").filter((l) => /^(PASS|FAIL)/.test(l));
  return out.length === 1 ? out[0] : "BROKEN " + JSON.stringify((r.stdout + r.stderr).slice(0, 300));
}

console.log("\n## C1-1's case, AS WRITTEN IN THE PLAN, on each state");
expectEq("S0 base → fails on (2) with PROVIDER_TARGET_PRICE_REQUIRED", run("gen-c11.ts", "S0"), "FAIL PROVIDER_TARGET_PRICE_REQUIRED");
expectEq("S1 after C1-2 → fails on (3)", run("gen-c11.ts", "S1"), "FAIL guard-order sentence below the table: PROVIDER_DISCOVERY_TARGET_PRICE_INVALID");
expectEq("S2 after C1-3 → passes", run("gen-c11.ts", "S2"), "PASS");
expectEq("N4_base: <ref> row at C1-1's boundary → fails on (1)", run("gen-c11.ts", "N4_base"), "FAIL no angle-bracket placeholder in §11's refusal table");
expectEq("N4_S2: <ref> row after C1-3 → fails on (1)", run("gen-c11.ts", "N4_S2"), "FAIL no angle-bracket placeholder in §11's refusal table");
expectEq("S7 final → passes", run("gen-c11.ts", "S7"), "PASS");

console.log("\n## C2-3's assertions, AS WRITTEN IN THE PLAN, on each state");
expectEq("S5 before C2-8 → fails on the max_tokens count", run("gen-c23.ts", "S5"), "FAIL max_tokens appears once in §11");
expectEq("S6 after C2-8 → passes", run("gen-c23.ts", "S6"), "PASS");
expectEq("S7 final → passes", run("gen-c23.ts", "S7"), "PASS");

if (process.env.SELFTEST === "1") {
  console.log("\n## SELFTEST: planted false expectation — pass 1's belief that the case passes at S1");
  expectEq("SELFTEST S1 wanted PASS", run("gen-c11.ts", "S1"), "PASS");
}

console.log(`\n${bad === 0 ? "PLAN_CODE_OK" : "PLAN_CODE_FAIL"} — ${bad} expectation(s) not met`);
process.exitCode = bad === 0 ? 0 : 1;
