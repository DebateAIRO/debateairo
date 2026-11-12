/*
 * Keyboard audit, 12 Nov 2026: the site-wide rules that keep keyboard focus visible. jsdom computes no style, so this
 * reads the rules themselves (the bar's clearance was walked in a browser at 1024px and 375px; how the rings look is V's).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "apps/ui/app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|[},])\\s*${escaped}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, "m").exec(css);
  expect(match, `${selector} has a rule`).not.toBeNull();
  return match![1]!;
}

/** A colour token's value in one theme's block (`:root` is Terracotta, `html[data-mode="chamber"]` is Chamber). */
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

describe("the focus guard's parked place", () => {
  it("shows the site's ring inside its own edge, and leaves the main area quiet", () => {
    const rule = declarations("[data-focus-parked]:not(.appMain):focus-visible");
    expect(rule).toContain("outline: 2px solid var(--focus)");
    expect(rule).toContain("outline-offset: -2px");
    expect(declarations(".appMain:focus")).toContain("outline: none");
  });
});

describe("the cookie bar never covers the control that has focus (WCAG 2.4.11)", () => {
  it("scrolls a focused control clear of the room the bar covers, and does nothing without the bar", () => {
    expect(css).toMatch(/(?:^|\})\s*html\s*\{\s*scroll-padding-block-end:\s*var\(--consent-bar-room, 0px\);\s*\}/m);
  });

  it("gives the page that room at its end, except where the V4 pages keep their own", () => {
    expect(declarations(".appShell:has(> .consentBar):not(:has(.v4AskMain, .v4DebPage))")).toContain(
      "padding-bottom: var(--consent-bar-room, 0px)"
    );
  });

  it("lifts the Help button, and keeps its panel inside the window, while the bar is under them", () => {
    expect(declarations(".appShell:has(> .consentBar) .supportWidget")).toContain(
      "bottom: calc(var(--dock-offset-b) + var(--consent-bar-room, 0px))"
    );
    expect(declarations(".appShell:has(> .consentBar) .supportWidgetPanel")).toContain(
      "max-height: calc(70vh - var(--consent-bar-room, 0px))"
    );
  });
});

describe("sign-in and sign-up fields", () => {
  it("mark focus with a border of at least 3:1 against the field and the card, in both themes", () => {
    expect(declarations(".authField input:focus")).toContain("border-color: var(--gold-text)");
    expect(declarations(".authField select:focus")).toContain("border-color: var(--gold-text)");
    for (const theme of [":root", 'html[data-mode="chamber"]'] as const) {
      const border = token(theme, "--gold-text");
      expect(contrast(border, token(theme, "--shell")), `${theme}: on the field`).toBeGreaterThanOrEqual(3);
      expect(contrast(border, token(theme, "--bg")), `${theme}: on the card`).toBeGreaterThanOrEqual(3);
    }
  });

  it("the one-time age check does not cut off the date grid's last row", () => {
    expect(declarations('.authCard:has([data-form="age-confirmation"] .dobPopover)')).toContain("overflow: visible");
  });
});

describe("the operator routing box", () => {
  it("no longer removes its focus outline with nothing in its place", () => {
    expect(declarations(".fieldGroup textarea")).not.toContain("outline");
    expect(css).toMatch(/textarea:focus-visible,/);
  });
});
