import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const css = readFileSync(join(process.cwd(), "apps/ui/app/globals.css"), "utf8");
const OPEN_MARKER = "/* === debate-tiers S01 === */";
const CLOSE_MARKER = "/* === end debate-tiers S01 === */";
const compactCss = css.replace(/\s+/g, " ").trim();

function declarationsIn(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  if (start === -1) return "";
  const bodyStart = start + selector.length + 2;
  return source.slice(bodyStart, source.indexOf("}", bodyStart)).trim();
}

const terracottaTokens = declarationsIn(compactCss, ":root");
const chamberTokens = declarationsIn(compactCss, 'html[data-mode="chamber"]');

function modeTokenPresence(tokens: string[]): Record<string, [boolean, boolean]> {
  const terracottaDeclarations = terracottaTokens.replace(/\/\*[\s\S]*?\*\//g, " ");
  const chamberDeclarations = chamberTokens.replace(/\/\*[\s\S]*?\*\//g, " ");
  return Object.fromEntries(tokens.map((token) => {
    const declaration = new RegExp(`(?:^|;)\\s*${token}\\s*:`);
    return [token, [declaration.test(terracottaDeclarations), declaration.test(chamberDeclarations)]];
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
      if (start === -1) return "";
      const bodyStart = start + selector.length + 2;
      return compactBlock.slice(bodyStart, compactBlock.indexOf("}", bodyStart)).trim();
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
  });

  test("M2 · the chosen option's colour tokens are declared in both modes", () => {
    expect(modeTokenPresence(["--line-strong", "--shell"])).toEqual({
      "--line-strong": [true, true],
      "--shell": [true, true],
    });
  });

  test("M3 · the unchosen option's colour tokens are declared in both modes", () => {
    expect(modeTokenPresence(["--line", "--core"])).toEqual({
      "--line": [true, true],
      "--core": [true, true],
    });
  });

  test("M4 · the chosen tier-name tokens are declared in both modes", () => {
    expect(modeTokenPresence(["--ink", "--bg"])).toEqual({
      "--ink": [true, true],
      "--bg": [true, true],
    });
  });

  test("M5 · the unchosen tier-name token is declared in both modes", () => {
    expect(modeTokenPresence(["--muted"])).toEqual({ "--muted": [true, true] });
  });

  test("M6 · the promise token is declared in both modes", () => {
    expect(modeTokenPresence(["--text-2"])).toEqual({ "--text-2": [true, true] });
  });

  test("M7 · the model-id colour tokens are declared in both modes", () => {
    expect(modeTokenPresence(["--text-3", "--m-gpt", "--m-claude", "--m-grok"])).toEqual({
      "--text-3": [true, true],
      "--m-gpt": [true, true],
      "--m-claude": [true, true],
      "--m-grok": [true, true],
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
