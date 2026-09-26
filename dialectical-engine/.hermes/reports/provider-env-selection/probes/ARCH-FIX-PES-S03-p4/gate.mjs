// ARCH-FIX-PES-S03-p4 · the gate for cluster S03-C3, measured on the PLAN'S OWN text.
// Reads PLAN (env PLAN, default the live slices/S03/PLAN.md): C3's ```ts cases and the ```text blocks
// of C3-4, C3-5 and C3-6. Builds every step's README state from the LANE's README at ec66d5e7c,
// runs the extracted cases on each state and on each mutant under a minimal vitest shim (Node 26
// type stripping), and runs the regressions (C1-1, C2's four cases, baseline's README case, v30's
// support-code case, C1-2's shell counts) on the final states. Writes only under this probe dir.
// SELFTEST=1 plants one false expectation and must report exactly one BAD.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const MAIN = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/";
const PROBE = MAIN + ".hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S03-p4/";
const LANE = MAIN + ".worktrees/pes-s03/dialectical-engine/";
const PLAN_PATH = process.env.PLAN ?? MAIN + "docs/missions/provider-env-selection/slices/S03/PLAN.md";
const plan = readFileSync(PLAN_PATH, "utf8");
const readme0 = readFileSync(LANE + "deploy/vps/README.md", "utf8");
const STATES = PROBE + "states/";
mkdirSync(STATES, { recursive: true });

function fences(marker, fence, until) {
  const at = plan.indexOf(marker);
  if (at < 0) throw new Error("marker not found: " + marker);
  const end = until ? plan.indexOf(until, at + marker.length) : plan.length;
  const out = [];
  let from = at;
  for (;;) {
    const open = plan.indexOf("\n" + fence + "\n", from);
    if (open < 0 || open > end) break;
    const close = plan.indexOf("\n```\n", open + 1);
    out.push(plan.slice(open + fence.length + 2, close));
    from = close + 4;
  }
  return out;
}
const [cases] = fences("#### Cluster S03-C3", "```ts", "**C3-1 ·");
const [noteOld, noteNew] = fences("**C3-4 ·", "```text", "**C3-5 ·").map((t) => t.trim());
const [rowNew] = fences("**C3-5 ·", "```text", "**C3-6 ·").map((t) => t.trim());
const [bulletOld, bulletNew] = fences("**C3-6 ·", "```text", "**C3-7 ·").map((t) => t.trim());
for (const [k, v] of Object.entries({ cases, noteOld, noteNew, rowNew, bulletOld, bulletNew })) {
  if (!v) throw new Error("PLAN block missing: " + k);
}

const flex = (text) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replace(/ /gu, "\\s+"), "u");
function replaceFlex(text, old, neu, label) {
  const re = flex(old);
  if (!re.test(text)) throw new Error("state build: old text not found for " + label);
  return text.replace(re, () => neu);
}
function wrap(s, width, indent = "") {
  const out = [];
  let line = "";
  for (const w of s.split(" ")) {
    if (line && (line + " " + w).length > width) { out.push(line); line = indent + w; } else line = line ? line + " " + w : w;
  }
  out.push(line);
  return out.join("\n");
}
const ROW_START = "| `COST_ENVELOPES_NOT_SEALED` |";
const setRow = (text, row) => text.split("\n").map((l) => (l.startsWith(ROW_START) ? row : l)).join("\n");
const NOTE_HEAD = "**What the support chat cannot tell you yet.**";
function rewrapNote(text) {
  const at = text.indexOf(NOTE_HEAD);
  const end = text.indexOf("\n\n", at);
  return text.slice(0, at) + wrap(text.slice(at, end).replace(/\s+/gu, " "), 100) + text.slice(end);
}

const S = {};
S.S0 = readme0;
S.S1 = replaceFlex(S.S0, noteOld, noteNew, "C3-4");
S.S2 = setRow(S.S1, rowNew);
S.S3 = replaceFlex(S.S2, bulletOld, bulletNew, "C3-6");
S.S3w = rewrapNote(replaceFlex(S.S2, bulletOld, wrap(bulletNew, 98, "  "), "C3-6 wrapped"));
// mutants — each re-introduces one defect the cluster exists to close
const live = noteNew.slice(0, noteNew.indexOf(" `COST_ENVELOPES_NOT_SEALED` is"));
const integrity = noteNew.slice(live.length + 1);
S.M_keepold = replaceFlex(S.S3, noteNew, noteOld + " " + noteNew, "keepold");
S.M_noLive = replaceFlex(S.S3, noteNew, integrity, "noLive");
S.M_noIntegrity = replaceFlex(S.S3, noteNew, live + " `COST_ENVELOPES_NOT_SEALED` is a check on the build.", "noIntegrity");
S.M_rowOld = setRow(S.S3, readme0.split("\n").find((l) => l.startsWith(ROW_START)));
S.M_rowDropped = S.S3.split("\n").filter((l) => !l.startsWith(ROW_START)).join("\n");
S.M_rowTail = setRow(S.S3, rowNew.replace(/ \|$/u, " A hosted runner refuses to claim work until they are. |"));
S.M_rowTwice = S.S3.replace(rowNew, rowNew + "\n" + rowNew);
S.M_rowOutside = S.M_rowDropped.replace("### The credential-file contract", rowNew + "\n\n### The credential-file contract".replace(/^/u, "")).replace(rowNew + "\n\n### The credential-file contract", "### The credential-file contract\n\n" + rowNew);
S.M_rowAbove = (() => {
  const lines = S.S3.split("\n");
  const r = lines.findIndex((l) => l.startsWith(ROW_START));
  const u = lines.findIndex((l) => l.startsWith("| `COST_ENVELOPE_POLICY_UNRESOLVED` |"));
  const [unresolved] = lines.splice(u, 1);
  lines.splice(r, 0, unresolved);
  return lines.join("\n");
})();
S.M_staleElsewhere = S.S3.replace("## 11. Providers and vendors", "Envelopes are not published yet.\n\n## 11. Providers and vendors");
S.M_bulletKeeps = replaceFlex(S.S3, bulletNew, bulletNew.replace(/\.$/u, ", or `COST_ENVELOPES_NOT_SEALED`."), "bulletKeeps");
S.M_bulletGone = (() => {
  const start = S.S3.indexOf("- **The production maker path is now ruled");
  return S.S3.slice(0, start) + S.S3.slice(S.S3.indexOf("\n- ", start + 1) + 1);
})();
S.M_bulletOld = S.S2; // C3-6 not done
S.M_thirdMention = S.S3.replace("## Known-stale sections — refreshed by Task 14\n", "## Known-stale sections — refreshed by Task 14\n\n- `COST_ENVELOPES_NOT_SEALED` is a build check.\n");
S.M_swap = (() => {
  const noteLess = replaceFlex(S.S3, noteNew, live + " The build-integrity check is described in the table.", "swap");
  return noteLess.replace("## Known-stale sections — refreshed by Task 14\n", "## Known-stale sections — refreshed by Task 14\n\nSee `COST_ENVELOPES_NOT_SEALED`.\n");
})();
S.M_angle = setRow(S.S3, rowNew.replace("the two rows below", "the <two> rows below"));
for (const [k, v] of Object.entries(S)) writeFileSync(STATES + k + ".md", v);

const SHIM = `
import { readFile as fsReadFile } from "node:fs/promises";
import { readFileSync as fsReadFileSync } from "node:fs";
const README_PATH = process.env.README_PATH as string;
const LANE = ${JSON.stringify(LANE)};
function mapPath(p: string): string {
  if (/deploy\\/vps\\/README\\.md$/u.test(p)) return README_PATH;
  const m = /(?:^|\\/)((?:packages|apps|deploy)\\/.*)$/u.exec(p);
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
`;
const RUNNER = `
for (const [name, fn] of cases) {
  try { await fn(); console.log("PASS " + name); } catch (e) { console.log("FAIL " + name + " :: " + (e as Error).message); }
}
`;
const GEN = PROBE + "gen-c3.ts";
writeFileSync(GEN, SHIM + cases + RUNNER);

// regressions: the lane's own C1-1, C2 cases, baseline README case and v30 support-code case
function extractIt(file, title) {
  const src = readFileSync(LANE + file, "utf8");
  const at = src.indexOf(`it("${title}`);
  if (at < 0) throw new Error("regression case not found: " + title);
  const end = src.indexOf("\n  });\n", at);
  return src.slice(at, end + "\n  });".length);
}
const V9 = "tests/unit/v9-provider-credential-files.test.ts";
const regressions = [
  extractIt(V9, "names every start-up refusal the price and cost-envelope surfaces can raise"),
  extractIt(V9, "README §11's hosted target carries both price members"),
  extractIt(V9, "README §11's support-chat note names the sealed-envelope refusal"),
  extractIt(V9, "README §11 states the paid-probe cost exposure"),
  extractIt(V9, "README's known-stale list no longer carries the bullets"),
  extractIt("tests/architecture/vps-deployment-baseline.test.ts", "README rules the provider path and no longer calls the relays dev-only"),
  extractIt("tests/unit/v30-support-provider.test.ts", "names every support start-up refusal in the kit's table of hosted refusals")
].join("\n\n");
const GEN_REG = PROBE + "gen-regressions.ts";
writeFileSync(GEN_REG, SHIM + regressions.replace(/SUPPORT_MODEL_STARTUP_REFUSAL_CODES\]/gu, "codes]") + RUNNER);

function run(state, gen = GEN) {
  const r = spawnSync(process.execPath, [gen], { env: { ...process.env, README_PATH: STATES + state + ".md" }, encoding: "utf8" });
  const lines = (r.stdout + r.stderr).trim().split("\n").filter((l) => /^(PASS|FAIL) /u.test(l));
  if (lines.length === 0) return { pass: 0, fail: -1, first: "BROKEN " + (r.stdout + r.stderr).slice(0, 400) };
  const fails = lines.filter((l) => l.startsWith("FAIL"));
  return { pass: lines.length - fails.length, fail: fails.length, lines, first: fails[0]?.replace(/^FAIL .*? :: /u, "") ?? "PASS" };
}
function sh(state, cmd) {
  return spawnSync("/bin/zsh", ["-c", cmd.replaceAll("deploy/vps/README.md", STATES + state + ".md")], { encoding: "utf8" }).stdout.trim();
}

let bad = 0;
const check = (label, got, want) => {
  const ok = got === want;
  if (!ok) bad += 1;
  console.log(`${ok ? "ok  " : "BAD "} ${label.padEnd(70)} got=${got}   want=${want}`);
};
console.log(`plan: ${PLAN_PATH}\nlane README: ${LANE}deploy/vps/README.md (${readme0.split("\n").length} lines)\n`);

console.log("## C3's three cases on each step's README state (pair = C2's 28 passing + C3's cases)");
const steps = [
  ["S0 START ec66d5e7c (C3-1..C3-3 written)", "S0", "28/3", "the overruled sentence is gone (C3-4)"],
  ["S1 after C3-4 (note)", "S1", "29/2", "the row, EXACT, once, in the table (C3-5)"],
  ["S2 after C3-5 (row)", "S2", "30/1", "the bullet names these two codes and no other (C3-6)"],
  ["S3 after C3-6 (bullet)", "S3", "31/0", "PASS"],
  ["S3w after C3-6, note and bullet hard-wrapped", "S3w", "31/0", "PASS"]
];
for (const [label, state, pair, first] of steps) {
  const r = run(state);
  check(label + " · pair", `${28 + r.pass}/${r.fail}`, pair);
  check(label + " · first failing message", r.first, first);
}
console.log("\n## S0 per case — each of the three is RED at START, with its own message");
const s0 = run("S0").lines.map((l) => l.replace(/^FAIL (.*?) :: /u, "$1 :: ").slice(0, 60) + " …" + l.split(" :: ")[1]);
check("S0 case 1", run("S0").lines[0].split(" :: ")[1], "the overruled sentence is gone (C3-4)");
check("S0 case 2", run("S0").lines[1].split(" :: ")[1], "the row, EXACT, once, in the table (C3-5)");
check("S0 case 3", run("S0").lines[2].split(" :: ")[1], "the bullet names these two codes and no other (C3-6)");

console.log("\n## mutants — each must FAIL the cases with the message that names its defect");
const mutants = [
  ["M_keepold overruled sentence kept beside the new two", "the overruled sentence is gone (C3-4)"],
  ["M_noLive R3.4's first part missing", "R3.4 first part, EXACT (C3-4)"],
  ["M_noIntegrity R3.4's second part worded otherwise", "R3.4 second part, EXACT (C3-4)"],
  ["M_rowOld the row's old Meaning text", "the row, EXACT, once, in the table (C3-5)"],
  ["M_rowDropped the row removed (V-14 misread as drop)", "the row, EXACT, once, in the table (C3-5)"],
  ["M_rowTail the old second sentence appended to the new row", "the row, EXACT, once, in the table (C3-5)"],
  ["M_rowTwice the row duplicated", "the row, EXACT, once, in the table (C3-5)"],
  ["M_rowOutside the row moved below the refusal span", "the row, EXACT, once, in the table (C3-5)"],
  ["M_rowAbove the UNRESOLVED row moved above it", `COST_ENVELOPE_POLICY_UNRESOLVED's row is one of "the two rows below"`],
  ["M_staleElsewhere 'are not published yet' re-appears above §11", `no "are not published yet" anywhere in the README`],
  ["M_bulletKeeps the bullet keeps COST_ENVELOPES_NOT_SEALED", "the bullet names these two codes and no other (C3-6)"],
  ["M_bulletGone the bullet deleted", "§10's bullet exists"],
  ["M_bulletOld C3-6 not done", "the bullet names these two codes and no other (C3-6)"],
  ["M_thirdMention a third line names the code", "exactly two README lines name COST_ENVELOPES_NOT_SEALED (R3.4b)"],
  ["M_swap note loses its mention, a line elsewhere gains one", "R3.4 second part, EXACT (C3-4)"],
  ["M_angle an angle-bracket placeholder in the row", "the row, EXACT, once, in the table (C3-5)"]
];
for (const [label, want] of mutants) {
  const r = run(label.split(" ")[0]);
  check(label + " · C3 fails", r.fail > 0 ? "FAIL" : "PASS", "FAIL");
  check(label + " · message", r.first, want);
}
console.log("\n## M_swap's count half, with the note's EXACT case taken out: the filter assertions fire");
{
  const noNote = cases.replace(/\n  it\("README §11's support-chat note[\s\S]*?\n  \}\);\n/u, "\n");
  const GEN_SWAP = PROBE + "gen-c3-no-note-case.ts";
  writeFileSync(GEN_SWAP, SHIM + noNote + RUNNER);
  check("the note case was found and removed", noNote !== cases ? "removed" : "NOT FOUND", "removed");
  check("M_swap → the other is inside the support-chat note", run("M_swap", GEN_SWAP).first, "the other is inside the support-chat note");
}
console.log("\n## M_angle also fails C1-1's own assertion (1) — the lane's case, not a copy");
check("M_angle · C1-1", run("M_angle", GEN_REG).lines[0].split(" :: ")[1] ?? "PASS", "no angle-bracket placeholder in §11's refusal table");

console.log("\n## regressions — the lane's C1-1, C2's four cases, baseline's README case, v30's support-code case");
for (const state of ["S0", "S3", "S3w"]) {
  const r = run(state, GEN_REG);
  check(`${state} · 7 regression cases`, `${r.pass}/${r.fail}`, "7/0");
}
console.log("\n## C1-2's and C3-6's literal shell commands on the final state");
const span = "sed -n '/^### What the hosted mode refuses, in code$/,/^### The credential-file contract$/p' deploy/vps/README.md";
for (const state of ["S0", "S3", "S3w"]) check(`${state} · C1-2 table lines in the refusal span`, sh(state, `${span} | /usr/bin/grep -c '^|'`), "19");
check("S0 · grep -n COST_ENVELOPES_NOT_SEALED line count", sh("S0", "/usr/bin/grep -c COST_ENVELOPES_NOT_SEALED deploy/vps/README.md"), "3");
for (const state of ["S3", "S3w"]) check(`${state} · grep -n COST_ENVELOPES_NOT_SEALED line count`, sh(state, "/usr/bin/grep -c COST_ENVELOPES_NOT_SEALED deploy/vps/README.md"), "2");

console.log("\n## the plan's copies agree: the strings the cases pin == the text blocks the steps write");
check("note: case pins R3.4 part 1 == C3-4's block, part 1", cases.includes(`"${live}"`) ? "same" : "DIFFERENT", "same");
check("note: case pins R3.4 part 2 == C3-4's block, part 2", cases.includes(`"${integrity}"`) ? "same" : "DIFFERENT", "same");
check("row: case pins == C3-5's block", cases.includes(`"${rowNew}"`) ? "same" : "DIFFERENT", "same");
const bulletSentence = bulletNew.slice(bulletNew.indexOf("Until "));
check("bullet: case pins == C3-6's block (from 'Until')", cases.includes(`"${bulletSentence}"`) ? "same" : "DIFFERENT", "same");
check("C3-4's old text is in the lane's README (whitespace-flex)", flex(noteOld).test(readme0) ? "found" : "MISSING", "found");
check("C3-6's old text is in the lane's README (whitespace-flex)", flex(bulletOld).test(readme0) ? "found" : "MISSING", "found");

if (process.env.SELFTEST === "1") {
  console.log("\n## SELFTEST: planted false expectation — the START state passes C3");
  check("SELFTEST S0 wanted PASS", run("S0").first, "PASS");
}
console.log(`\n${bad === 0 ? "GATE_OK" : "GATE_FAIL"} — ${bad} expectation(s) not met`);
process.exitCode = bad === 0 ? 0 : 1;
