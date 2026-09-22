// CODE-REV-S02-C1C2 r1 probe — DECODE design-data.js and DIFF the transcription myself.
// The extract carries two `NOT FOUND: <name>` placeholder lines and depends on a free
// variable `dark`; both are neutralised here and NOTHING else in the file is touched, so the
// \uXXXX escapes are decoded by the JS engine exactly as a TypeScript module decodes them.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const DESIGN = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/consent-ui/design/design-data.js";
const LANE   = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s02-c1c2/dialectical-engine";

const raw = readFileSync(DESIGN, "utf8");
const prepared = "let dark = false;\n" + raw.replace(/^NOT FOUND: .*$/gm, "// placeholder line neutralised by the reviewer");
const ctx = vm.createContext({ console });
vm.runInContext(prepared + "\n;globalThis.__J = policyJump; globalThis.__S = policySections; globalThis.__T = tA; globalThis.__A = accentsA; globalThis.__OK = okC;", ctx, { filename: DESIGN });
const designJump = ctx.__J, designSections = ctx.__S;

const mod = readFileSync(LANE + "/apps/ui/lib/privacyPolicy.ts", "utf8");
const grab = (name) => {
  const i = mod.indexOf(`export const ${name}`);
  const open = mod.indexOf("= [", i) + 2;   // anchor on the INITIALISER, not the type annotation `readonly X[]`
  let depth = 0, j = open;
  for (; j < mod.length; j++) {
    if (mod[j] === "[") depth++;
    else if (mod[j] === "]") { depth--; if (depth === 0) { j++; break; } }
  }
  return vm.runInNewContext("(" + mod.slice(open, j) + ")");
};
const codeJump = grab("POLICY_JUMP");
const codeSections = grab("POLICY_SECTIONS");

let fail = 0;
const cmp = (label, a, b) => {
  if (a === b) return true;
  fail++;
  console.log(`  MISMATCH ${label}`);
  console.log(`    design: ${JSON.stringify(a)}`);
  console.log(`    code  : ${JSON.stringify(b)}`);
  for (let i = 0; i <= Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      console.log(`    first divergence at index ${i}: design U+${(a.codePointAt(i)??0).toString(16).padStart(4,"0")} vs code U+${(b.codePointAt(i)??0).toString(16).padStart(4,"0")}`);
      console.log(`    design ctx: ...${a.slice(Math.max(0,i-40), i+40)}...`);
      console.log(`    code   ctx: ...${b.slice(Math.max(0,i-40), i+40)}...`);
      break;
    }
  }
  return false;
};

console.log("=== PILLS (design-data.js:51, DECODED) ===");
console.log(`design length=${designJump.length}  code length=${codeJump.length}`);
if (designJump.length !== codeJump.length) { fail++; console.log("  LENGTH MISMATCH"); }
designJump.forEach((label, i) => cmp(`pill[${i}].label`, label, codeJump[i]?.label ?? "<absent>"));
console.log(`  code order === design order: ${JSON.stringify(codeJump.map(p=>p.label)) === JSON.stringify(designJump)}`);
console.log(`  code targets: ${JSON.stringify(codeJump.map(p=>p.target))}`);

console.log("\n=== SECTIONS (design-data.js:57-84, DECODED) ===");
console.log(`design length=${designSections.length}  code length=${codeSections.length}`);
if (designSections.length !== codeSections.length) { fail++; console.log("  LENGTH MISMATCH"); }
designSections.forEach((s, i) => {
  const c = codeSections[i] ?? {};
  cmp(`section[${i}].no`, s.no, c.no ?? "<absent>");
  cmp(`section[${i}].title`, s.title, c.title ?? "<absent>");
  cmp(`section[${i}].body`, s.body, c.body ?? "<absent>");
  const di = s.items ?? [], ci = c.items ?? [];
  if (di.length !== ci.length) { fail++; console.log(`  ITEM COUNT MISMATCH section ${s.no}: design ${di.length} code ${ci.length}`); }
  di.forEach((it, k) => cmp(`section[${i}].items[${k}]`, it, ci[k] ?? "<absent>"));
});

console.log("\n=== R12 ACCENT MAPPING: design raw colour -> code token name ===");
const known = { [ctx.__OK]: "okC", [ctx.__T.gold]: "tA.gold", [ctx.__A.reasoning]: "accentsA.reasoning", [ctx.__T.con]: "tA.con", [ctx.__T.ink]: "tA.ink", [ctx.__T.mute]: "tA.mute" };
const SPEC_R12 = { okC: "--ok-dot", "tA.gold": "--gold", "accentsA.reasoning": "--reasoning", "tA.con": "--con", "tA.ink": "--ink", "tA.mute": "--muted" };
designSections.forEach((s,i) => {
  const sym = known[s.c] ?? `<unknown ${s.c}>`;
  const want = SPEC_R12[sym] ?? "<?>";
  const got = codeSections[i]?.accent;
  const ok = want === got;
  if (!ok) fail++;
  console.log(`  ${s.no} ${s.title.slice(0,44).padEnd(44)} design c=${s.c} (${sym.padEnd(19)}) -> SPEC ${want.padEnd(12)} code ${String(got).padEnd(12)} ${ok ? "OK" : "*** MISMATCH ***"}`);
});

console.log("\n=== BULLET COUNTS ===");
console.log(`  design: ${JSON.stringify(designSections.map(s=>(s.items??[]).length))}`);
console.log(`  code  : ${JSON.stringify(codeSections.map(s=>s.items.length))}`);
console.log(`  code total = ${codeSections.reduce((t,s)=>t+s.items.length,0)}`);

console.log("\n=== DECODING: what the module actually ships ===");
const every = [...codeJump.flatMap(p=>[p.label,p.target]), ...codeSections.flatMap(s=>[s.no,s.title,s.accent,s.body,...s.items])];
console.log(`  strings carrying a literal six-char \\uXXXX: ${every.filter(v => /\\u[0-9A-Fa-f]{4}/.test(v)).length} (want 0)`);
const j = every.join("");
for (const [name, ch] of [["U+2014 em dash","—"],["U+2019 right quote","’"],["U+2192 arrow","→"],["U+00B7 middle dot","·"]])
  console.log(`  ${name}: ${j.split(ch).length - 1}`);
const dj = [...designJump, ...designSections.flatMap(s=>[s.no,s.title,s.body,...(s.items??[])])].join("");
for (const [name, ch] of [["U+2014 em dash","—"],["U+2019 right quote","’"],["U+2192 arrow","→"]])
  console.log(`  design (decoded) ${name}: ${dj.split(ch).length - 1}`);

console.log(`\n######## TOTAL MISMATCHES: ${fail} ########`);
process.exit(fail === 0 ? 0 : 1);
