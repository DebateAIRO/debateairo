// @vitest-environment jsdom
// CODE-REV-S02-C5C6 r1 — author D2 leak check. Named zzleak so it sorts AFTER the behaviour
// file in an alphabetical multi-file run: if the prototype accessors the behaviour file
// shadows were not restored, this file sees them as OWN properties of HTMLElement.prototype.
import { describe, expect, it } from "vitest";
describe("REVIEWER PROBE — prototype hygiene after the behaviour suite", () => {
  it("HTMLElement.prototype carries no own scroll-metric accessors", () => {
    for (const k of ["scrollTop", "clientHeight", "scrollHeight"]) {
      const own = Object.getOwnPropertyDescriptor(HTMLElement.prototype, k);
      // eslint-disable-next-line no-console
      console.log(`REV-D2 HTMLElement.prototype own ${k}: ${own === undefined ? "none (clean)" : "PRESENT (leak)"}`);
      expect(own, `HTMLElement.prototype.${k} leaked`).toBeUndefined();
      expect(Object.getOwnPropertyDescriptor(Element.prototype, k), `Element.prototype.${k} must still be jsdom's`)
        .not.toBeUndefined();
    }
    const el = document.createElement("div");
    el.className = "policyBody";
    document.body.append(el);
    // eslint-disable-next-line no-console
    console.log(`REV-D2 a fresh .policyBody reads scrollTop=${el.scrollTop} clientHeight=${el.clientHeight} scrollHeight=${el.scrollHeight}`);
    expect(el.clientHeight).toBe(0);
  });
});
