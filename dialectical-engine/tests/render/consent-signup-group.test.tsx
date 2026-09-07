// @vitest-environment jsdom

/**
 * S02-C3 — the sign-up consent checkbox group (design artboard 8a).
 *
 * Steps pinned here: S02-S17 (structure), S02-S18 (byte-exact copy),
 * S02-S19 (form semantics), S02-S20 (accessible names), S02-S21 (the 18+ row is a
 * plain toggle), S02-S70 (the 18+ input is focusable and activation toggles it).
 *
 * This file deliberately asserts NOTHING about the privacy row's click behaviour
 * (cluster S02-C7) and NOTHING about the submit button's `disabled` state
 * (cluster S02-C4) — an assertion about either would be one a later cluster rewrites.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignUpFlow } from "../../apps/ui/components/SignUpFlow.js";

/** Copy — byte-exact from SPEC.md §Copy / turn-8a-checkbox-group.html:4,8. */
const ROW_ONE_TEXT = "I am 18 or over.";
const ROW_TWO_TEXT =
  "I agree to the Privacy Policy, including that my debates may be published publicly.";
const POLICY_CONTROL_TEXT = "Privacy Policy";

let root: Root | null = null;

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function field(name: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  expect(input, `missing rendered input ${name}`).not.toBeNull();
  return input!;
}

function rows(): readonly HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(".consentGroup .consentRow")];
}

/** The same input, reached THROUGH the group, so a case scoped this way is RED
 *  until the group exists (PLAN S02-S21/S02-S70: "the group does not exist yet"). */
function groupField(name: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(
    `.consentGroup .consentRow input[name="${name}"]`
  );
  expect(input, `missing input ${name} inside .consentGroup .consentRow`).not.toBeNull();
  return input!;
}

async function mount(client?: {
  register: ReturnType<typeof vi.fn>;
  resendVerification: ReturnType<typeof vi.fn>;
}): Promise<void> {
  const stub = client ?? { register: vi.fn(), resendVerification: vi.fn() };
  await act(async () => root!.render(<SignUpFlow client={stub} />));
}

/** Drive the card into its `sent` state the way a real registration does. */
async function registerSuccessfully(): Promise<void> {
  const register = vi.fn().mockResolvedValue({ message: "sent" });
  await mount({ register, resendVerification: vi.fn() });
  field("email").value = "person@example.test";
  field("recovery-email").value = "recovery@example.test";
  field("password").value = "correct horse battery staple";
  field("adult-affirmed").checked = true;
  field("privacy-accepted").checked = true;
  const form = document.querySelector<HTMLFormElement>("form");
  expect(form).not.toBeNull();
  await act(async () => {
    form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await settle();
  expect(register).toHaveBeenCalledTimes(1);
}

describe("sign-up consent checkbox group", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  /* S02-S17 — structure. */
  it("renders one bordered group holding exactly two rows, one input in each, adult first", async () => {
    await mount();

    const groups = document.querySelectorAll(".consentGroup");
    expect(groups).toHaveLength(1);

    const consentRows = rows();
    expect(consentRows).toHaveLength(2);

    const adult = field("adult-affirmed");
    const privacy = field("privacy-accepted");
    expect(consentRows[0].contains(adult)).toBe(true);
    expect(consentRows[1].contains(privacy)).toBe(true);
    expect(consentRows[0].contains(privacy)).toBe(false);
    expect(consentRows[1].contains(adult)).toBe(false);
    expect(adult.compareDocumentPosition(privacy) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  /* S02-S18 — copy is byte-exact. */
  it("carries the design's two sentences and the two-word policy control verbatim", async () => {
    await mount();

    const consentRows = rows();
    expect(consentRows[0].textContent?.trim()).toBe(ROW_ONE_TEXT);
    expect(consentRows[1].textContent?.trim()).toBe(ROW_TWO_TEXT);

    const control = consentRows[1].querySelector(".consentPolicyLink");
    expect(control, "missing the Privacy Policy control").not.toBeNull();
    expect(control!.textContent).toBe(POLICY_CONTROL_TEXT);
    /* The control sits INSIDE the sign-up form, so its `type` is what stops an
       activation from submitting the registration. Asserted as the ATTRIBUTE:
       jsdom performs no form submission from a button activation, so a
       behavioural pin here would be green against a submit button too. */
    expect(control!.getAttribute("type"), "Privacy Policy control type").toBe("button");
  });

  /* S02-S19 — form semantics. */
  it("keeps both boxes real, required, single-form controls that disable with the card", async () => {
    await mount();

    for (const name of ["adult-affirmed", "privacy-accepted"]) {
      const input = field(name);
      expect(input.type, `${name} type`).toBe("checkbox");
      expect(input.required, `${name} required`).toBe(true);
      expect(input.disabled, `${name} disabled at idle`).toBe(false);
    }
    expect(document.querySelectorAll("form")).toHaveLength(1);

    await registerSuccessfully();

    expect(field("adult-affirmed").disabled, "adult-affirmed disabled when sent").toBe(true);
    expect(field("privacy-accepted").disabled, "privacy-accepted disabled when sent").toBe(true);
    expect(document.querySelectorAll("form")).toHaveLength(1);
  });

  /* S02-S20 — both accessible names resolve, by two legal mechanisms. */
  it("gives each input its own sentence as an accessible name", async () => {
    await mount();

    const adultLabel = field("adult-affirmed").closest("label");
    expect(adultLabel, "adult-affirmed has no label ancestor").not.toBeNull();
    expect(adultLabel!.textContent?.trim()).toBe(ROW_ONE_TEXT);

    const labelledBy = field("privacy-accepted").getAttribute("aria-labelledby");
    expect(labelledBy, "privacy-accepted has no aria-labelledby").not.toBeNull();
    const named = document.getElementById(labelledBy!);
    expect(named, `aria-labelledby="${labelledBy}" names no element`).not.toBeNull();
    expect(named!.textContent?.trim()).toBe(ROW_TWO_TEXT);
  });

  /* S02-S21 — the 18+ row is a plain toggle, from all three surfaces, and opens nothing. */
  it("toggles the 18+ box from its input and opens no dialog", async () => {
    await mount();
    await act(async () => { groupField("adult-affirmed").click(); });
    expect(field("adult-affirmed").checked).toBe(true);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("toggles the 18+ box from its text and opens no dialog", async () => {
    await mount();
    const text = rows()[0].querySelector<HTMLElement>(".consentText");
    expect(text, "row 1 has no .consentText span").not.toBeNull();
    await act(async () => { text!.click(); });
    expect(field("adult-affirmed").checked).toBe(true);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("toggles the 18+ box from the row itself and opens no dialog", async () => {
    await mount();
    await act(async () => { rows()[0].click(); });
    expect(field("adult-affirmed").checked).toBe(true);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  /* S02-S70 — focusable, and activation from focus toggles it, opening nothing.
     jsdom 30.0.1 does not implement Space-activates-checkbox (measured, DECISIONS
     2026-09-06 / PLAN S02-S70): the keystroke itself is V acceptance step 14. */
  it("keeps the 18+ input focusable and lets activation from focus toggle it", async () => {
    await mount();

    const adult = groupField("adult-affirmed");
    adult.focus();
    expect(document.activeElement).toBe(adult);
    expect(adult.getAttribute("tabindex")).toBeNull();

    await act(async () => { adult.click(); });

    expect(adult.checked).toBe(true);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(adult);
  });
});
