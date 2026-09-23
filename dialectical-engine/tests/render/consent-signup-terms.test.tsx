// @vitest-environment jsdom

/**
 * The Terms of Service row of the sign-up consent group (design artboard 8a, third row).
 *
 * Added when the Terms became a document in the product: the row is the privacy row's twin
 * and follows the same ONE CLICK RULE — any click on the empty row OPENS the Terms and ticks
 * nothing; the ONLY route that ticks the box is the modal's `I have read it` after the end is
 * reached; every dismissal leaves the box empty. The register call keeps its shape: the Terms
 * box is a third gate on the same submit, refused from FormData exactly like the other two.
 *
 * The privacy row's own behaviour stays pinned in `consent-signup-modal.test.tsx`; this file
 * pins what is NEW: the third row, the Terms dialog being the one that opens, the two dialogs
 * being distinguishable, and the three-box gate. Idioms are the sign-up suites' — `.click()`
 * inside `act` for every box, the scroll metrics shadowed on `HTMLElement.prototype`.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignUpFlow } from "../../apps/ui/components/SignUpFlow.js";

const ROW_ONE_TEXT = "I am 18 or over.";
const ROW_TWO_TEXT = "I have read the Privacy Policy.";
const ROW_THREE_TEXT = "I have read and agree to the Terms of Service.";

let root: Root | null = null;

const METRIC_KEYS = ["scrollTop", "clientHeight", "scrollHeight"] as const;
type MetricKey = (typeof METRIC_KEYS)[number];
const TOP: Record<MetricKey, number> = { scrollTop: 0, clientHeight: 200, scrollHeight: 500 };
let metrics: Record<MetricKey, number> = { ...TOP };

function stubScrollMetrics(): void {
  for (const key of METRIC_KEYS) {
    Object.defineProperty(HTMLElement.prototype, key, {
      configurable: true,
      get(this: HTMLElement): number {
        return this.classList.contains("policyBody") ? metrics[key] : 0;
      }
    });
  }
}

function restoreScrollMetrics(): void {
  for (const key of METRIC_KEYS) {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
  }
}

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

function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="dialog"]');
}

function createAccountButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>("button.authPrimary");
  expect(button, "missing the Create account button").not.toBeNull();
  return button!;
}

/** The single control inside the open dialog whose own text is exactly `label`. */
function dialogButton(label: string): HTMLButtonElement {
  const open = dialog();
  expect(open, `expected an open dialog to find ${label} in`).not.toBeNull();
  const found = [...open!.querySelectorAll<HTMLButtonElement>("button")].filter(
    (button) => button.textContent === label
  );
  expect(found.length, `expected exactly one control labelled ${label}`).toBe(1);
  return found[0]!;
}

async function clickElement(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click();
  });
  await settle();
}

async function driveScrollToEnd(): Promise<void> {
  metrics.scrollTop = metrics.scrollHeight - metrics.clientHeight;
  await act(async () => {
    document.querySelector(".policyBody")!.dispatchEvent(new Event("scroll", { bubbles: false }));
  });
  await settle();
}

async function pressEscape(): Promise<void> {
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    );
  });
  await settle();
}

function expectTermsOpen(): void {
  expect(dialog(), "the Terms dialog must be open").not.toBeNull();
  expect(dialog()!.getAttribute("aria-labelledby"), "the Terms, not the policy").toBe(
    "terms-modal-title"
  );
  expect(document.getElementById("terms-modal-title")!.textContent).toBe("What you agree to");
  expect(document.getElementById("policy-modal-title"), "the policy stays closed").toBeNull();
}

/** The one lawful route to a ticked terms box. */
async function acknowledgeTerms(): Promise<void> {
  metrics.scrollTop = TOP.scrollTop;
  await clickElement(field("terms-accepted"));
  expectTermsOpen();
  expect(dialogButton("I have read it").disabled, "disabled before the end is reached").toBe(true);
  await driveScrollToEnd();
  expect(dialogButton("I have read it").disabled, "enabled once the end is reached").toBe(false);
  await clickElement(dialogButton("I have read it"));
  expect(field("terms-accepted").checked, "acknowledging must tick the terms box").toBe(true);
  expect(dialog(), "acknowledging must close the Terms").toBeNull();
}

/** The privacy row's lawful route, for the cases that need all three boxes. */
async function acknowledgePolicy(): Promise<void> {
  metrics.scrollTop = TOP.scrollTop;
  await clickElement(field("privacy-accepted"));
  expect(dialog()!.getAttribute("aria-labelledby")).toBe("policy-modal-title");
  await driveScrollToEnd();
  await clickElement(dialogButton("I have read it"));
  expect(field("privacy-accepted").checked, "acknowledging must tick the privacy box").toBe(true);
}

async function submit(): Promise<void> {
  const form = document.querySelector("form");
  expect(form, "missing the sign-up form").not.toBeNull();
  await act(async () => {
    form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await settle();
}

async function mount(client?: {
  register: ReturnType<typeof vi.fn>;
  resendVerification: ReturnType<typeof vi.fn>;
}): Promise<void> {
  const stub = client ?? { register: vi.fn(), resendVerification: vi.fn() };
  await act(async () => root!.render(<SignUpFlow client={stub} />));
  await settle();
}

describe("sign-up — the Terms of Service row", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    metrics = { ...TOP };
    stubScrollMetrics();
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    restoreScrollMetrics();
    vi.unstubAllGlobals();
  });

  it("renders three rows — 18+, privacy, terms — in that order, one required box each", async () => {
    await mount();

    const consentRows = rows();
    expect(consentRows).toHaveLength(3);
    const adult = field("adult-affirmed");
    const privacy = field("privacy-accepted");
    const terms = field("terms-accepted");
    expect(consentRows[0]!.contains(adult)).toBe(true);
    expect(consentRows[1]!.contains(privacy)).toBe(true);
    expect(consentRows[2]!.contains(terms)).toBe(true);
    expect(consentRows[2]!.contains(privacy)).toBe(false);
    expect(privacy.compareDocumentPosition(terms) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );

    expect(terms.type).toBe("checkbox");
    expect(terms.required).toBe(true);
    expect(terms.disabled).toBe(false);
    expect(terms.checked).toBe(false);
    expect(document.querySelectorAll("form")).toHaveLength(1);
  });

  it("carries the three sentences verbatim, each control a non-submitting button", async () => {
    await mount();

    const consentRows = rows();
    expect(consentRows[0]!.textContent?.trim()).toBe(ROW_ONE_TEXT);
    expect(consentRows[1]!.textContent?.trim()).toBe(ROW_TWO_TEXT);
    expect(consentRows[2]!.textContent?.trim()).toBe(ROW_THREE_TEXT);

    const policyControl = consentRows[1]!.querySelector(".consentPolicyLink");
    expect(policyControl!.textContent).toBe("Privacy Policy");
    expect(policyControl!.getAttribute("type")).toBe("button");
    const termsControl = consentRows[2]!.querySelector(".consentPolicyLink");
    expect(termsControl, "missing the Terms of Service control").not.toBeNull();
    expect(termsControl!.textContent).toBe("Terms of Service");
    expect(termsControl!.getAttribute("type")).toBe("button");
  });

  it("names the terms box by its own sentence", async () => {
    await mount();

    const labelledBy = field("terms-accepted").getAttribute("aria-labelledby");
    expect(labelledBy, "terms-accepted has no aria-labelledby").not.toBeNull();
    const named = document.getElementById(labelledBy!);
    expect(named, `aria-labelledby="${labelledBy}" names no element`).not.toBeNull();
    expect(named!.textContent?.trim()).toBe(ROW_THREE_TEXT);
    expect(labelledBy).not.toBe(field("privacy-accepted").getAttribute("aria-labelledby"));
  });

  it("opens the Terms — never the policy — from the empty box, and ticks nothing", async () => {
    await mount();

    await clickElement(field("terms-accepted"));

    expectTermsOpen();
    expect(field("terms-accepted").checked, "the box must stay unticked").toBe(false);
    expect(field("privacy-accepted").checked, "the privacy box is untouched").toBe(false);
    expect(createAccountButton().disabled).toBe(true);
  });

  it("opens the Terms from the row's sentence and from the Terms of Service control", async () => {
    await mount();
    const row = rows()[2]!;

    await clickElement(row.querySelector<HTMLElement>(".consentText")!);
    expectTermsOpen();
    expect(field("terms-accepted").checked).toBe(false);
    await clickElement(dialogButton("×"));
    expect(dialog()).toBeNull();

    await clickElement(row.querySelector<HTMLElement>(".consentPolicyLink")!);
    expectTermsOpen();
    expect(field("terms-accepted").checked).toBe(false);
  });

  it("leaves the box empty on every dismissal: the close control, the backdrop, Escape", async () => {
    await mount();

    await clickElement(field("terms-accepted"));
    await clickElement(dialogButton("×"));
    expect(dialog(), "× closes the Terms").toBeNull();
    expect(field("terms-accepted").checked).toBe(false);
    expect(document.activeElement, "focus returns to the terms input").toBe(field("terms-accepted"));

    await clickElement(field("terms-accepted"));
    await clickElement(document.querySelector<HTMLElement>(".policyScrim")!);
    expect(dialog(), "a backdrop click closes the Terms").toBeNull();
    expect(field("terms-accepted").checked).toBe(false);

    await clickElement(field("terms-accepted"));
    await pressEscape();
    expect(dialog(), "Escape closes the Terms").toBeNull();
    expect(field("terms-accepted").checked).toBe(false);
    expect(document.activeElement, "focus returns to the terms input").toBe(field("terms-accepted"));
  });

  it("ticks the box only through I have read it after the end, closes, and returns focus", async () => {
    await mount();

    await acknowledgeTerms();

    expect(document.activeElement, "focus returns to the terms input").toBe(field("terms-accepted"));
  });

  it("unchecks a ticked terms row directly, with no modal", async () => {
    await mount();
    await acknowledgeTerms();

    await clickElement(rows()[2]!.querySelector<HTMLElement>(".consentText")!);

    expect(field("terms-accepted").checked, "the box must uncheck").toBe(false);
    expect(dialog(), "unchecking must open no dialog").toBeNull();
  });

  it("resets the read gate on every reopen of the Terms", async () => {
    await mount();
    await clickElement(field("terms-accepted"));
    await driveScrollToEnd();
    expect(dialogButton("I have read it").disabled).toBe(false);
    await clickElement(dialogButton("×"));

    metrics.scrollTop = TOP.scrollTop;
    await clickElement(field("terms-accepted"));

    expectTermsOpen();
    expect(dialogButton("I have read it").disabled, "disabled again on a fresh read").toBe(true);
    expect(field("terms-accepted").checked).toBe(false);
  });

  it("keeps Create account disabled until all three boxes are ticked", async () => {
    await mount();

    await clickElement(field("adult-affirmed"));
    await acknowledgePolicy();
    expect(field("adult-affirmed").checked).toBe(true);
    expect(field("privacy-accepted").checked).toBe(true);
    expect(createAccountButton().disabled, "two of three boxes: still disabled").toBe(true);

    await acknowledgeTerms();
    expect(createAccountButton().disabled, "all three boxes: enabled").toBe(false);

    await clickElement(rows()[2]!.querySelector<HTMLElement>(".consentText")!);
    expect(field("terms-accepted").checked).toBe(false);
    expect(createAccountButton().disabled, "unticking the Terms disables it again").toBe(true);
  });

  it("refuses a scripted submit with the Terms box empty, and registers with all three ticked", async () => {
    const register = vi.fn().mockResolvedValue({ message: "sent" });
    await mount({ register, resendVerification: vi.fn() });

    field("email").value = "person@example.test";
    field("recovery-email").value = "recovery@example.test";
    field("password").value = "correct horse battery staple";
    field("adult-affirmed").checked = true;
    field("privacy-accepted").checked = true;
    await submit();
    expect(register, "an empty Terms box must refuse the registration").not.toHaveBeenCalled();

    field("terms-accepted").checked = true;
    await submit();
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith(
      "person@example.test",
      "correct horse battery staple",
      "recovery@example.test",
      true
    );
    expect(field("terms-accepted").disabled, "terms-accepted disabled when sent").toBe(true);
  });
});
