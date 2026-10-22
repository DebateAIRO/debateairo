/*
 * Keyboard-only audit (2026-10-22): controls that draw no ring of their own still show where the
 * keyboard is. jsdom computes no style, so this reads the rules themselves; how they look is V's.
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

describe("focus rings for controls that draw none of their own", () => {
  it("rings the composer and the /new question bezels while their field has keyboard focus", () => {
    expect(declarations(".libComposer:has(.libComposerInput:focus-visible)")).toContain("outline: 2px solid var(--focus)");
    expect(declarations(".ndTopicBezel:has(.ndTopic:focus-visible)")).toContain("outline: 2px solid var(--focus)");
  });

  it("gives the Split heading focus moves to a faint ring, only for the keyboard", () => {
    // Prefixed: the consent S02 block, later in the file, sets `outline: none` on their `:focus`.
    expect(declarations(".split .splitFocusClaim:focus-visible")).toContain("outline: 1px dashed var(--focus)");
    expect(declarations(".split .splitFocusRootClaim:focus-visible")).toContain("outline: 1px dashed var(--focus)");
  });

  it("rings the Tree canvas and the cookie card's item list, both Tab stops that scroll", () => {
    expect(declarations(".canvas:focus-visible")).toContain("outline: 2px solid var(--focus)");
    expect(declarations(".consentCatList:focus-visible")).toContain("outline: 2px solid var(--focus)");
  });
});
