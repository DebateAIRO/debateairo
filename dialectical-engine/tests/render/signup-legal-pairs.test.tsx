// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { SignUpFlow } from "../../apps/ui/components/SignUpFlow.js";
import { PRIVACY_POLICY } from "../../apps/ui/lib/privacyPolicy.js";
import { TERMS_OF_SERVICE } from "../../apps/ui/lib/termsOfService.js";
import { DISPLAYED_LEGAL_EN } from "../support/signupLegal.js";
import { pickRegion } from "../support/signupRegion.js";

let root: Root | null = null;
const checkAge = vi.fn();

function field(name: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  expect(input, `missing ${name}`).not.toBeNull();
  return input!;
}

/* The age gate's date of birth is React state, so it is typed the way React sees it (the prototype value
   setter plus an `input` event), FIRST: its re-renders would reset the fields assigned directly below
   (the idiom of tests/render/register-form-f1-verify-button.test.tsx). */
async function type(name: string, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field(name), value);
    field(name).dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function fillAndSubmit(): Promise<void> {
  await type("dob-d", "01");
  await type("dob-m", "01");
  await type("dob-y", "1990");
  await pickRegion("RO");
  field("email").value = "person@example.test";
  field("confirm-email").value = "person@example.test";
  field("recovery-email").value = "recovery@example.test";
  field("password").value = "correct horse battery staple";
  field("confirm-password").value = "correct horse battery staple";
  field("privacy-accepted").checked = true;
  field("terms-accepted").checked = true;
  const form = document.querySelector<HTMLFormElement>('form[data-form="signup"]')!;
  await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  await act(async () => { await Promise.resolve(); });
}

describe("sign-up sends the pairs of the documents it displayed (paid plans L3b)", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    checkAge.mockReset().mockResolvedValue({ outcome: "allowed" });
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

  it("passes the Terms and Privacy version and hash, and the locale, after the age gate's date", async () => {
    const register = vi.fn().mockResolvedValue({ message: "ok" });
    await act(async () => root!.render(<SignUpFlow client={{ register, checkAge }} />));
    await fillAndSubmit();
    expect(checkAge).toHaveBeenCalledWith("1990-01-01");
    expect(register).toHaveBeenCalledWith(
      "person@example.test", "correct horse battery staple", "recovery@example.test", "1990-01-01",
      {
        terms: { version: TERMS_OF_SERVICE.version, sha256: TERMS_OF_SERVICE.sha256 },
        privacy: { version: PRIVACY_POLICY.version, sha256: PRIVACY_POLICY.sha256 },
        locale: "en"
      },
      { country: "RO", usState: null }
    );
    // The shared fixture the four pinned render tests use is exactly this argument.
    expect(register.mock.calls[0]![4]).toEqual(DISPLAYED_LEGAL_EN);
  });

  it("says the documents changed, withdraws both acknowledgements and offers the reload, on LEGAL_DOCUMENT_STALE", async () => {
    const register = vi.fn().mockRejectedValue(
      new ContractHttpError("SERVER_FAILURE", 409, "LEGAL_DOCUMENT_STALE", "LEGAL_DOCUMENT_STALE")
    );
    const reloadPage = vi.fn();
    await act(async () => root!.render(<SignUpFlow client={{ register, checkAge }} reloadPage={reloadPage} />));
    await fillAndSubmit();
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      "The Terms of Service or the Privacy Policy were updated while you were reading. Reload the page to read the current version, then try again."
    );
    // Spec §2.3.2: "The UI then reloads the document." The documents ship with the page, so the page
    // is what reloads; until then the stale acknowledgements cannot be sent again.
    expect(field("privacy-accepted").checked).toBe(false);
    expect(field("terms-accepted").checked).toBe(false);
    // The age gate's answer stands: the date is kept, and the age refusal screen is not shown.
    expect(field("dob-y").value).toBe("1990");
    expect(document.querySelector('form[data-form="signup"]')).not.toBeNull();
    const reload = [...document.querySelectorAll<HTMLButtonElement>("button")]
      .filter((node) => node.textContent === "Reload the page");
    expect(reload).toHaveLength(1);
    await act(async () => { reload[0]!.click(); });
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it("offers no reload for any other failure", async () => {
    const register = vi.fn().mockRejectedValue(new Error("offline"));
    await act(async () => root!.render(<SignUpFlow client={{ register, checkAge }} reloadPage={vi.fn()} />));
    await fillAndSubmit();
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("Account creation could not be completed.");
    expect([...document.querySelectorAll("button")].some((node) => node.textContent === "Reload the page")).toBe(false);
  });

  it("never calls register when the age gate refuses, so no document pair is sent", async () => {
    checkAge.mockResolvedValue({ outcome: "refused" });
    const register = vi.fn();
    await act(async () => root!.render(<SignUpFlow client={{ register, checkAge }} />));
    await fillAndSubmit();
    expect(register).not.toHaveBeenCalled();
  });
});
