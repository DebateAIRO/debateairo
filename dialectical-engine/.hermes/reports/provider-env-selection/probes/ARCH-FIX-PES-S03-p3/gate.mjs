// ARCH-FIX-PES-S03-p3 · B1's gate, measured on the PLAN'S OWN code — not a re-implementation.
// From the plan file named by PLAN (default: the live slices/S03/PLAN.md) it extracts C1-1's ```ts
// case, C1-3's EXACT ```text sentence and C1-2's six conditions, builds README states from the LANE's
// unedited README (the rows a seat writes from those conditions, the sentence below the table), and
// runs the extracted case on each state under a minimal it/expect/readFile shim (Node 26 type
// stripping). MODE=rev2 reproduces the verdict on the plan as it stood; MODE=rev3 checks the revision.
// SELFTEST=1 plants one false expectation and must FAIL on exactly one.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const MAIN = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/";
const PROBE = MAIN + ".hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S03-p3/";
const LANE = MAIN + ".worktrees/pes-s03/dialectical-engine/";
const MODE = process.env.MODE ?? "rev3";
const PLAN_PATH = process.env.PLAN ?? MAIN + "docs/missions/provider-env-selection/slices/S03/PLAN.md";
const plan = readFileSync(PLAN_PATH, "utf8");
const rev2 = readFileSync(PROBE + "PLAN-at-rev2.md", "utf8");
const readme0 = readFileSync(LANE + "deploy/vps/README.md", "utf8");
const STATES = PROBE + "states-" + MODE + "/";
mkdirSync(STATES, { recursive: true });

function blockAfter(text, marker, fence) {
  const at = text.indexOf(marker);
  if (at < 0) throw new Error("step marker not found: " + marker);
  const open = text.indexOf("\n" + fence + "\n", at);
  const close = text.indexOf("\n```\n", open + 1);
  if (open < 0 || close < 0) throw new Error("fence not found after " + marker);
  return text.slice(open + fence.length + 2, close);
}
function conditions(text) {
  const at = text.indexOf("**C1-2 ·");
  const table = text.slice(at, text.indexOf("\n\n", text.indexOf("| Code cell", at)));
  return table.split("\n").filter((l) => l.startsWith("| `` `")).map((l) => {
    const cells = l.slice(2, -2).split(" | ");
    const code = cells[0].replace(/`` `([^`]+)` ``/u, "`$1`");
    return { code, condition: cells[1] };
  });
}
const c11 = blockAfter(plan, "**C1-1 ·", "```ts");
const sentence = blockAfter(plan, "**C1-3 ·", "```text").trim();
const rows = conditions(plan);
const rev2Sentence = blockAfter(rev2, "**C1-3 ·", "```text").trim();
const rev2Rows = conditions(rev2);
const reviewerTrue = /const TRUE_SENTENCE = "(.*)";/u.exec(readFileSync(MAIN + ".hermes/reports/provider-env-selection/probes/ARCH-REV-PES-S03-p2/closure.mjs", "utf8"))[1];

const MARK = "| `SUPPORT_MODEL_PATH_NOT_RATIFIED` |";
const HEAD = "### The credential-file contract";
const rowLines = (rs) => rs.map((r) => `| ${r.code} | ${r.condition}. |`);
function insertRows(text, lines) {
  const nl = text.indexOf("\n", text.indexOf(MARK));
  return text.slice(0, nl + 1) + lines.join("\n") + "\n" + text.slice(nl + 1);
}
function insertBelow(text, prose) {
  const at = text.indexOf(HEAD);
  return text.slice(0, at) + prose + "\n\n" + text.slice(at);
}
function wrap(s, width) {
  const out = [];
  let line = "";
  for (const w of s.split(" ")) {
    if (line && (line + " " + w).length > width) { out.push(line); line = w; } else line = line ? line + " " + w : w;
  }
  out.push(line);
  return out.join("\n");
}
function mutantLiteral(marker) {
  const at = plan.indexOf(marker);
  if (at < 0) return null;
  const m = /``(\| .*? \|)``/u.exec(plan.slice(at, plan.indexOf("\n- **", at + 5)));
  return m ? m[1] : null;
}

const S = {};
S.S0 = readme0;
S.S1 = insertRows(readme0, rowLines(rows));
S.S2 = insertBelow(S.S1, sentence);
S.S2w = insertBelow(S.S1, wrap(sentence, 100));
S.M_trueother = insertBelow(S.S1, reviewerTrue);
if (MODE === "rev3") {
  S.S2_rev2 = insertBelow(insertRows(readme0, rowLines(rev2Rows)), rev2Sentence);
  S.M_r2sentence = insertBelow(S.S1, rev2Sentence);
  S.M_r2cell = insertBelow(insertRows(readme0, rowLines(rows.map((r, i) => (i === 0 ? rev2Rows[0] : r)))), sentence);
  S.M_firstcode = insertBelow(S.S1, sentence.replace("never reaches", "refuses with the first code and never reaches"));
  S.M_intable = insertRows(readme0, rowLines(rows.map((r, i) => (i === 0 ? { code: r.code, condition: sentence.replace(/\.$/u, "") } : r))));
  S.M_b1b = insertRows(readme0, [mutantLiteral("**Mutant check for (1b)")]);
  S.M_angle = insertRows(readme0, [mutantLiteral("**Mutant check for (1),")]);
}
for (const [k, v] of Object.entries(S)) writeFileSync(STATES + k + ".md", v);

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
`;
const RUNNER = `
for (const [, fn] of cases) {
  try { await fn(); console.log("PASS"); } catch (e) { console.log("FAIL " + (e as Error).message); }
}
`;
const GEN = PROBE + "gen-c11-" + MODE + ".ts";
writeFileSync(GEN, SHIM + c11 + RUNNER);
// The same case with (1b) taken out, to show (3) ALONE also fails Revision 2's sentence.
const c11no1b = c11.replace(/\n  \/\/ \(1b\)[^\n]*\n  expect\([\s\S]*?\n  \);/u, "");
const GEN_NO1B = PROBE + "gen-c11-" + MODE + "-no1b.ts";
writeFileSync(GEN_NO1B, SHIM + c11no1b + RUNNER);
function run(state, gen = GEN) {
  const r = spawnSync(process.execPath, [gen], { env: { ...process.env, README_PATH: STATES + state + ".md" }, encoding: "utf8" });
  const out = (r.stdout + r.stderr).trim().split("\n").filter((l) => /^(PASS|FAIL)/u.test(l));
  return out.length === 1 ? out[0] : "BROKEN " + JSON.stringify((r.stdout + r.stderr).slice(0, 300));
}

let bad = 0;
const expectEq = (label, got, want) => {
  const ok = got === want;
  if (!ok) bad += 1;
  console.log(`${ok ? "ok  " : "BAD "} ${label.padEnd(66)} got=${got}   want=${want}`);
};
const REQ = "FAIL PROVIDER_TARGET_PRICE_REQUIRED";
const OLD3 = "FAIL guard-order sentence below the table: PROVIDER_DISCOVERY_TARGET_PRICE_INVALID";
const NEW3 = "FAIL guard-order sentence below the table, EXACT (C1-3)";
const BAN = "FAIL no 'before any hosted rule' order claim in §11's refusal span";
const ANGLE = "FAIL no angle-bracket placeholder in §11's refusal table";

console.log(`plan: ${PLAN_PATH}\nmode: ${MODE}\nC1-3 sentence: ${sentence}\nrow 1 condition: ${rows[0].condition}\nrow 6 condition: ${rows[5].condition}\n`);
if (MODE === "rev2") {
  console.log("## REPRODUCTION — C1-1's case AS WRITTEN IN REVISION 2, on the states a seat following Revision 2 produces");
  expectEq("S0 base", run("S0"), REQ);
  expectEq("S1 six rows (row 1 carries 'before any hosted rule runs'), no sentence", run("S1"), OLD3);
  expectEq("S2 + the EXACT sentence — the false text PASSES the gate (B1)", run("S2"), "PASS");
  expectEq("M_trueother — a different sentence with the tokens also PASSES", run("M_trueother"), "PASS");
} else {
  console.log("## C1-1's case AS WRITTEN IN REVISION 3");
  expectEq("S0 base → (2) as before", run("S0"), REQ);
  expectEq("S1 six rows, no sentence → (3)", run("S1"), NEW3);
  expectEq("S2 + the EXACT sentence → passes", run("S2"), "PASS");
  expectEq("S2w the EXACT sentence hard-wrapped at 100 → passes", run("S2w"), "PASS");
  expectEq("S2_rev2 the Revision 2 rows + sentence (B1's text) → (1b)", run("S2_rev2"), BAN);
  expectEq("M_r2sentence Revision 2's sentence below Revision 3's rows → (1b)", run("M_r2sentence"), BAN);
  expectEq("M_r2cell Revision 2's row-1 cell, Revision 3's sentence → (1b)", run("M_r2cell"), BAN);
  expectEq("M_trueother the reviewer's true-but-different wording → (3)", run("M_trueother"), NEW3);
  expectEq("M_firstcode 'refuses with the first code' re-added → (3)", run("M_firstcode"), NEW3);
  expectEq("M_intable the EXACT sentence as row 1's cell, nothing below → (3)", run("M_intable"), NEW3);
  expectEq("M_b1b the plan's (1b) mutant line at C1-1's boundary → (1b)", run("M_b1b"), BAN);
  expectEq("M_angle the plan's (1) mutant line at C1-1's boundary → (1)", run("M_angle"), ANGLE);
  console.log("\n## (3) alone — the same case with (1b) removed (the reviewer's PREDICTIONS check)");
  expectEq("the (1b) block was found and removed", c11no1b !== c11 && !c11no1b.includes("(1b)") ? "removed" : "NOT FOUND", "removed");
  expectEq("S2_rev2 (B1's text) → (3)", run("S2_rev2", GEN_NO1B), NEW3);
  expectEq("M_r2sentence → (3)", run("M_r2sentence", GEN_NO1B), NEW3);
  expectEq("S2 → still passes without (1b)", run("S2", GEN_NO1B), "PASS");
  console.log("\n## The plan's two copies of the sentence, and the words it asks a seat to write");
  const pinned = /toContain\(\s*"(.*)"\s*\)/u.exec(c11.slice(c11.indexOf("(3)")))?.[1];
  expectEq("the string C1-1 pins == C1-3's ```text block", pinned === sentence ? "same" : "DIFFERENT", "same");
  const ban = /\bbefore (?:any|every|all|the) hosted rules?\b/iu;
  expectEq("C1-3's sentence carries no 'before … hosted rule'", ban.test(sentence) ? "carries" : "none", "none");
  expectEq("C1-2's six conditions carry no 'before … hosted rule'", rows.some((r) => ban.test(r.condition)) ? "carries" : "none", "none");
  expectEq("C1-3's sentence carries no 'refuses with the first code'", sentence.includes("refuses with the first code") ? "carries" : "none", "none");
}
if (process.env.SELFTEST === "1") {
  console.log("\n## SELFTEST: planted false expectation — Revision 2's belief that its gate fails B1's text");
  expectEq("SELFTEST S2 wanted a FAIL", run("S2"), MODE === "rev2" ? OLD3 : REQ);
}
console.log(`\n${bad === 0 ? "GATE_OK" : "GATE_FAIL"} — ${bad} expectation(s) not met`);
process.exitCode = bad === 0 ? 0 : 1;
