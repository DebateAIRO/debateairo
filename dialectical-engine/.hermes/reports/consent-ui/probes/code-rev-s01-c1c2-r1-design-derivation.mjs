// REVIEWER PROBE (CODE-REV-S01-C1C2 r1) — re-derive the four mode-bearing token
// values and the twelve category strings from the DESIGN, by executing the
// design's own tint()/mkCat() definitions, then diff against what shipped.
// Nothing here is copied from the author's test.
import { readFileSync } from "node:fs";

const DESIGN = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/consent-ui/design/design-data.js";
const CSS = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s01-c1c2/dialectical-engine/apps/ui/app/globals.css";
const MOD = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s01-c1c2/dialectical-engine/apps/ui/lib/consent.ts";

const src = readFileSync(DESIGN, "utf8");
// Execute the design's own definitions for a given mode. `dark` is the free
// variable the extract closes over.
function designFor(dark) {
  const body = src
    .replace(/^NOT FOUND:.*$/gm, "")
    .replace(/^\/\/.*$/gm, "");
  const fn = new Function("dark", body + "\n; return { tA, tint, okC, cookieCats };");
  return fn(dark);
}
const light = designFor(false);
const darkD = designFor(true);

// ---- 1. the four mode-bearing tokens, from mkCat's own tint() calls ----
// mkCat: tagBg = tint(tagC, dark?.14:.1) ; tagBorder = tint(tagC, dark?.5:.4)
//        trackBg(on,locked) = tint(okC, dark?.35:.28) ; trackBorder = tint(okC,.55)
const derived = {
  "--ok-soft":      [light.tint(light.okC, .28),        darkD.tint(darkD.okC, .35)],
  "--ok-edge":      [light.tint(light.okC, .55),        darkD.tint(darkD.okC, .55)],
  "--muted-bg":     [light.tint(light.tA.mute, .1),     darkD.tint(darkD.tA.mute, .14)],
  "--muted-border": [light.tint(light.tA.mute, .4),     darkD.tint(darkD.tA.mute, .5)]
};
// cross-check: read the same values straight off the design's category records
const analyticsLight = light.cookieCats[2], analyticsDark = darkD.cookieCats[2];
const essentialLight = light.cookieCats[0], essentialDark = darkD.cookieCats[0];
const fromRecords = {
  "--muted-bg":     [analyticsLight.tagBg, analyticsDark.tagBg],
  "--muted-border": [analyticsLight.tagBorder, analyticsDark.tagBorder],
  "--ok-soft":      [essentialLight.trackBg, essentialDark.trackBg],
  "--ok-edge":      [essentialLight.trackBorder, essentialDark.trackBorder]
};

// ---- what shipped, read out of globals.css by block ----
const cssLines = readFileSync(CSS, "utf8").split("\n");
const rootStart = cssLines.findIndex((l) => /^:root\s*\{/.test(l));
const rootEnd = cssLines.findIndex((l, i) => i > rootStart && /^\}/.test(l));
const chStart = cssLines.findIndex((l) => /^html\[data-mode="chamber"\]\s*\{/.test(l));
const chEnd = cssLines.findIndex((l, i) => i > chStart && /^\}/.test(l));
function declared(from, to) {
  const map = new Map();
  for (const line of cssLines.slice(from, to)) {
    for (const m of line.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map.set(m[1], m[2].trim());
  }
  return map;
}
const rootDecl = declared(rootStart, rootEnd);
const chDecl = declared(chStart, chEnd);
console.log(`:root block lines ${rootStart + 1}-${rootEnd + 1}, chamber ${chStart + 1}-${chEnd + 1}`);
console.log("\n=== 1. MODE-BEARING TOKENS: design derivation vs shipped CSS ===");
let bad = 0;
for (const [tok, [l, d]] of Object.entries(derived)) {
  const [rl, rd] = fromRecords[tok];
  const sl = rootDecl.get(tok), sd = chDecl.get(tok);
  const ok = sl === l && sd === d && rl === l && rd === d;
  if (!ok) bad++;
  console.log(`${ok ? "MATCH" : "DRIFT"}  ${tok}`);
  console.log(`        design tint()   T=${l}   C=${d}`);
  console.log(`        design record   T=${rl}   C=${rd}`);
  console.log(`        shipped css     T=${sl}   C=${sd}`);
}
console.log("\n=== 2. MODE-INDEPENDENT TOKENS shipped in :root ===");
for (const t of ["--scrim","--z-consent-bar","--z-consent-scrim","--z-consent-card","--z-policy-scrim","--z-policy-card"]) {
  console.log(`  ${t} = ${rootDecl.get(t)}   (also in chamber? ${chDecl.has(t)})`);
}

// ---- 3. the twelve category strings, decoded from the design ----
console.log("\n=== 3. TWELVE CATEGORY STRINGS: design (decoded) vs shipped module ===");
const mod = readFileSync(MOD, "utf8");
const designCats = light.cookieCats.map((c, i) => ({
  name: c.name, tag: c.tag, description: c.desc, detail: c.detail,
  locked: c.cursor === "not-allowed",
  defaultOn: [true, true, false][i]
}));
for (const [i, c] of designCats.entries()) {
  for (const [field, value] of Object.entries({ name: c.name, tag: c.tag, description: c.description, detail: c.detail })) {
    const present = mod.includes(JSON.stringify(value).slice(1, -1)) || mod.includes(value);
    if (!present) bad++;
    console.log(`${present ? "PRESENT " : "MISSING "} cat${i}.${field}  codepoints:[${[...value].filter(ch=>ch.codePointAt(0)>127).map(ch=>"U+"+ch.codePointAt(0).toString(16).toUpperCase().padStart(4,"0")).join(",")||"ascii"}]`);
    if (!present) console.log("        design: " + JSON.stringify(value));
  }
}
console.log("\n=== 4. design on/locked flags vs shipped locked/defaultOn ===");
for (const [i, c] of designCats.entries())
  console.log(`  cat${i} ${c.name}: design locked=${c.locked} defaultOn=${c.defaultOn}`);
console.log("\n=== 5. any literal \\uXXXX escape shipped to a reader? ===");
const escapes = [...mod.matchAll(/\\\\u[0-9a-fA-F]{4}/g)].length;
console.log(`  literal six-char escapes in consent.ts: ${escapes}`);
console.log(`\nDRIFTS: ${bad}`);
