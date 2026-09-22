// CODE-REV-S02-C8 r1 probe — SPEC.md:612/:637 ("Focus rings visible on every control, in both
// modes", token `--focus`): which of the block's focusable controls are matched by ANY
// `:focus-visible` rule in the whole stylesheet?  node focus-coverage.mjs <lane-root>
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const lane = process.argv[2];
const css = readFileSync(resolve(lane, "apps/ui/app/globals.css"), "utf8");
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "");
const selectors = [...strip(css).matchAll(/(^|\})\s*([^{}@][^{}]*?)\{/g)].map((m) => m[2].trim().replace(/\s+/g, " "));
const focusRules = selectors.filter((s) => s.includes(":focus-visible") || s.includes(":focus"));
// The block's focusable controls, as rendered (button / input / tabindex=0).
const controls = [
  [".consentBox", "input[type=checkbox]"],
  [".consentPolicyLink", "button"],
  [".policyClose", "button"],
  [".policyPill", "button"],
  [".policyPrimary", "button"],
  [".policyBody", "div[tabindex=0]"]
];
console.log(`:focus rules in globals.css: ${focusRules.length}`);
for (const [cls, tag] of controls) {
  const hit = focusRules.filter((s) => s.split(",").some((p) => p.trim().startsWith(cls)));
  // does any element-level rule cover the tag? (`button:focus-visible`, `*:focus-visible`)
  const generic = focusRules.filter((s) => s.split(",").some((p) => /^(\*|button|input|a|textarea|select)\b/.test(p.trim())));
  const genericHit = generic.filter((s) => s.split(",").some((p) => new RegExp(`^${tag.split("[")[0]}\\b`).test(p.trim())));
  console.log(`${cls.padEnd(20)} ${tag.padEnd(22)} class-rule=${hit.length ? hit.join(" | ") : "NONE"}   element-rule=${genericHit.length ? genericHit.join(" | ") : "NONE"}`);
}
