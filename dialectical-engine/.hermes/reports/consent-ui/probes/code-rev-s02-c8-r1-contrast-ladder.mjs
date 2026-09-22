// CODE-REV-S02-C8 r1 probe: INDEPENDENT recomputation of the S02-S64 contrast ladder.
// WCAG 2.x relative luminance implemented here from the spec, then cross-checked against the
// repo helper `tests/support/contrast.ts` the PLAN names. Lane from argv (COMMON §10.35).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const lane = process.argv[2];
if (!lane) { console.error("usage: node contrast-ladder.mjs <lane-root>"); process.exit(2); }
const css = readFileSync(resolve(lane, "apps/ui/app/globals.css"), "utf8");

function tokenValue(blockSelector, name) {
  const open = css.indexOf(`${blockSelector} {`);
  if (open === -1) throw new Error(`no ${blockSelector} block`);
  const end = css.indexOf("\n}", open);
  const block = css.slice(open, end);
  const m = new RegExp(`(?:^|[\\s;{])${name}:\\s*([^;]+);`).exec(block);
  if (!m) throw new Error(`${name} not declared in ${blockSelector}`);
  return m[1].trim();
}

const ch = (hex) => [1, 3, 5].map((o) => Number.parseInt(hex.slice(o, o + 2), 16));
const srgbToLin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = (rgb) => 0.2126 * srgbToLin(rgb[0]) + 0.7152 * srgbToLin(rgb[1]) + 0.0722 * srgbToLin(rgb[2]);
const ratio = (a, b) => { const la = lum(a), lb = lum(b); const [hi, lo] = la > lb ? [la, lb] : [lb, la]; return (hi + 0.05) / (lo + 0.05); };

const mixRound = (fg, bg, a) => fg.map((v, i) => Math.round(a * v + (1 - a) * bg[i]));
const mixFloat = (fg, bg, a) => fg.map((v, i) => a * v + (1 - a) * bg[i]);
// linear-light compositing (physically-correct blending, not what CSS does)
const mixLinear = (fg, bg, a) =>
  fg.map((v, i) => {
    const l = a * srgbToLin(v) + (1 - a) * srgbToLin(bg[i]);
    const s = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055;
    return s * 255;
  });

const MODES = [
  ["Terracotta", ":root"],
  ["Chamber", 'html[data-mode="chamber"]']
];

const models = {
  "A round-channel, label & face over --shell (author/test model)": (ink, bg, shell, core, page, a) =>
    ratio(mixRound(bg, shell, a), mixRound(ink, shell, a)),
  "B float-channel, label & face over --shell": (ink, bg, shell, core, page, a) =>
    ratio(mixFloat(bg, shell, a), mixFloat(ink, shell, a)),
  "C round-channel, label & face over --core": (ink, bg, shell, core, page, a) =>
    ratio(mixRound(bg, core, a), mixRound(ink, core, a)),
  "D round-channel, label & face over --bg (page)": (ink, bg, shell, core, page, a) =>
    ratio(mixRound(bg, page, a), mixRound(ink, page, a)),
  "E label over the FACE, face over --shell (no group opacity)": (ink, bg, shell, core, page, a) =>
    ratio(mixRound(bg, ink, a), mixRound(ink, shell, a)),
  "F linear-light compositing over --shell": (ink, bg, shell, core, page, a) =>
    ratio(mixLinear(bg, shell, a), mixLinear(ink, shell, a)),
  "G label over --shell at alpha, face UNDIMMED (--ink)": (ink, bg, shell, core, page, a) =>
    ratio(mixRound(bg, shell, a), ink),
  "H label UNDIMMED (--bg), face over --shell at alpha": (ink, bg, shell, core, page, a) =>
    ratio(bg, mixRound(ink, shell, a))
};

console.log("tokens read from the shipped stylesheet:");
const vals = {};
for (const [mode, sel] of MODES) {
  vals[mode] = {
    ink: tokenValue(sel, "--ink"),
    bg: tokenValue(sel, "--bg"),
    shell: tokenValue(sel, "--shell"),
    core: tokenValue(sel, "--core")
  };
  console.log(`  ${mode.padEnd(11)} --ink ${vals[mode].ink}  --bg ${vals[mode].bg}  --shell ${vals[mode].shell}  --core ${vals[mode].core}`);
}

const ALPHAS = [0.6, 0.65, 0.7];
for (const [label, fn] of Object.entries(models)) {
  const row = [];
  for (const a of ALPHAS) {
    for (const [mode] of MODES) {
      const v = vals[mode];
      const r = fn(ch(v.ink), ch(v.bg), ch(v.shell), ch(v.core), ch(v.bg), a);
      row.push(`${mode[0]}@${a.toFixed(2)}=${r.toFixed(2)}`);
    }
  }
  console.log(`${label}\n    ${row.join("  ")}`);
}

// The specific question: which model, if any, prints 5.54 for Terracotta at .70?
console.log("\nModels printing Terracotta 5.54 (±0.005) at alpha .70:");
let any = false;
for (const [label, fn] of Object.entries(models)) {
  const v = vals.Terracotta;
  const r = fn(ch(v.ink), ch(v.bg), ch(v.shell), ch(v.core), ch(v.bg), 0.7);
  if (Math.abs(r - 5.54) < 0.005) { console.log(`  ${label} -> ${r.toFixed(4)}`); any = true; }
}
if (!any) console.log("  (none)");

// And the smallest 0.05 step clearing 4.5 in BOTH modes, per model A.
console.log("\nModel A ladder in 0.05 steps (both modes), 4.5:1 gate:");
for (let a = 0.4; a <= 1.0001; a += 0.05) {
  const aa = Math.round(a * 100) / 100;
  const rs = MODES.map(([mode]) => {
    const v = vals[mode];
    return [mode, ratio(mixRound(ch(v.bg), ch(v.shell), aa), mixRound(ch(v.ink), ch(v.shell), aa))];
  });
  const pass = rs.every(([, r]) => r >= 4.5);
  console.log(`  alpha ${aa.toFixed(2)}  ${rs.map(([m, r]) => `${m} ${r.toFixed(2)}`).join("  ")}  -> ${pass ? "PASS" : "FAIL"}`);
}
