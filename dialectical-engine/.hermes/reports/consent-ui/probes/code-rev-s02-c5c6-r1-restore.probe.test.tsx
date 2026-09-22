// @vitest-environment jsdom
// CODE-REV-S02-C5C6 r1 — the author's D2 restore idiom, replayed here rather than trusted:
// define the three metrics on HTMLElement.prototype, delete them, and prove Element.prototype's
// originals are the ones answering afterwards (and that nothing is left own).
import { describe, expect, it } from "vitest";
const KEYS = ["scrollTop", "clientHeight", "scrollHeight"] as const;
describe("REVIEWER PROBE — the shadow/delete restore idiom", () => {
  it("delete on HTMLElement.prototype restores jsdom's Element.prototype accessors exactly", () => {
    const before = KEYS.map((k) => Object.getOwnPropertyDescriptor(Element.prototype, k));
    for (const k of KEYS) expect(Object.getOwnPropertyDescriptor(HTMLElement.prototype, k)).toBeUndefined();
    for (const k of KEYS) {
      Object.defineProperty(HTMLElement.prototype, k, { configurable: true, get: () => 4242 });
    }
    const el = document.createElement("div");
    expect(el.scrollHeight).toBe(4242);
    for (const k of KEYS) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[k];
    const after = KEYS.map((k) => Object.getOwnPropertyDescriptor(Element.prototype, k));
    for (let i = 0; i < KEYS.length; i += 1) {
      expect(Object.getOwnPropertyDescriptor(HTMLElement.prototype, KEYS[i]!)).toBeUndefined();
      expect(after[i]!.get, `Element.prototype.${KEYS[i]} getter identity`).toBe(before[i]!.get);
    }
    expect(el.scrollHeight).toBe(0);
    // eslint-disable-next-line no-console
    console.log("REV-D2b shadow/delete round-trip: Element.prototype getters identical, no own props left");
  });
});
