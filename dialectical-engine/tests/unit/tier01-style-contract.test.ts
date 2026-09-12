import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const css = readFileSync(join(process.cwd(), "apps/ui/app/globals.css"), "utf8");
const OPEN_MARKER = "/* === debate-tiers S01 === */";
const CLOSE_MARKER = "/* === end debate-tiers S01 === */";
const compactCss = css.replace(/\s+/g, " ").trim();

function declarationsIn(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`Missing CSS selector region: ${selector}`);
  const bodyStart = start + selector.length + 2;
  const end = source.indexOf("}", bodyStart);
  if (end === -1) throw new Error(`Unclosed CSS selector region: ${selector}`);
  const body = source.slice(bodyStart, end).trim();
  if (!body) throw new Error(`Empty CSS selector region: ${selector}`);
  return body;
}

const terracottaTokens = declarationsIn(compactCss, ":root");
const chamberTokens = declarationsIn(compactCss, 'html[data-mode="chamber"]');

function modeTokenValues(tokens: string[]): Record<string, [string, string]> {
  const terracottaDeclarations = terracottaTokens.replace(/\/\*[\s\S]*?\*\//g, " ");
  const chamberDeclarations = chamberTokens.replace(/\/\*[\s\S]*?\*\//g, " ");
  const valueOf = (declarations: string, token: string) => {
    const value = declarations.match(new RegExp(`(?:^|;)\\s*${token}\\s*:\\s*([^;]+)`))?.[1]?.trim();
    if (!value) throw new Error(`Missing CSS token declaration: ${token}`);
    return value;
  };
  return Object.fromEntries(tokens.map((token) => {
    return [token, [valueOf(terracottaDeclarations, token), valueOf(chamberDeclarations, token)]];
  }));
}

describe("S01-C4 debate tier stylesheet contract", () => {
  // DONE.md §3 / S01-44 map — M-line → assertion(s) → suite:
  // M1 → S01-42a group → unit/tier01-style-contract (plus render S01-20, S01-22).
  // M2 → S01-42a card/chosenCard, M2 below → unit/tier01-style-contract.
  // M3 → S01-42a card, M3 below → unit/tier01-style-contract.
  // M4 → S01-42a tierName/chosenTierName, M4 below → unit/tier01-style-contract.
  // M5 → S01-42a tierName, M5 below → unit/tier01-style-contract.
  // M6 → S01-42a promise, M6 below → unit/tier01-style-contract (plus render S01-25).
  // M7 → S01-42a modelRow/model, M7 below → unit/tier01-style-contract (plus render S01-25, S01-26).
  // M8 → S01-42b → unit/tier01-style-contract (plus render S01-27–S01-30, S01-33, S01-36).
  // M12 → M12 below → unit/tier01-style-contract (plus render S01-30).
  // M13 → S01-41 → unit/tier01-style-contract.
  // M14 → S01-40 delimited placement → unit/tier01-style-contract (plus render S01-31–S01-33, S01-37).
  // M15 → S01-42a tierName/promise/model → unit/tier01-style-contract.
  test("keeps the selector contract scoped beside the existing /new rules", () => {
    const keyHintAt = css.indexOf(".ndKeyHint {");
    const openAt = css.indexOf(OPEN_MARKER);
    const closeAt = css.indexOf(CLOSE_MARKER);
    const reducedMotionAt = css.indexOf("@media (prefers-reduced-motion: reduce)", keyHintAt);

    // PROPERTY S01-40: one delimited S01 block sits after .ndKeyHint and before its next rule.
    expect({
      openCount: css.split(OPEN_MARKER).length - 1,
      closeCount: css.split(CLOSE_MARKER).length - 1,
      ordered: keyHintAt < openAt && openAt < closeAt && closeAt < reducedMotionAt,
    }).toEqual({ openCount: 1, closeCount: 1, ordered: true });

    const block = css.slice(openAt + OPEN_MARKER.length, closeAt);
    const colourDeclarations = Array.from(
      block.matchAll(/(?:^|\n)\s*(color|background|border(?:-color)?)\s*:\s*([^;]+);/g),
      (match) => ({ property: match[1] ?? "", value: match[2]?.trim() ?? "" }),
    );

    // PROPERTY S01-41: the scoped S01 rules contain no literal colour and source every colour from a token.
    expect({
      literalColours: block.match(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/gi) ?? [],
      nonTokenColours: colourDeclarations.filter(
        ({ property, value }) =>
          !value.includes("var(--") && !(property === "background" && value === "transparent"),
      ),
    }).toEqual({ literalColours: [], nonTokenColours: [] });

    const compactBlock = block.replace(/\s+/g, " ").trim();
    const declarations = (selector: string) => {
      const start = compactBlock.indexOf(`${selector} {`);
      if (start === -1) throw new Error(`Missing S01 CSS selector region: ${selector}`);
      const bodyStart = start + selector.length + 2;
      const end = compactBlock.indexOf("}", bodyStart);
      if (end === -1) throw new Error(`Unclosed S01 CSS selector region: ${selector}`);
      const body = compactBlock.slice(bodyStart, end).trim();
      if (!body) throw new Error(`Empty S01 CSS selector region: ${selector}`);
      return body;
    };
    const carries = (selector: string, values: string[]) => {
      const body = declarations(selector);
      return values.every((value) => body.includes(value));
    };

    // PROPERTY S01-42a: the selector rules carry DONE.md M1-M7 and M15 geometry and token roles.
    expect({
      group: carries(".ndTier", [
        "display: grid;",
        "grid-template-columns: repeat(2, minmax(0, 1fr));",
        "gap: 10px;",
        "margin-top: 20px;",
      ]),
      card: carries(".ndTierOption", [
        "display: flex;",
        "flex-direction: column;",
        "gap: 9px;",
        "padding: 13px 14px;",
        "border: 1px solid var(--line);",
        "border-radius: 12px;",
        "background: var(--core);",
        "font-family: inherit;",
        "cursor: pointer;",
      ]),
      chosenCard: carries('.ndTierOption[aria-checked="true"]', [
        "border-color: var(--line-strong);",
        "background: var(--shell);",
      ]),
      tierName: carries(".ndTierName", [
        "padding: 4px 12px;",
        "border-radius: 999px;",
        "background: transparent;",
        "color: var(--muted);",
        "font-size: 10.5px;",
        "font-weight: 600;",
      ]),
      chosenTierName: carries('.ndTierOption[aria-checked="true"] .ndTierName', [
        "background: var(--ink);",
        "color: var(--bg);",
        "font-weight: 700;",
      ]),
      promise: carries(".ndTierPromise", ["font-size: 11.5px;", "color: var(--text-2);"]),
      modelRow: carries(".ndTierModels", [
        "display: flex;",
        "flex-wrap: wrap;",
        "gap: 10px;",
      ]),
      model: carries(".ndTierModel", [
        "display: inline-flex;",
        "align-items: center;",
        "gap: 5px;",
        "font-family: var(--font-mono);",
        "font-size: 10.5px;",
        "font-weight: 500;",
        "color: var(--text-3);",
        "white-space: nowrap;",
      ]),
    }).toEqual({
      group: true,
      card: true,
      chosenCard: true,
      tierName: true,
      chosenTierName: true,
      promise: true,
      modelRow: true,
      model: true,
    });

    const lockSelector =
      ".ndSegItem:disabled, .ndSlider:disabled, .ndSteerInput:disabled, .ndSelect:has(select:disabled)";

    // PROPERTY S01-42b: all four Free-locked control families share only the ratified dim-and-cursor treatment.
    expect(declarations(lockSelector)).toBe("opacity: 0.45; cursor: not-allowed;");
    expect(declarations(".ndSelect select:disabled")).toBe("cursor: not-allowed;");
  });

  test("M2 · the chosen option's colour tokens match the measured values in both modes", () => {
    expect(modeTokenValues(["--line-strong", "--shell"])).toEqual({
      "--line-strong": ["rgba(41,38,31,.20)", "rgba(242,234,217,.18)"],
      "--shell": ["#EFE9E0", "#221D17"],
    });
  });

  test("M3 · the unchosen option's colour tokens match the measured values in both modes", () => {
    expect(modeTokenValues(["--line", "--core"])).toEqual({
      "--line": ["rgba(41,38,31,.10)", "rgba(242,234,217,.09)"],
      "--core": ["#FDFBF6", "#181410"],
    });
  });

  test("M4 · the chosen tier-name tokens match the measured values in both modes", () => {
    expect(modeTokenValues(["--ink", "--bg"])).toEqual({
      "--ink": ["#29261F", "#F2EAD9"],
      "--bg": ["#F9F6F1", "#14110E"],
    });
  });

  test("M5 · the unchosen tier-name token matches the measured values in both modes", () => {
    expect(modeTokenValues(["--muted"])).toEqual({ "--muted": ["#6E675C", "#9C907A"] });
  });

  test("M6 · the promise token matches the measured values in both modes", () => {
    expect(modeTokenValues(["--text-2"])).toEqual({ "--text-2": ["#555147", "#B5A88F"] });
  });

  test("M7 · the model-id colour tokens match the measured values in both modes", () => {
    expect(modeTokenValues(["--text-3", "--m-gpt", "--m-claude", "--m-grok"])).toEqual({
      "--text-3": ["#6E675C", "#9C907A"],
      "--m-gpt": ["#B4552D", "#B4552D"],
      "--m-claude": ["#8A63C9", "#8A63C9"],
      "--m-grok": ["#5F6670", "#5F6670"],
    });
  });

  test("M12 · the OPTIONS panel keeps its one-pixel dashed strong-line frame", () => {
    expect({
      onePixelFrame: declarationsIn(compactCss, ".ndCard").includes("border: 1px solid var(--line);"),
      legacyOverrides: declarationsIn(compactCss, ".ndLegacy"),
    }).toEqual({
      onePixelFrame: true,
      legacyOverrides: "margin-top: 14px; border-style: dashed; border-color: var(--line-strong); opacity: 0.88;",
    });
  });
});
