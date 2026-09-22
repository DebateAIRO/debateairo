// @vitest-environment jsdom
// CODE-REV-S02-C1C2 r2 — probe W1.
// The author's rework handoff §4 and F3 claim: "In jsdom no element exists that passes the
// filter and refuses focus()", therefore the N1 advance loop "CANNOT be pinned by a jsdom
// test".  This probe enumerates the elements the PINNED selector admits, the post-fix filter
// keeps, and jsdom's focus() then REFUSES.  If that set is non-empty the claim is false and
// the advance loop is pinnable here.
import { describe, expect, it } from "vitest";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// the module's own filter, transcribed
function isFocusCandidate(element: HTMLElement): boolean {
  if (element.getAttribute("tabindex") === "-1") return false;
  return !(element.nodeName === "INPUT" && (element as HTMLInputElement).type === "hidden");
}

const CASES: ReadonlyArray<readonly [string, string]> = [
  ["plain button", '<button type="button">b</button>'],
  ["button tabindex=-1", '<button type="button" tabindex="-1">b</button>'],
  ["button [hidden]", '<button type="button" hidden>b</button>'],
  ["button display:none", '<button type="button" style="display:none">b</button>'],
  ["button visibility:hidden", '<button type="button" style="visibility:hidden">b</button>'],
  ["input type=hidden", '<input type="hidden" name="csrf">'],
  ["button disabled", '<button type="button" disabled>b</button>'],
  ["button DISABLED + tabindex=0", '<button type="button" disabled tabindex="0">b</button>'],
  ["input DISABLED + tabindex=0", '<input type="text" disabled tabindex="0">'],
  ["select DISABLED + tabindex=0", '<select disabled tabindex="0"><option>x</option></select>'],
  ["textarea DISABLED + tabindex=0", '<textarea disabled tabindex="0"></textarea>'],
  ["button inside <fieldset disabled>", '<fieldset disabled><button type="button">b</button></fieldset>'],
  ["a WITHOUT href, tabindex=0", '<a tabindex="0">a</a>'],
  ["a WITH href", '<a href="#x">a</a>'],
  ["div tabindex=0", '<div tabindex="0">d</div>'],
  ["button inert", '<button type="button" inert>b</button>'],
  ["input type=checkbox", '<input type="checkbox">'],
];

describe("W1 — jsdom focusability vs the pinned selector + the shipped filter", () => {
  it("enumerates every element the selector admits, the filter keeps, and focus() refuses", () => {
    const anchor = document.createElement("button");
    anchor.textContent = "anchor";
    document.body.append(anchor);

    const rows: string[] = [];
    const refusedButAdmitted: string[] = [];
    for (const [label, html] of CASES) {
      const host = document.createElement("div");
      host.innerHTML = html;
      document.body.append(host);
      const target = host.querySelector<HTMLElement>("button, input, select, textarea, a, div")!;
      // the element the module would actually consider, exactly as focusableWithin computes it
      const admitted = [...host.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
      const selectorHit = admitted.some((el) => el === target || el.contains(target));
      const kept = admitted.filter(isFocusCandidate).some((el) => el === target || el.contains(target));

      anchor.focus();
      const before = document.activeElement;
      target.focus();
      const landed = document.activeElement === target;
      rows.push(
        `${label.padEnd(34)} selector=${String(selectorHit).padEnd(5)} afterFilter=${String(kept).padEnd(5)} focus()lands=${landed}`
      );
      if (kept && !landed) refusedButAdmitted.push(label);
      expect(before).toBe(anchor);
      host.remove();
    }
    console.log("\n" + rows.join("\n"));
    console.log(
      "\nW1 ELEMENTS THE FILTER KEEPS BUT jsdom focus() REFUSES: " +
        (refusedButAdmitted.length === 0 ? "(none)" : JSON.stringify(refusedButAdmitted))
    );
    console.log(`W1 count = ${refusedButAdmitted.length}`);
    expect(Array.isArray(refusedButAdmitted)).toBe(true);
  });
});
