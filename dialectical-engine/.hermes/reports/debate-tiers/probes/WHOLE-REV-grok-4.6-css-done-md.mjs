#!/usr/bin/env node
// Independent WHOLE-REV-grok-4.6 CSS probe vs DONE.md M1–M15.
// Reads globals.css as source (README: no browser). Exit 0 iff every check holds.
import { readFileSync } from "node:fs";

const ROOT = process.env.WORKTREE || process.argv[2] || process.cwd();
const css = readFileSync(`${ROOT}/apps/ui/app/globals.css`, "utf8");
const rootBlock = css.match(/:root \{[\s\S]*?\n\}/)?.[0] ?? "";
const chamberBlock = css.match(/html\[data-mode="chamber"\] \{[\s\S]*?\n\}/)?.[0] ?? "";
const s01 = css.match(/\/\* === debate-tiers S01 === \*\/[\s\S]*?\/\* === end debate-tiers S01 === \*\//)?.[0] ?? "";

function token(block, name) {
  const m = block.match(new RegExp(`--${name}:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
}

const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(`${id}: ${detail}`);
}

check("blocks", rootBlock.includes("--bg:") && chamberBlock.includes("--bg:"), "missing :root or chamber token block");
check("s01-block", s01.length > 0, "missing S01 CSS fence");

const terracotta = {
  "line-strong": "rgba(41,38,31,.20)",
  shell: "#EFE9E0",
  core: "#FDFBF6",
  line: "rgba(41,38,31,.10)",
  ink: "#29261F",
  bg: "#F9F6F1",
  muted: "#6E675C",
  "text-2": "#555147",
  "text-3": "#6E675C",
  "m-gpt": "#B4552D",
  "m-claude": "#8A63C9",
  "m-grok": "#5F6670"
};
const chamber = {
  "line-strong": "rgba(242,234,217,.18)",
  shell: "#221D17",
  core: "#181410",
  line: "rgba(242,234,217,.09)",
  ink: "#F2EAD9",
  bg: "#14110E",
  muted: "#9C907A",
  "text-2": "#B5A88F",
  "text-3": "#9C907A",
  "m-gpt": "#B4552D",
  "m-claude": "#8A63C9",
  "m-grok": "#5F6670"
};

for (const [name, value] of Object.entries(terracotta)) {
  check(`M-token-T-${name}`, token(rootBlock, name) === value, `terracotta --${name} want ${value} got ${token(rootBlock, name)}`);
}
for (const [name, value] of Object.entries(chamber)) {
  check(`M-token-C-${name}`, token(chamberBlock, name) === value, `chamber --${name} want ${value} got ${token(chamberBlock, name)}`);
}

check("M1-grid", s01.includes("grid-template-columns: repeat(2, minmax(0, 1fr))") && s01.includes("gap: 10px") && s01.includes("margin-top: 20px"), "M1 grid");
check("M2-chosen", s01.includes(".ndTierOption[aria-checked=\"true\"]") && s01.includes("border-color: var(--line-strong)") && s01.includes("background: var(--shell)"), "M2");
check("M3-unchosen", s01.includes("border: 1px solid var(--line)") && s01.includes("background: var(--core)") && s01.includes("border-radius: 12px") && s01.includes("padding: 13px 14px") && s01.includes("gap: 9px") && s01.includes("cursor: pointer"), "M3");
check("M4-name-chosen", s01.includes("font-weight: 700") && s01.includes("background: var(--ink)") && s01.includes("color: var(--bg)"), "M4");
check("M5-name-unchosen", s01.includes("background: transparent") && s01.includes("color: var(--muted)") && s01.includes("font-weight: 600") && s01.includes("font-size: 10.5px"), "M5");
check("M6-promise", s01.includes(".ndTierPromise") && s01.includes("font-size: 11.5px") && s01.includes("color: var(--text-2)"), "M6");
check("M7-models", s01.includes("flex-wrap: wrap") && s01.includes("font-family: var(--font-mono)") && s01.includes("white-space: nowrap") && s01.includes("color: var(--text-3)"), "M7");
check("M8-lock", s01.includes("opacity: 0.45") && s01.includes("cursor: not-allowed") && s01.includes(".ndSegItem:disabled") && s01.includes(".ndSlider:disabled") && s01.includes(".ndSteerInput:disabled") && s01.includes(".ndSelect:has(select:disabled)"), "M8");
check("M13-no-hex", !/#[0-9A-Fa-f]{3,8}/.test(s01) && !/rgba?\(/.test(s01.replace(/\/\*[\s\S]*?\*\//g, "")), "M13 no new colour literal in S01 block");
check("M15-mono-token", rootBlock.includes('"JetBrains Mono"'), "M15 JetBrains Mono in --font-mono");

if (failures.length) {
  console.log(`FAIL ${failures.length}`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log("PASS css-done-md-probe checks=" + [
  "tokens T+C", "M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M13", "M15"
].join(","));
