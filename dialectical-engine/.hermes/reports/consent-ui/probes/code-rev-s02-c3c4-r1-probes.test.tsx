// @vitest-environment jsdom

/**
 * CODE-REV-S02-C3C4 r1 — the REVIEWER's own probes, built from SPEC.md's properties
 * (S02-R01/R02/R03/R04/R17/R18/R19) and NOT from the author's test files.
 *
 * Posture is refutation: every case tries to make the claim false.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignUpFlow } from "../apps/ui/components/SignUpFlow.js";

/* Transcribed from docs/missions/consent-ui/design/turn-8a-checkbox-group.html:4,8 —
   the DESIGN file, read by this reviewer, not from the author's constants. */
const DESIGN_ROW_1 = "I am 18 or over.";
const DESIGN_ROW_2 =
  "I agree to the Privacy Policy, including that my debates may be published publicly.";
const DESIGN_CONTROL = "Privacy Policy";

let root: Root | null = null;
let register: ReturnType<typeof vi.fn>;

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function q<T extends Element>(sel: string): T {
  const el = document.querySelector<T>(sel);
  expect(el, `missing ${sel}`).not.toBeNull();
  return el!;
}
function field(name: string): HTMLInputElement {
  return q<HTMLInputElement>(`input[name="${name}"]`);
}
function button(): HTMLButtonElement {
  return q<HTMLButtonElement>("button.authPrimary");
}

async function mount(): Promise<void> {
  register = vi.fn().mockResolvedValue({ message: "ok" });
  await act(async () =>
    root!.render(<SignUpFlow client={{ register, resendVerification: vi.fn() }} />)
  );
}

/** Fill the non-consent fields so only the consent gate can refuse. */
function fillRest(): void {
  field("email").value = "person@example.test";
  field("recovery-email").value = "recovery@example.test";
  field("password").value = "correct horse battery staple";
}

async function submitForm(): Promise<void> {
  const form = q<HTMLFormElement>("form");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await settle();
}

/**
 * Accessible-name computation, the two branches HTML-AAM allows for an <input>:
 * aria-labelledby (concatenate the referenced subtrees) else the label ancestor's subtree.
 * Written here because jsdom implements no accname algorithm.
 */
function accessibleName(input: HTMLInputElement): string | null {
  const idref = input.getAttribute("aria-labelledby");
  if (idref !== null) {
    const parts = idref
      .split(/\s+/)
      .filter((id) => id.length > 0)
      .map((id) => document.getElementById(id));
    if (parts.some((p) => p === null)) return null; // a dangling idref names nothing
    return parts.map((p) => (p!.textContent ?? "").replace(/\s+/g, " ").trim()).join(" ");
  }
  const owned = input.closest("label");
  if (owned !== null) return (owned.textContent ?? "").replace(/\s+/g, " ").trim();
  const forLabel = input.id !== "" ? document.querySelector(`label[for="${input.id}"]`) : null;
  if (forLabel !== null) return (forLabel.textContent ?? "").replace(/\s+/g, " ").trim();
  return null;
}

describe("REVIEWER probes — S02 C3/C4", () => {
  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await mount();
  });

  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  /* ---------- P1 · the inputs are UNCONTROLLED ---------- */

  it("P1a — an assigned .checked survives a React re-render on BOTH inputs", async () => {
    field("adult-affirmed").checked = true;
    field("privacy-accepted").checked = true;
    // force a re-render that does not touch the boxes
    await act(async () => {
      const email = field("email");
      email.value = "x@y.zz";
      email.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
    expect(field("adult-affirmed").checked, "adult survived re-render").toBe(true);
    expect(field("privacy-accepted").checked, "privacy survived re-render").toBe(true);
  });

  it("P1b — neither input carries a defaultChecked/checked attribute in the DOM", () => {
    for (const n of ["adult-affirmed", "privacy-accepted"]) {
      expect(field(n).hasAttribute("checked"), `${n} checked attribute`).toBe(false);
    }
  });

  /* ---------- P2 · the mirrors compute ONLY `disabled` ---------- */

  it("P2a — .click() on both boxes ENABLES the button (the gate opens at all)", async () => {
    expect(button().disabled, "disabled at idle").toBe(true);
    await act(async () => { field("adult-affirmed").click(); });
    await act(async () => { field("privacy-accepted").click(); });
    expect(field("adult-affirmed").checked).toBe(true);
    expect(field("privacy-accepted").checked).toBe(true);
    expect(button().disabled, "button after both clicks").toBe(false);
  });

  it("P2b — a mirror that DISAGREES with the DOM cannot let register through (FormData is truth)", async () => {
    fillRest();
    // mirrors go true through the sanctioned idiom …
    await act(async () => { field("adult-affirmed").click(); });
    await act(async () => { field("privacy-accepted").click(); });
    expect(button().disabled, "gate open").toBe(false);
    // … then the DOM is driven false behind React's back: no change event, mirror stays true
    field("privacy-accepted").checked = false;
    expect(button().disabled, "button still reflects the STALE mirror").toBe(false);
    await submitForm();
    expect(register, "register must read FormData, never the mirror").not.toHaveBeenCalled();
  });

  it("P2c — mirrors false but DOM true still registers (the existing suite's idiom)", async () => {
    fillRest();
    field("adult-affirmed").checked = true;
    field("privacy-accepted").checked = true;
    expect(button().disabled, "button follows the mirrors, still disabled").toBe(true);
    await submitForm();
    expect(register).toHaveBeenCalledTimes(1);
  });

  /* ---------- P3 · R18 refusal, all four combinations ---------- */

  it("P3 — register is called only when BOTH FormData reads are 'on'", async () => {
    const cases: ReadonlyArray<readonly [boolean, boolean, number]> = [
      [false, false, 0],
      [true, false, 0],
      [false, true, 0],
      [true, true, 1]
    ];
    for (const [adult, privacy, calls] of cases) {
      await act(async () => root!.unmount());
      document.body.replaceChildren();
      const container = document.createElement("div");
      document.body.append(container);
      root = createRoot(container);
      await mount();
      fillRest();
      field("adult-affirmed").checked = adult;
      field("privacy-accepted").checked = privacy;
      await submitForm();
      expect(register, `adult=${adult} privacy=${privacy}`).toHaveBeenCalledTimes(calls);
    }
  });

  /* ---------- P4 · R19 — the request shape is untouched ---------- */

  it("P4 — register receives exactly four positional arguments", async () => {
    fillRest();
    field("adult-affirmed").checked = true;
    field("privacy-accepted").checked = true;
    await submitForm();
    expect(register).toHaveBeenCalledTimes(1);
    expect(register.mock.calls[0]).toHaveLength(4);
    expect(register.mock.calls[0]).toEqual([
      "person@example.test",
      "correct horse battery staple",
      "recovery@example.test",
      true
    ]);
  });

  /* ---------- P5 · native focusability, BOTH inputs (S02-S70) ---------- */

  it("P5 — both inputs are real, natively focusable checkboxes with no role override", () => {
    for (const n of ["adult-affirmed", "privacy-accepted"]) {
      const input = field(n);
      expect(input.nodeName, `${n} nodeName`).toBe("INPUT");
      expect(input.type, `${n} type`).toBe("checkbox");
      expect(input.getAttribute("tabindex"), `${n} tabindex attr`).toBeNull();
      expect(input.tabIndex, `${n} tabIndex`).toBe(0);
      expect(input.getAttribute("role"), `${n} role attr`).toBeNull();
      expect(input.required, `${n} required`).toBe(true);
      input.focus();
      expect(document.activeElement, `${n} focus lands on the input itself`).toBe(input);
    }
  });

  /* ---------- P6 · accessible names resolve to the DESIGN sentences ---------- */

  it("P6 — each input's accessible name is exactly its design sentence", () => {
    expect(accessibleName(field("adult-affirmed"))).toBe(DESIGN_ROW_1);
    expect(accessibleName(field("privacy-accepted"))).toBe(DESIGN_ROW_2);
  });

  it("P6b — the privacy idref names a real element and that element is not the input's ancestor label", () => {
    const idref = field("privacy-accepted").getAttribute("aria-labelledby");
    expect(idref, "aria-labelledby present").not.toBeNull();
    expect(document.getElementById(idref!), `#${idref} exists`).not.toBeNull();
    expect(field("privacy-accepted").closest("label"), "privacy row is not a <label>").toBeNull();
  });

  /* ---------- P7 · copy, byte-exact against the DESIGN file ---------- */

  it("P7 — the two rows' text nodes are exactly the design sentences, with no glyph character", () => {
    const rows = [...document.querySelectorAll<HTMLElement>(".consentGroup .consentRow")];
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toBe(DESIGN_ROW_1);
    expect(rows[1].textContent).toBe(DESIGN_ROW_2);
    // no check glyph anywhere in the group's text
    const groupText = q<HTMLElement>(".consentGroup").textContent ?? "";
    expect(groupText.includes("✓"), "a U+2713 CHECK MARK in the group text").toBe(false);
    expect(groupText.includes("✗"), "a U+2717 BALLOT X in the group text").toBe(false);
    const control = rows[1].querySelector(".consentPolicyLink");
    expect(control?.textContent).toBe(DESIGN_CONTROL);
  });

  /* ---------- P8 · the policy control cannot submit the form ---------- */

  it("P8 — the Privacy Policy control is type=button and clicking it neither submits nor toggles", async () => {
    fillRest();
    const control = q<HTMLButtonElement>(".consentPolicyLink");
    expect(control.type, "an untyped <button> in a form defaults to submit").toBe("button");
    await act(async () => { control.click(); });
    await settle();
    expect(register, "clicking the policy control must not submit").not.toHaveBeenCalled();
    expect(field("privacy-accepted").checked, "policy control must not toggle the box").toBe(false);
  });

  /* ---------- P9 · exactly one form; the group is the only consent surface ---------- */

  it("P9 — one <form>, one .consentGroup, two rows, adult first", () => {
    expect(document.querySelectorAll("form")).toHaveLength(1);
    expect(document.querySelectorAll(".consentGroup")).toHaveLength(1);
    const rows = [...document.querySelectorAll(".consentGroup .consentRow")];
    expect(rows).toHaveLength(2);
    expect(rows[0].contains(field("adult-affirmed"))).toBe(true);
    expect(rows[1].contains(field("privacy-accepted"))).toBe(true);
  });

  /* ---------- P10 · the B1 settled-value guard ---------- */

  it("P10a — a preventDefault'd click leaves BOTH the DOM box and the mirror false", async () => {
    const row = [...document.querySelectorAll<HTMLElement>(".consentGroup .consentRow")][1];
    // C7's shape: a listener on the row that cancels the activation so the modal can open instead
    row.addEventListener("click", (e) => e.preventDefault());
    await act(async () => { field("adult-affirmed").click(); });
    await act(async () => { field("privacy-accepted").click(); });
    expect(field("privacy-accepted").checked, "cancelled activation must not stick").toBe(false);
    expect(button().disabled, "the mirror must not have recorded the in-flight true").toBe(true);
  });

  it("P10b — after a cancelled click, a LATER uncancelled click still moves the mirror", async () => {
    const row = [...document.querySelectorAll<HTMLElement>(".consentGroup .consentRow")][1];
    const cancel = (e: Event) => e.preventDefault();
    row.addEventListener("click", cancel);
    await act(async () => { field("adult-affirmed").click(); });
    await act(async () => { field("privacy-accepted").click(); });   // cancelled
    expect(field("privacy-accepted").checked).toBe(false);
    row.removeEventListener("click", cancel);
    await act(async () => { field("privacy-accepted").click(); });   // allowed
    expect(field("privacy-accepted").checked, "DOM ticks on the second click").toBe(true);
    expect(button().disabled, "the mirror must follow — this is what C7 relies on").toBe(false);
  });
});
