/*
 * Keyboard audit round 4 (2026-11-12), B5: the phone's bottom stack in a short window (320 x 256 = 400% zoom; a phone on
 * its side, about 667 x 375). A quarter of the window (64 / 94 px) was less than the pinned bar alone (64 px), so the notes
 * above it (Undo, the ready note, the Good time line, "Your picks") shrank to nothing and the tour's bar pushed the pinned
 * bar below the window. Now the stack may grow to its content up to 192 px (plus the safe area) or three quarters of the
 * window, whichever is less, and always leaves 64 px of page under the pinned where-bar (round 4 review); never below the
 * old quarter; the notes keep room for one control; and the stack itself scrolls
 * if it still must, so nothing focused in it is pushed out of the window. jsdom does no layout: this reads the rules, and
 * a painted browser is measured as the report says.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const undo = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-undo.css"), "utf8").replace(/\/\*[\s\S]*?\*\//gu, "");

function body(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const found = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "mu").exec(undo);
  expect(found, `${selector} has a rule`).not.toBeNull();
  return found![1]!;
}

describe("B5: the phone's stack in a short window", () => {
  it("keeps the old quarter-of-the-screen rule, and a later rule lets it grow to 192 px (or 75% of a shorter window)", () => {
    expect(undo).toMatch(/\.v4StackPhone \{[^}]*max-height: 25vh; max-height: 25dvh;/u);
    const room = body(".v4StackPhone:not(:has(.v4RepStrip-bottom))");
    expect(room).toContain("max-height: max(25vh, min(75vh, calc(192px + var(--safe-b, 0px)), calc(100vh - var(--v4-where-room, 0px) - 64px)))");
    expect(room).toContain("max-height: max(25dvh, min(75dvh, calc(192px + var(--safe-b, 0px)), calc(100dvh - var(--v4-where-room, 0px) - 64px)))");
    expect(room).toContain("overflow-y: auto");
    expect(undo.indexOf(".v4StackPhone:not(:has(.v4RepStrip-bottom))")).toBeGreaterThan(undo.indexOf(".v4StackPhone {"));
  });

  it("the notes above the bar keep room for one control (44 px and its 8 px margin)", () => {
    expect(body(".v4StackPhone > .v4StackTop:not(:empty)")).toContain("min-height: 56px");
  });

  it("the numbers: the page always keeps 64 px under the pinned where-bar; at 375 px and more the cap holds the tour's bar, the pinned bar and one note", () => {
    // The phone's pinned where-bar is about 77 px (12 padding + 32 crumbs + 4 gap + 28 row + 1 border).
    const where = 77;
    const cap = (height: number): number =>
      Math.max(height * 0.25, Math.min(height * 0.75, 192, height - where - 64));
    const needed = 60 + 64 + 56;
    // Round 4 review: at 320 x 256 a 192 px stack under a 77 px where-bar left no page at all. The stack now leaves 64 px
    // of page (it scrolls inside for the rest), and never goes below the old quarter.
    expect(256 - where - cap(256)).toBeGreaterThanOrEqual(64);
    expect(cap(256)).toBeGreaterThan(256 * 0.25);
    expect(cap(375)).toBeGreaterThanOrEqual(needed);
    expect(375 - where - cap(375)).toBeGreaterThanOrEqual(64);
    expect(cap(667)).toBeGreaterThanOrEqual(needed);
    // A tall window keeps its quarter (900 px: 225 px).
    expect(cap(900)).toBe(225);
  });

  it("the report strip's 85% and the cookie bar's static stack still win (more specific)", () => {
    expect(undo).toMatch(/\.v4StackPhone:has\(\.v4RepStrip-bottom\) \{ max-height: 85vh; max-height: 85dvh; \}/u);
    expect(undo).toMatch(/\.appShell:has\(\.consentBar\) \.v4StackPhone \{ position: static; max-height: none; \}/u);
  });

  it("adds no --v4-undo-* custom property", () => {
    expect(undo).not.toMatch(/--v4-undo-[\w-]+:/u);
  });
});
