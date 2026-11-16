import { expect, it } from "vitest";
import { rulesFor, stylesheet } from "./kbd-r4-e-css.js";

/*
 * Keyboard audit round 4 (E9, 12 Nov 2026): on /help at phone width the topic list becomes a sideways scroller with no
 * room above its buttons, and a topic showed the browser's ring just outside its edge, so the scroller cut the ring's
 * top (and the first and last topic's sides). At that width the focused topic's ring is now drawn inside its own edge.
 */
const globals = stylesheet("globals.css");

it("at phone width the topic list still scrolls sideways", () => {
  expect(rulesFor(globals, ".supportTopicList", "max-width: 600px")[0]?.body).toMatch(/overflow-x:\s*auto/);
});

it("and a focused topic's ring is inset, so the scroller cannot clip it", () => {
  const found = rulesFor(globals, ".supportTopic:focus-visible", "max-width: 600px");
  expect(found).toHaveLength(1);
  expect(found[0]!.body).toMatch(/outline:\s*2px solid var\(--focus\)/);
  expect(found[0]!.body).toMatch(/outline-offset:\s*-2px/);
});
