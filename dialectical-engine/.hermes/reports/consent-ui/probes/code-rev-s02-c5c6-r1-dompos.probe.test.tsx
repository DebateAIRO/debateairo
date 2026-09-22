// @vitest-environment jsdom
// CODE-REV-S02-C5C6 r1 — the F1 charge, measured in two lines of DOM (plus the version print).
import { describe, expect, it } from "vitest";
describe("REVIEWER PROBE — jsdom compareDocumentPosition on a detached node", () => {
  it("answers the same bitmask in BOTH directions", () => {
    const attached = document.createElement("div");
    document.body.append(attached);
    const detached = document.createElement("div"); // never appended
    const a2d = attached.compareDocumentPosition(detached);
    const d2a = detached.compareDocumentPosition(attached);
    const F = Node.DOCUMENT_POSITION_FOLLOWING, P = Node.DOCUMENT_POSITION_PRECEDING;
    const D = Node.DOCUMENT_POSITION_DISCONNECTED, I = Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC;
    // eslint-disable-next-line no-console
    console.log(`REV-F1 attached->detached=${a2d} detached->attached=${d2a} ` +
      `(DISCONNECTED=${D} PRECEDING=${P} FOLLOWING=${F} IMPL=${I}) ` +
      `bothFOLLOWING=${(a2d & F) !== 0 && (d2a & F) !== 0} ` +
      `eitherPRECEDING=${(a2d & P) !== 0 || (d2a & P) !== 0}`);
    // Also: two attached siblings, for the contrast.
    const s1 = document.createElement("div"); const s2 = document.createElement("div");
    document.body.append(s1, s2);
    // eslint-disable-next-line no-console
    console.log(`REV-F1 attached siblings: s1->s2=${s1.compareDocumentPosition(s2)} s2->s1=${s2.compareDocumentPosition(s1)}`);
    // And detached-vs-detached.
    const d1 = document.createElement("div"); const d2 = document.createElement("div");
    // eslint-disable-next-line no-console
    console.log(`REV-F1 detached pair: d1->d2=${d1.compareDocumentPosition(d2)} d2->d1=${d2.compareDocumentPosition(d1)}`);
    expect(typeof a2d).toBe("number");
  });
});
