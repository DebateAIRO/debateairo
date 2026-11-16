import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Keyboard audit round 3 (2026-11-12), K4 / CSS-10: classes that no component renders any more still had rules
 * that took the focus outline away (`outline: none`). A rule like that is harmless while dead, and silently strips the
 * ring from whatever control is next given the old name. They were removed; this keeps them out.
 */
const GLOBALS = resolve(import.meta.dirname, "../../apps/ui/app/globals.css");
const DEAD = [
  "authCodeCapture", "mfaTypeback", "mfaCodeInput", "tokenInput", "capInput",
  // Found dead in the same sweep: the six-slot code boxes that went with authCodeCapture, and two old field classes
  // that removed the outline (`.input`, also as `.composer .input`, and `.textareaSerif`).
  "authCodeField", "authCodeBoxes", "authCodeBox", "input", "textareaSerif"
];

describe("CSS-10: the dead outline-removing rules stay gone", () => {
  it.each(DEAD)("globals.css has no rule for .%s", (name) => {
    // Rules only: a comment may still name an old class (one inside the pinned consent block does).
    const css = readFileSync(GLOBALS, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(new RegExp(`\\.${name}(?![\\w-])`).test(css)).toBe(false);
  });
});
