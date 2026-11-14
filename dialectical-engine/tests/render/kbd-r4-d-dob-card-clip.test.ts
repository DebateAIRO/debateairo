/*
 * Keyboard audit round 4 (2026-11-12), D2: `.authCard` clips (`overflow: hidden`). Round 2 lifted that only for the
 * one-time age check (`[data-form="age-confirmation"]`), but the same date-of-birth field sits on the /enroll-mfa and
 * /recover onboarding step (OnboardingEvidence, a form with no `data-form`), where a focused 29, 30 or 31 was cut off.
 * jsdom computes no style, so this reads the rule: wherever a date grid is open inside an auth card, the card does not clip.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "apps/ui/app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, selector, body]) => ({ selectors: selector!.split(",").map(part => part.trim()), body: body! }));

it("an open date grid anywhere in an auth card lifts the card's clipping, not only on the age check", () => {
  const lifting = rules.filter(rule => rule.selectors.includes(".authCard:has(.dobPopover)"));
  expect(lifting.length, ".authCard:has(.dobPopover) has a rule").toBeGreaterThan(0);
  expect(lifting.some(rule => /overflow:\s*visible/.test(rule.body))).toBe(true);
});

it("no rule narrower than that is left to suggest the grid is cut off elsewhere", () => {
  expect(rules.some(rule => rule.selectors.includes('.authCard:has([data-form="age-confirmation"] .dobPopover)'))).toBe(false);
});

it("the card still clips when no grid is open", () => {
  const card = rules.find(rule => rule.selectors.includes(".authCard"));
  expect(card?.body).toMatch(/overflow:\s*hidden/);
});
