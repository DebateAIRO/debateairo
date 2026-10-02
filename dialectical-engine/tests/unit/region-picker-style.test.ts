import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("apps/ui/app/globals.css", "utf8");
const component = readFileSync("apps/ui/components/RegionField.tsx", "utf8");
const open = "/* === region-picker S01 === */";
const close = "/* === end region-picker S01 === */";
const block = css.slice(css.indexOf(open), css.indexOf(close) + close.length);

function bodyAfter(source: string, opener: string): string {
  const start = source.indexOf(opener);
  expect(start, `missing ${opener}`).toBeGreaterThanOrEqual(0);
  const brace = source.indexOf("{", start);
  let depth = 1;
  for (let index = brace + 1; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(brace + 1, index);
  }
  throw new Error(`Unclosed CSS rule: ${opener}`);
}

describe("region picker CSS contract", () => {
  it("F1 places one delimited block before the consent fence", () => {
    expect(css.split(open)).toHaveLength(2);
    expect(css.split(close)).toHaveLength(2);
    expect(css.indexOf(open)).toBeLessThan(css.indexOf(close));
    expect(css.indexOf(close)).toBeLessThan(css.indexOf("/* === consent-ui S01 === */"));
  });

  it("F2 resolves every used token in both mode roots", () => {
    const light = bodyAfter(css, ":root {");
    const dark = bodyAfter(css, 'html[data-mode="chamber"] {');
    const tokens = [...block.matchAll(/var\((--[\w-]+)\)/g)].map((match) => match[1]!);
    expect(tokens.length).toBeGreaterThan(0);
    for (const token of tokens) {
      expect(light, `light ${token}`).toContain(`${token}:`);
      // Typography tokens are mode-independent and inherited from :root in Chamber.
      if (token !== "--font-sans" && token !== "--font-mono") {
        expect(dark, `chamber ${token}`).toContain(`${token}:`);
      }
    }
  });

  it("F3 keeps colour literals and inline styles out of the field", () => {
    for (const source of [block, component]) {
      expect(source).not.toMatch(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?\b/);
      expect(source).not.toMatch(/rgba?\(/);
    }
    expect(component).not.toMatch(/\bstyle\s*=/);
  });

  it("F4 maps the artboard selectors to the chosen tokens and geometry", () => {
    const rules: Array<[string, string[]]> = [
      [".regionTrigger", ["border: 1px solid var(--line-strong)", "background: var(--shell)"]],
      ['.regionTrigger[aria-expanded="true"]', ["var(--con)"]],
      [".regionPopover", ["background: var(--core)", "box-shadow: var(--shadow-pop)", "top: calc(100% + 4px)", "z-index: 30"]],
      [".regionGrid", ["grid-template-columns: 1fr 1fr"]],
      ['.regionCountry[data-picked="true"]', ["background: var(--shell)"]],
      ['.regionCountry[data-picked="true"] .regionCellName', ["font-weight: 700"]],
      [".regionDiamond", ["background: var(--gold)", "opacity: 0"]],
      ['.regionCountry[data-picked="true"] .regionDiamond', ["opacity: 1"]],
      ['.regionStateSelect[data-state="bad"]', ["var(--dispute-text)"]]
    ];
    for (const [selector, fragments] of rules) {
      const body = bodyAfter(block, `${selector} {`);
      for (const fragment of fragments) expect(body, selector).toContain(fragment);
    }
  });

  it("F6 gives narrow picker containers a readable one-column country list", () => {
    expect(bodyAfter(block, ".regionPicker { ")).toContain("container-type: inline-size");
    expect(bodyAfter(block, ".regionPicker { ")).toContain("z-index: 30");
    expect(block).toMatch(/@container\s*\(max-width:\s*299px\)\s*\{[\s\S]*?\.regionGrid\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(bodyAfter(block, ".regionName { ")).toContain("text-overflow: ellipsis");
    expect(bodyAfter(block, ".regionPath { ")).toContain("text-overflow: ellipsis");
    expect(block).toContain(".regionTrigger:has(.regionFlag) .regionPath { order: 4;");
  });

  it("F5 gives each keyboard control the shared focus token", () => {
    for (const selector of [".regionTrigger", ".regionContinent", ".regionBack", ".regionCountry"]) {
      const focus = `${selector}:focus-visible`;
      const index = block.indexOf(focus);
      expect(index, focus).toBeGreaterThanOrEqual(0);
      const ruleStart = block.lastIndexOf("}", index) + 1;
      const ruleEnd = block.indexOf("}", index);
      expect(block.slice(ruleStart, ruleEnd), focus).toContain("var(--focus)");
    }
  });
});
