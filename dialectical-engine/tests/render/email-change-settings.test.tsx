// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ContractHttpError, type ContractClient } from "@debateai/contract";
import {
  ChangeEmailScreen,
  EmailChangeLinkScreen,
  EmailSettingsCard,
  takeEmailChangeLink
} from "../../apps/ui/components/EmailSettings.js";

// Turn 14 — the rendered Email card (14A), its pending state (14C), the change
// form (14B) and the screen a mailed link opens.

type EmailClient = Pick<ContractClient,
  "readAccountEmail" | "requestEmailChange" | "resendEmailChange" | "cancelEmailChange"
  | "stepUp" | "confirmEmailChange" | "cancelEmailChangeByLink">;

const GRANT = "G".repeat(43);
const LINK = "L".repeat(43);
const PENDING = { status: "PENDING" as const, new_email: "ana.popescu@icub.ro", expires_at: "2026-09-29T12:00:00.000Z" };
let root: Root | null = null;

async function settle(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
  });
}

async function mount(node: React.ReactNode): Promise<void> {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root!.render(node); });
  await settle();
}

function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === label);
  expect(found, `missing button ${label}`).toBeDefined();
  return found as HTMLButtonElement;
}

async function click(label: string): Promise<void> {
  await act(async () => { button(label).click(); });
  await settle();
}

async function type(label: string, value: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)
    ?? [...document.querySelectorAll("label")].find((candidate) => candidate.textContent?.trim() === label)
      ?.control as HTMLInputElement | null;
  expect(input, `missing input ${label}`).toBeTruthy();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input!.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

function client(overrides: Partial<EmailClient> = {}): EmailClient {
  return {
    readAccountEmail: vi.fn().mockResolvedValue({
      email: "ana.popescu@unibuc.ro", recovery_email: "a.popescu@proton.me", pending: null
    }),
    requestEmailChange: vi.fn().mockResolvedValue(PENDING),
    resendEmailChange: vi.fn().mockResolvedValue(PENDING),
    cancelEmailChange: vi.fn().mockResolvedValue(undefined),
    stepUp: vi.fn().mockResolvedValue({
      status: "step_up_complete", csrf_token: "c".repeat(43),
      step_up_grant: { token: GRANT, action: "CHANGE_EMAIL", expires_at: "2026-09-28T12:05:00.000Z" }
    }),
    confirmEmailChange: vi.fn().mockResolvedValue({ status: "CONFIRMED" }),
    cancelEmailChangeByLink: vi.fn().mockResolvedValue({ status: "CANCELLED" }),
    ...overrides
  };
}

beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });

afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

describe("Turn 14 Email card (14A / 14C)", () => {
  it("shows the verified address, the recovery address and a Change email action", async () => {
    const onChange = vi.fn();
    await mount(<EmailSettingsCard client={client()} onChange={onChange} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Email");
    expect(text).toContain("✓ Verified");
    expect(text).toContain("ana.popescu@unibuc.ro");
    expect(text).toContain("Recovery: a.popescu@proton.me");
    await click("Change email");
    expect(onChange).toHaveBeenCalledWith("ana.popescu@unibuc.ro");
  });

  it("shows a pending change with both addresses, and resends or cancels it", async () => {
    const api = client({
      readAccountEmail: vi.fn().mockResolvedValue({
        email: "ana.popescu@unibuc.ro", recovery_email: "a.popescu@proton.me",
        pending: { new_email: "ana.popescu@icub.ro", expires_at: PENDING.expires_at }
      })
    });
    await mount(<EmailSettingsCard client={api} onChange={vi.fn()} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Change pending");
    expect(text).toContain("CURRENT");
    expect(text).toContain("NEW");
    expect(text).toContain("ana.popescu@icub.ro");
    expect(text).toContain("We sent a confirmation link to the new address. It expires in 24 hours.");
    expect(text).not.toContain("Change email");
    await click("Resend link");
    expect(api.resendEmailChange).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("A new confirmation link is on its way.");
    await click("Cancel change");
    expect(api.cancelEmailChange).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain("Change pending");
    expect(document.body.textContent).toContain("The change was cancelled. Your email stays the same.");
  });

  it("says when a resend comes too soon", async () => {
    const api = client({
      readAccountEmail: vi.fn().mockResolvedValue({
        email: "ana.popescu@unibuc.ro", recovery_email: "a.popescu@proton.me",
        pending: { new_email: "ana.popescu@icub.ro", expires_at: PENDING.expires_at }
      }),
      resendEmailChange: vi.fn().mockRejectedValue(
        new ContractHttpError("RATE_LIMITED", 429, "RESEND_COOLDOWN", "RESEND_COOLDOWN"))
    });
    await mount(<EmailSettingsCard client={api} onChange={vi.fn()} />);
    await click("Resend link");
    expect(document.body.textContent).toContain("Wait a minute before sending another link.");
  });
});

describe("Turn 14 change form (14B)", () => {
  it("validates the new address and its confirmation before it can be sent", async () => {
    await mount(<ChangeEmailScreen client={client()} currentEmail="ana.popescu@unibuc.ro"
      onBack={vi.fn()} onRequested={vi.fn()} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("ACCOUNT EMAIL");
    expect(text).toContain("Change your email");
    expect(text).toContain("Your current address keeps working until you confirm the new one.");
    expect(text).toContain("ana.popescu@unibuc.ro");
    await type("New email", "ana.popescu@icub.ro");
    expect(document.body.textContent).toContain("✓ Valid address");
    await type("Confirm new email", "ana.popescu@icub.com");
    expect(document.body.textContent).toContain("✗ Doesn't match the new email");
    expect(button("Send confirmation link").disabled).toBe(true);
    await type("New email", "ANA.POPESCU@unibuc.ro");
    expect(document.body.textContent).toContain("✗ This is already your email");
  });

  it("steps up for CHANGE_EMAIL, spends the grant on the request and hands back the pending change", async () => {
    const api = client();
    const onRequested = vi.fn();
    await mount(<ChangeEmailScreen client={api} currentEmail="ana.popescu@unibuc.ro"
      onBack={vi.fn()} onRequested={onRequested} />);
    await type("New email", "ana.popescu@icub.ro");
    await type("Confirm new email", "ana.popescu@icub.ro");
    await type("Password", "correct horse");
    await type("6-digit code", "123456");
    await click("Send confirmation link");
    expect(api.stepUp).toHaveBeenCalledWith("correct horse", "123456", { action: "CHANGE_EMAIL" });
    expect(api.requestEmailChange).toHaveBeenCalledWith("ana.popescu@icub.ro", GRANT);
    expect(onRequested).toHaveBeenCalledWith(PENDING);
  });

  it("reports refused credentials and never sends the request", async () => {
    const api = client({
      stepUp: vi.fn().mockRejectedValue(new ContractHttpError("SESSION_REQUIRED", 401, "AUTH_CREDENTIALS_INVALID"))
    });
    await mount(<ChangeEmailScreen client={api} currentEmail="ana.popescu@unibuc.ro"
      onBack={vi.fn()} onRequested={vi.fn()} />);
    await type("New email", "ana.popescu@icub.ro");
    await type("Confirm new email", "ana.popescu@icub.ro");
    await type("Password", "wrong");
    await type("6-digit code", "000000");
    await click("Send confirmation link");
    expect(document.body.textContent).toContain("Your password or authenticator code was not accepted.");
    expect(api.requestEmailChange).not.toHaveBeenCalled();
  });

  it("goes back to Settings", async () => {
    const onBack = vi.fn();
    await mount(<ChangeEmailScreen client={client()} currentEmail="ana.popescu@unibuc.ro"
      onBack={onBack} onRequested={vi.fn()} />);
    await click("‹ Settings");
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("Turn 14 mailed links", () => {
  it("takes the bearer from the fragment once and scrubs it from the address bar", () => {
    window.history.replaceState(null, "", `/settings#email-change=confirm&token=${LINK}`);
    expect(takeEmailChangeLink(window)).toEqual({ action: "confirm", token: LINK });
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/settings");
    expect(takeEmailChangeLink(window)).toBeNull();
    window.history.replaceState(null, "", "/settings#email-change=steal&token=x");
    expect(takeEmailChangeLink(window)).toBeNull();
  });

  it("confirms by the link and says what happens next", async () => {
    const api = client();
    await mount(<EmailChangeLinkScreen client={api} link={{ action: "confirm", token: LINK }} onDone={vi.fn()} />);
    expect(api.confirmEmailChange).toHaveBeenCalledTimes(1);
    expect(api.confirmEmailChange).toHaveBeenCalledWith(LINK);
    expect(document.body.textContent).toContain("Email confirmed");
    expect(document.body.textContent).toContain("Use your new address the next time you sign in.");
  });

  it("cancels by the link", async () => {
    const api = client();
    await mount(<EmailChangeLinkScreen client={api} link={{ action: "cancel", token: LINK }} onDone={vi.fn()} />);
    expect(api.cancelEmailChangeByLink).toHaveBeenCalledWith(LINK);
    expect(document.body.textContent).toContain("Change cancelled");
  });

  it("names an expired link and a used one differently", async () => {
    const expired = client({
      confirmEmailChange: vi.fn().mockRejectedValue(new ContractHttpError("NOT_FOUND", 410, "LINK_EXPIRED", "LINK_EXPIRED"))
    });
    await mount(<EmailChangeLinkScreen client={expired} link={{ action: "confirm", token: LINK }} onDone={vi.fn()} />);
    expect(document.body.textContent).toContain("This link has expired");
    await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    const used = client({
      confirmEmailChange: vi.fn().mockRejectedValue(new ContractHttpError("NOT_FOUND", 404, "LINK_INVALID", "LINK_INVALID"))
    });
    await mount(<EmailChangeLinkScreen client={used} link={{ action: "confirm", token: LINK }} onDone={vi.fn()} />);
    expect(document.body.textContent).toContain("This link no longer works");
  });

  it("mounts the Email card and the link screen on the live Settings page", async () => {
    const page = await readFile(resolve(process.cwd(), "apps/ui/components/SettingsPageClient.tsx"), "utf8");
    expect(page).toContain("<EmailSettingsCard");
    expect(page).toContain("<ChangeEmailScreen");
    expect(page).toContain("<EmailChangeLinkScreen");
    expect(page.indexOf("<EmailSettingsCard")).toBeLessThan(page.indexOf("<SessionControls"));
  });
});
