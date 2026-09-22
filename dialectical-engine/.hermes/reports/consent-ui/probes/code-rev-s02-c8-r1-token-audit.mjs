// CODE-REV-S02-C8 r1 probe: token-reference audit of the S02 block.
// Lane comes from argv (COMMON §10.35) — never a hard-coded .worktrees path.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const lane = process.argv[2];
if (!lane) {
  console.error("usage: node token-audit.mjs <lane-root> [s01-globals.css]");
  process.exit(2);
}
const cssPath = resolve(lane, "apps/ui/app/globals.css");
const css = readFileSync(cssPath, "utf8");

const OPEN = "/* === consent-ui S02 === */";
const CLOSE = "/* === end consent-ui S02 === */";
const o = css.indexOf(OPEN);
const c = css.indexOf(CLOSE);
if (o === -1 || c === -1 || c < o) throw new Error(`block not delimited: open=${o} close=${c}`);
const blockRaw = css.slice(o + OPEN.length, c);
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "");
const block = strip(blockRaw);

// Every token REFERENCE in the block, comments stripped.
const refs = [...block.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)].map((m) => m[1]);
const refSet = [...new Set(refs)].sort();

// Every token DECLARED anywhere in this stylesheet (any block).
function declaredIn(text) {
  const set = new Set();
  for (const m of strip(text).matchAll(/(?:^|[\s;{])(--[a-zA-Z0-9-]+)\s*:/gm)) set.add(m[1]);
  return set;
}
// Declarations OUTSIDE the S02 block = what already exists here.
const outside = css.slice(0, o) + css.slice(c + CLOSE.length);
const declaredHere = declaredIn(outside);

// Declarations in the S01 lane's globals.css, if given.
let declaredS01 = new Set();
if (process.argv[3]) declaredS01 = declaredIn(readFileSync(process.argv[3], "utf8"));

console.log(`block lines: ${blockRaw.split("\n").length}`);
console.log(`distinct token references in block: ${refSet.length}`);
const rows = [];
for (const t of refSet) {
  const here = declaredHere.has(t);
  const s01 = declaredS01.has(t);
  rows.push(`${t.padEnd(20)} base=${here ? "YES" : "no "} s01lane=${s01 ? "YES" : "no "}${here || s01 ? "" : "   <<< UNDECLARED ANYWHERE"}`);
}
console.log(rows.join("\n"));
const dangling = refSet.filter((t) => !declaredHere.has(t) && !declaredS01.has(t));
console.log(`\nUNDECLARED-ANYWHERE: ${dangling.length ? dangling.join(",") : "(none)"}`);
const s01Only = refSet.filter((t) => !declaredHere.has(t) && declaredS01.has(t));
console.log(`ARRIVES-FROM-S01: ${s01Only.length ? s01Only.join(",") : "(none)"}`);

// Charge: do --muted-bg / --muted-border / --shadow-knob appear at all?
for (const t of ["--muted-bg", "--muted-border", "--shadow-knob"]) {
  console.log(`packet-named token ${t}: referenced in block = ${block.includes(t)}`);
}

// Colour-literal + token-declaration gates over the block (raw, comments included).
const lits = blockRaw.match(/oklch\(|#[0-9a-f]{3,8}\b|\brgba?\(/gi) ?? [];
const decls = blockRaw.match(/^\s*--[a-z0-9-]+\s*:/gim) ?? [];
console.log(`\nS02-S60 colour literals in block (raw incl. comments): ${lits.length} ${JSON.stringify(lits)}`);
console.log(`S02-S60 token declarations in block (raw incl. comments): ${decls.length} ${JSON.stringify(decls)}`);
