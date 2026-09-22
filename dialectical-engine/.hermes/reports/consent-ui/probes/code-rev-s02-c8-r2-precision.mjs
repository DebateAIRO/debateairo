// CODE-REV-S02-C8-r2 — does the round-2 refactor of S02-S64's PINNED assertion weaken it?
// BEFORE: filter on the exact float ratio, then format.   ratio < 4.5
// AFTER : format with toFixed(2), parse the string, then filter.  parseFloat(r.toFixed(2)) < 4.5
// A true ratio in [4.495, 4.5) formats to "4.50" and escapes the filter. Is such a ratio REACHABLE
// from a declared alpha? Sweep every alpha the stylesheet could declare and enumerate the reachable
// ratios (composite() rounds each channel, so the ratio is a step function of alpha).
import { readFileSync } from "node:fs";
const lane = process.argv[2];
const css = readFileSync(`${lane}/apps/ui/app/globals.css`, "utf8");
const tok = (blockSel, name) => {
  const b = css.slice(css.indexOf(blockSel + " {"));
  const m = b.slice(0, b.indexOf("}")).match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  return m[1].trim();
};
const chans = (hex) => [1, 3, 5].map((o) => Number.parseInt(hex.slice(o, o + 2), 16));
const composite = (fg, bg, a) => {
  const f = chans(fg), b = chans(bg);
  return `#${f.map((v, i) => Math.round(a * v + (1 - a) * b[i]).toString(16).padStart(2, "0")).join("")}`;
};
const lum = (hex) => {
  const [r, g, b] = chans(hex).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
for (const [mode, sel] of [["Terracotta", ":root"], ["Chamber", 'html[data-mode="chamber"]']]) {
  const ground = tok(sel, "--shell"), face = tok(sel, "--ink"), label = tok(sel, "--bg");
  const hits = [];
  const seen = new Set();
  for (let i = 1; i <= 100000; i += 1) {
    const a = i / 100000;
    const r = ratio(composite(label, ground, a), composite(face, ground, a));
    const key = r.toFixed(9);
    if (seen.has(key)) continue;
    seen.add(key);
    if (r >= 4.495 && r < 4.5) hits.push([a, r]);
  }
  console.log(`${mode}: distinct reachable ratios over alpha in (0,1] = ${seen.size}`);
  console.log(`   ratios in the BLIND WINDOW [4.495, 4.5) — true FAIL, but toFixed(2) -> "4.50" -> not flagged:`);
  if (hits.length === 0) console.log("      (none reachable)");
  else for (const [a, r] of hits.slice(0, 6)) console.log(`      alpha ~ ${a.toFixed(5)}  true ratio ${r.toFixed(6)}  formats "${r.toFixed(2)}"`);
  // widest alpha interval landing in the window
  if (hits.length) {
    const as = hits.map(([a]) => a);
    console.log(`      alpha range covered: ${Math.min(...as).toFixed(5)} .. ${Math.max(...as).toFixed(5)}  (${hits.length} distinct ratios)`);
  }
}

// ---- Does the weakening ever flip the ASSERTION's outcome? Exhaustive over alpha in (0,1].
{
  const modes = [["Terracotta", ":root"], ["Chamber", 'html[data-mode="chamber"]']].map(([m, s]) => ({
    m, ground: tok(s, "--shell"), face: tok(s, "--ink"), label: tok(s, "--bg")
  }));
  let flips = 0, firstFlip = null, arrayDiff = 0, firstArrayDiff = null;
  for (let i = 1; i <= 200000; i += 1) {
    const a = i / 200000;
    const before = [], after = [];
    for (const { m, ground, face, label } of modes) {
      const r = ratio(composite(label, ground, a), composite(face, ground, a));
      if (r < 4.5) before.push(m);
      if (Number.parseFloat(r.toFixed(2)) < 4.5) after.push(m);
    }
    if (before.join() !== after.join()) { arrayDiff += 1; if (!firstArrayDiff) firstArrayDiff = [a, before.join("+") || "[]", after.join("+") || "[]"]; }
    if (before.length > 0 && after.length === 0) { flips += 1; if (!firstFlip) firstFlip = a; }
  }
  console.log(`\nEXHAUSTIVE alpha sweep (200k steps):`);
  console.log(`  alphas where the REPORTED ARRAY differs (before vs after refactor): ${arrayDiff}` + (firstArrayDiff ? `  e.g. alpha ${firstArrayDiff[0].toFixed(5)} before=[${firstArrayDiff[1]}] after=[${firstArrayDiff[2]}]` : ""));
  console.log(`  alphas where the ASSERTION FLIPS fail->pass (before non-empty, after empty): ${flips}` + (firstFlip ? ` first at ${firstFlip}` : " — NONE"));
}
