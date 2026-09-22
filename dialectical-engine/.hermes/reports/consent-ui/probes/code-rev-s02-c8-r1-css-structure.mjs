// CODE-REV-S02-C8 r1 probe: an INDEPENDENT css structural analysis of the S02 block.
// Written from the PLAN's properties, not from the author's test. Lane + optional S01 css from argv.
//   node css-structure.mjs <lane-root> [s01-globals.css]
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const lane = process.argv[2];
if (!lane) { console.error("usage: node css-structure.mjs <lane-root> [s01-globals.css]"); process.exit(2); }
const css = readFileSync(resolve(lane, "apps/ui/app/globals.css"), "utf8");

const OPEN = "/* === consent-ui S02 === */";
const CLOSE = "/* === end consent-ui S02 === */";

function sliceBlock(text, open, close) {
  const o = text.indexOf(open), c = text.indexOf(close);
  if (o === -1 || c === -1 || c < o) return null;
  return text.slice(o + open.length, c);
}
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "");

// A tokenizer independent of the author's: it tracks nesting and records (atRule, selector, body).
function rules(text, at = null, out = []) {
  let start = 0, preludeEnd = -1, depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "{") { if (depth === 0) preludeEnd = i; depth += 1; }
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        const prelude = text.slice(start, preludeEnd).trim().replace(/\s+/g, " ");
        const body = text.slice(preludeEnd + 1, i);
        if (/^@(media|supports|layer|container)\b/i.test(prelude)) rules(body, prelude, out);
        else out.push({ at, selector: prelude, body });
        start = i + 1;
      }
    }
  }
  return out;
}
const decls = (body) =>
  body.split(";").map((p) => p.trim()).filter((p) => p.includes(":"))
      .map((p) => ({ prop: p.slice(0, p.indexOf(":")).trim(), value: p.slice(p.indexOf(":") + 1).trim().replace(/\s+/g, " ") }));

const block = sliceBlock(css, OPEN, CLOSE);
if (block === null) throw new Error("S02 block not delimited");
const R = rules(strip(block));

console.log(`== rules parsed in the S02 block: ${R.length} (top-level ${R.filter(r => r.at === null).length}, in at-rules ${R.filter(r => r.at !== null).length})`);

// 1. Each selector appears at most once as a top-level rule (the author's D1 class).
const counts = new Map();
for (const r of R.filter((x) => x.at === null)) counts.set(r.selector, (counts.get(r.selector) ?? 0) + 1);
const dupes = [...counts].filter(([, n]) => n > 1);
console.log(`\n== S02-S61 duplicate top-level selectors: ${dupes.length ? JSON.stringify(dupes) : "(none)"}`);

// 2. Reduced-motion coverage, computed the other way round from the author's test.
const animated = R.filter((r) => r.at === null && decls(r.body).some((d) => d.prop === "animation"))
                  .flatMap((r) => r.selector.split(",").map((s) => s.trim()));
const rmRules = R.filter((r) => r.at !== null && /prefers-reduced-motion:\s*reduce/.test(r.at));
const neutralised = rmRules
  .filter((r) => decls(r.body).some((d) => d.prop === "animation" && d.value === "none"))
  .flatMap((r) => r.selector.split(",").map((s) => s.trim()));
console.log(`== S02-S63 animated selectors  : ${JSON.stringify(animated)}`);
console.log(`== S02-S63 neutralised selectors: ${JSON.stringify(neutralised)}`);
console.log(`== S02-S63 UNCOVERED           : ${JSON.stringify(animated.filter((s) => !neutralised.includes(s)))}`);
// transition: is a second motion channel; report it so a silent gap is visible.
const transitioned = R.filter((r) => r.at === null && decls(r.body).some((d) => d.prop === "transition"))
                      .flatMap((r) => r.selector.split(",").map((s) => s.trim()));
console.log(`== S02-S63 selectors with \`transition:\` (not covered by the rule): ${JSON.stringify(transitioned)}`);

// 3. Selector + class-token overlap with the S01 block, for the C9 merge.
if (process.argv[3]) {
  const s01css = readFileSync(process.argv[3], "utf8");
  const s01block = sliceBlock(s01css, "/* === consent-ui S01 === */", "/* === end consent-ui S01 === */");
  if (s01block === null) {
    console.log("\n== S01 block: NOT FOUND with the `consent-ui S01` markers — listing candidate markers:");
    for (const m of s01css.match(/\/\* === [^*]*=== \*\//g) ?? []) console.log(`   ${m}`);
  } else {
    const S = rules(strip(s01block));
    const sel = (rs) => new Set(rs.filter((r) => r.at === null).map((r) => r.selector));
    const cls = (rs) => new Set(rs.flatMap((r) => [...r.selector.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].map((m) => m[1])));
    const s01Sel = sel(S), s02Sel = sel(R), s01Cls = cls(S), s02Cls = cls(R);
    const inter = (a, b) => [...a].filter((x) => b.has(x)).sort();
    console.log(`\n== S01 block: ${s01block.split("\n").length} lines, ${S.length} rules, ${s01Cls.size} class tokens`);
    console.log(`== S02 block: ${block.split("\n").length} lines, ${R.length} rules, ${s02Cls.size} class tokens`);
    console.log(`== SHARED class tokens  : ${JSON.stringify(inter(s01Cls, s02Cls))}`);
    console.log(`== SHARED full selectors: ${JSON.stringify(inter(s01Sel, s02Sel))}`);
    const s01Keys = new Set(S.filter(r => r.at === null).map(r => r.selector));
    console.log(`== S01 class tokens: ${[...s01Cls].sort().join(" ")}`);
    void s01Keys;
    // Do the two blocks declare the same @keyframes names?
    const kf = (t) => new Set([...strip(t).matchAll(/@keyframes\s+([A-Za-z0-9_-]+)/g)].map((m) => m[1]));
    console.log(`== SHARED @keyframes names: ${JSON.stringify(inter(kf(s01block), kf(block)))}`);
    console.log(`== S01 @keyframes: ${[...kf(s01block)].join(",") || "(none)"}   S02 @keyframes: ${[...kf(block)].join(",") || "(none)"}`);
  }
}
