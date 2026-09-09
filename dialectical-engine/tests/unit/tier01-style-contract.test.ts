import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const css = readFileSync(join(process.cwd(), "apps/ui/app/globals.css"), "utf8");
const OPEN_MARKER = "/* === debate-tiers S01 === */";
const CLOSE_MARKER = "/* === end debate-tiers S01 === */";

describe("S01-C4 debate tier stylesheet contract", () => {
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
});
