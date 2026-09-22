// CODE-REV-S02-C8 r1 probe — DESIGN FIDELITY, computed not read.
// Parses the artboard extracts' inline styles, maps the design's `{{ tA.* }}` references to the
// repo's tokens through COMMON.md §7, and diffs them property-by-property against the S02 block.
//   node design-fidelity.mjs <lane-root> <design-dir>
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const [, , lane, designDir] = process.argv;
if (!lane || !designDir) { console.error("usage: node design-fidelity.mjs <lane-root> <design-dir>"); process.exit(2); }

const css = readFileSync(resolve(lane, "apps/ui/app/globals.css"), "utf8");
const OPEN = "/* === consent-ui S02 === */", CLOSE = "/* === end consent-ui S02 === */";
const block = css.slice(css.indexOf(OPEN) + OPEN.length, css.indexOf(CLOSE));
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "");

function rules(text, at = null, out = []) {
  let start = 0, pe = -1, d = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === "{") { if (d === 0) pe = i; d += 1; }
    else if (c === "}") { d -= 1; if (d === 0) {
      const prelude = text.slice(start, pe).trim().replace(/\s+/g, " ");
      const body = text.slice(pe + 1, i);
      if (/^@(media|supports)\b/i.test(prelude)) rules(body, prelude, out); else out.push({ at, selector: prelude, body });
      start = i + 1; } }
  }
  return out;
}
const R = rules(strip(block));
function declsOf(sel) {
  const m = R.filter((r) => r.selector === sel && r.at === null);
  if (m.length !== 1) return null;
  const map = new Map();
  for (const piece of m[0].body.split(";")) {
    const t = piece.trim(); if (!t.includes(":")) continue;
    map.set(t.slice(0, t.indexOf(":")).trim(), t.slice(t.indexOf(":") + 1).trim().replace(/\s+/g, " "));
  }
  return map;
}

// COMMON.md §7 design->token map, plus the value-level equivalences the design writes literally.
const TOKEN = {
  "tA.page": "var(--bg)", "tA.shell": "var(--shell)", "tA.core": "var(--core)", "tA.ink": "var(--ink)",
  "tA.mute": "var(--muted)", "tA.hint": "var(--text-2)", "tA.hair": "var(--line)",
  "tA.hairStrong": "var(--line-strong)", "tA.gold": "var(--gold)", "okC": "var(--ok-dot)",
  "okBorder": "var(--ok-edge)", "s.c": "var(--accent)"
};
const VALUE = [
  [/^ui-monospace,Menlo,monospace$/, "var(--font-mono)"],
  [/^Fraunces,serif$/, "var(--font-display)"],
  [/^999px$/, "var(--r-pill)"],
  [/^0 0 5px 5px$/, "var(--r-tab)"],
  [/^50%$/, "var(--r-dot)"]
];
function normValue(v, prop) {
  let s = v.trim().replace(/\s*,\s*/g, ",").replace(/\s+/g, " ");
  s = s.replace(/\{\{\s*([A-Za-z.]+)\s*\}\}/g, (_, k) => TOKEN[k] ?? `{{${k}}}`);
  if (prop === "border-radius" || prop === "font-family") for (const [re, rep] of VALUE) if (re.test(s)) s = rep;
  // "1px solid {{ tA.hair }}" -> "1px solid var(--line)"; commas re-spaced for CSS var lists
  s = s.replace(/,/g, ", ").replace(/\s+/g, " ").trim();
  return s;
}
function parseStyle(attr) {
  const m = new Map();
  for (const piece of attr.split(";")) {
    const t = piece.trim(); if (!t.includes(":")) continue;
    const prop = t.slice(0, t.indexOf(":")).trim();
    m.set(prop, normValue(t.slice(t.indexOf(":") + 1), prop));
  }
  return m;
}

const html10 = readFileSync(resolve(designDir, "turn-10-cookie-consent.html"), "utf8");
const html8a = readFileSync(resolve(designDir, "turn-8a-checkbox-group.html"), "utf8");
const html10c = html10.slice(html10.indexOf('<div id="10c"'));
const styles10 = [...html10c.matchAll(/style="([^"]*)"/g)].map((m) => m[1]);
const styles8a = [...html8a.matchAll(/style="([^"]*)"/g)].map((m) => m[1]);

// Indices are offsets inside the `id="10c"` section; 0-5 are the extract's caption chrome and
// the artboard frame, 6-35 are the design itself, 36+ belongs to the next artboard.
const start10 = 0;

// Ordered pairing: artboard element index (from start10) -> block selector.
// Derived from the COMPONENT's DOM order, read at apps/ui/components/consent/PrivacyPolicyModal.tsx.
const PAIRS_10C = [
  [6, ".policyScrim", "the overlay"],
  [7, ".policyBezel", "the outer card"],
  [8, ".policyCore", "the inner core"],
  [9, ".policyTab", "the gold tab"],
  [10, ".policyHead", "the header band"],
  [11, ".policyHead", "the header flex row (merged into .policyHead)"],
  [12, ".policyHeadText", "the header text column"],
  [13, ".policyEyebrow", "the eyebrow"],
  [14, ".policyTitle", "the title"],
  [15, ".policyLede", "the lede"],
  [16, ".policyClose", "the close control"],
  [17, ".policyBody", "the scroll region"],
  [18, ".policyJumps", "the jump pill row"],
  [19, ".policyPill", "a jump pill"],
  [20, ".policySection", "a section"],
  [21, ".policySectionHead", "the section head"],
  [22, ".policyNo", "the section number"],
  [23, ".policySectionTitle", "the section title"],
  [24, ".policyText", "the section body"],
  [25, ".policyItems", "the bullet list"],
  [26, ".policyItem", "a bullet row"],
  [27, ".policyDot", "the bullet dot"],
  [28, ".policyItemText", "the bullet text"],
  [29, ".policyEnd", "the end marker"],
  [30, ".policyFoot", "the footer"],
  [31, ".policyContact", "the contact line"],
  [32, ".policyMail", "the mail address"],
  [33, ".policyFootSpacer", "the spacer"],
  [34, null, "DOWNLOAD PDF -- deliberately absent from the product (COMMON section 3 honesty law); no class in the 29"],
  [35, ".policyPrimary", "the primary button"]
];
const PAIRS_8A = [
  [0, ".consentGroup", "the group container"],
  [1, ".consentRow", "row 1 (carries the hairline)"],
  [2, ".consentBox", "the square, drawn CHECKED on the artboard"],
  [3, ".consentText", "the row-1 label"],
  [4, ".consentRow", "row 2 (no hairline)"],
  [5, ".consentBox", "the square, drawn CHECKED"],
  [6, ".consentText", "the row-2 label"],
  [7, ".consentPolicyLink", "the Privacy Policy control"]
];

// Properties the design writes that the product deliberately does not (artboard-frame only, or
// realised by a different mechanism); each is REPORTED, never silently skipped.
const EXPECTED_ABSENT = {
  ".policyScrim": ["position"],        // artboard `absolute` -> product `fixed`
  ".policyBezel": ["left", "right", "top", "bottom", "box-shadow", "border-radius"],
  ".policyCore": ["height", "box-sizing"],
  ".consentBox": ["background", "margin-top", "font-size", "font-weight", "color"], // checked-state + ::after
  ".consentRow": ["border-bottom"]      // first-row-only rule
};

let mismatches = 0, checked = 0;
function compare(label, designStyle, selector, note) {
  if (selector === null) { console.log(`\n-- ${label} ${note}`); return; }
  const want = parseStyle(designStyle);
  const got = declsOf(selector);
  console.log(`\n-- ${label} ${selector}  (${note})`);
  if (got === null) { console.log(`   !! no single rule for ${selector} in the block`); mismatches += 1; return; }
  for (const [prop, value] of want) {
    const have = got.get(prop);
    checked += 1;
    if (have === value) console.log(`   OK      ${prop}: ${value}`);
    else if (have === undefined) {
      const ok = (EXPECTED_ABSENT[selector] ?? []).includes(prop);
      console.log(`   ${ok ? "ABSENT-BY-DESIGN" : "MISSING "} ${prop}: design ${value}`);
      if (!ok) mismatches += 1;
    } else {
      const ok = (EXPECTED_ABSENT[selector] ?? []).includes(prop);
      console.log(`   ${ok ? "DIFFERS-BY-DESIGN" : "DIFFERS "} ${prop}: design ${value}  |  block ${have}`);
      if (!ok) mismatches += 1;
    }
  }
}

console.log("################ 10c PRIVACY POLICY MODAL ################");
for (const [i, sel, note] of PAIRS_10C) compare(`[10c#${i}]`, styles10[start10 + i] ?? "", sel, note);
console.log("\n################ 8a CHECKBOX GROUP ################");
for (const [i, sel, note] of PAIRS_8A) compare(`[8a#${i}]`, styles8a[i] ?? "", sel, note);

console.log(`\n################ TOTAL: ${checked} design declarations checked, ${mismatches} unexplained mismatch(es)`);
