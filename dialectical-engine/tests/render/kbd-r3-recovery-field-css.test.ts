/*
 * Keyboard audit round 3 (2026-11-12): the recovery-code box (sign-in, account recovery, social sign-up) takes the focus
 * outline away and marks focus with its border. That border was the plain gold: 2.94:1 on the box's own fill in
 * Terracotta, under the 3:1 a focus indicator needs. It is now the deeper gold the other sign-in fields use.
 * jsdom computes no style, so this reads the rule and the theme tokens.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "apps/ui/app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|[},])\\s*${escaped}\\s*\\{([^}]*)\\}`, "m").exec(css);
  expect(match, `${selector} has a rule`).not.toBeNull();
  return match![1]!;
}

function token(theme: ":root" | 'html[data-mode="chamber"]', name: string): string {
  const start = css.indexOf(`${theme} {`);
  expect(start, `${theme} block`).toBeGreaterThan(-1);
  const block = css.slice(start, css.indexOf("\n}", start));
  const match = new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(block);
  expect(match, `${name} in ${theme}`).not.toBeNull();
  return match![1]!;
}

function luminance(hex: string): number {
  const channel = (index: number): number => {
    const value = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

describe("the recovery-code box", () => {
  it("marks focus with a border of at least 3:1 against its own fill and the card, in both themes", () => {
    expect(declarations(".authField input.authRecoveryInput")).toContain("background: var(--shell)");
    const focused = declarations(".authField input.authRecoveryInput:focus");
    expect(focused).toContain("border-color: var(--gold-text)");
    for (const theme of [":root", 'html[data-mode="chamber"]'] as const) {
      const border = token(theme, "--gold-text");
      expect(contrast(border, token(theme, "--shell")), `${theme}: on the box`).toBeGreaterThanOrEqual(3);
      expect(contrast(border, token(theme, "--bg")), `${theme}: on the card`).toBeGreaterThanOrEqual(3);
    }
  });
});
