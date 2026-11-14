// @vitest-environment jsdom
// Keyboard audit round 4 (2026-11-12), D7: submit buttons natively `disabled` while something is missing, so Tab skipped
// them, Enter in a field did nothing and nothing said why. As on the card change and the checkout, they now stay in the
// Tab order (`aria-disabled`), and a press (or Enter in a field) moves focus to the first thing missing. No new text.
//   - the security check's Confirm: off until the password and all six digits are in;
//   - Change email's Send: off while a box is empty (or not yet right);
//   - Delete account's Schedule deletion: off for a mistyped phrase; once pressed, the box says it is invalid (`aria-invalid`)
//     and is described by the line that tells what to type.
// A completed, valid submission does what it did.
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import auth from "../../apps/ui/messages/en/auth.json";
import settings from "../../apps/ui/messages/en/settings.json";
import { SecurityConfirmation } from "../../apps/ui/components/auth/SecurityConfirmation.js";
import { ChangeEmailScreen } from "../../apps/ui/components/EmailSettings.js";
import { AccountErasureControls } from "../../apps/ui/components/AccountErasureControls.js";

let root: Root | null = null;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { if (root !== null) await act(async () => root!.unmount()); root = null; document.body.replaceChildren(); vi.unstubAllGlobals(); });

async function settle() { await act(async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); }); }
async function mount(node: ReactNode) {
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => { root!.render(node); }); await settle();
}
const named = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((candidate) => candidate.textContent?.trim() === label)!;
/** A keyboard press: the button holds focus, then activates (a submit button submits its form). */
async function press(target: HTMLButtonElement) { target.focus(); await act(async () => { target.click(); }); await settle(); }
/** Enter in a field: the browser submits the form through its default button, if that button can be pressed. */
async function enterIn(field: HTMLInputElement) {
  field.focus();
  await act(async () => {
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    const submitter = field.form!.querySelector<HTMLButtonElement>("button[type=submit]");
    if (submitter !== null && !submitter.disabled) field.form!.requestSubmit(submitter);
  });
  await settle();
}
async function type(field: HTMLInputElement, value: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); });
  await settle();
}
const methods = { methods: [], recovery_codes_remaining: 0, available_step_up_methods: ["password_totp"], step_up_providers: [] };
const grant = (action: string) => ({ status: "step_up_complete", csrf_token: "c".repeat(43), step_up_grant: { action, token: "g".repeat(43), expires_at: new Date(Date.now() + 300_000).toISOString() } });
const expectLocked = (control: HTMLButtonElement) => { expect(control.disabled).toBe(false); expect(control.getAttribute("aria-disabled")).toBe("true"); expect(control.tabIndex).toBe(0); };
const expectOpen = (control: HTMLButtonElement) => { expect(control.disabled).toBe(false); expect(control.getAttribute("aria-disabled")).toBeNull(); };

describe("the security check's Confirm", () => {
  const authorization = { action: "CHANGE_EMAIL" } as const;
  async function open(over: Record<string, unknown> = {}) {
    const client = { authMethods: vi.fn(async () => methods), stepUp: vi.fn(async () => grant("CHANGE_EMAIL")), ...over };
    const confirmed = vi.fn(), cancel = vi.fn();
    await mount(<SecurityConfirmation catalog={auth} client={client as never} authorization={authorization} onConfirmed={confirmed} onCancel={cancel} />);
    await press(named(auth["auth.security.passwordMethod"]));
    const switchOff = () => act(async () => { root!.render(<SecurityConfirmation catalog={auth} client={client as never} authorization={authorization} disabled onConfirmed={confirmed} onCancel={cancel} />); });
    const form = document.querySelector<HTMLFormElement>(".authSecurityConfirmation form")!;
    return {
      client, confirmed, switchOff,
      password: form.querySelector<HTMLInputElement>("[name=security-password]")!,
      code: form.querySelector<HTMLInputElement>("[name=security-code]")!,
      confirm: form.querySelector<HTMLButtonElement>("button[type=submit]")!
    };
  }

  it("stays in the Tab order while locked, and a press with nothing typed goes to the password box", async () => {
    const { confirm, password, client } = await open();
    expectLocked(confirm);
    await press(confirm);
    expect(document.activeElement).toBe(password);
    expect(client.stepUp).not.toHaveBeenCalled();
  });

  it("with the password in, a press goes to the code box; so does Enter in the password box", async () => {
    const { confirm, password, code, client } = await open();
    await type(password, "correct horse");
    await type(code, "123");
    expectLocked(confirm);
    await press(confirm);
    expect(document.activeElement).toBe(code);
    await enterIn(password);
    expect(document.activeElement).toBe(code);
    expect(client.stepUp).not.toHaveBeenCalled();
  });

  it("Enter in the code box with the code but no password goes to the password box", async () => {
    const { password, code, client } = await open();
    await type(code, "123456");
    await enterIn(code);
    expect(document.activeElement).toBe(password);
    expect(client.stepUp).not.toHaveBeenCalled();
  });

  it("complete: Enter in the password box sends the check, as a press does", async () => {
    const { confirm, password, code, client, confirmed } = await open();
    await type(code, "123456");
    await type(password, "correct horse");
    expectOpen(confirm);
    await enterIn(password);
    expect(client.stepUp).toHaveBeenCalledOnce();
    expect(client.stepUp).toHaveBeenCalledWith("correct horse", "123456", { action: "CHANGE_EMAIL" });
    expect(confirmed).toHaveBeenCalledOnce();
  });

  it("switched off by its screen (the `disabled` prop), Confirm stays natively off as before", async () => {
    const { confirm, switchOff } = await open();
    await switchOff();
    expect(confirm.disabled).toBe(true);
  });
});

describe("Change email's Send", () => {
  async function open() {
    const client = { requestEmailChange: vi.fn(), authMethods: vi.fn(async () => methods), stepUp: vi.fn(async () => grant("CHANGE_EMAIL")) };
    await mount(<ChangeEmailScreen client={client as never} catalog={settings} currentEmail="ana.popescu@unibuc.ro" onBack={vi.fn()} onRequested={vi.fn()} />);
    return {
      fresh: document.querySelector<HTMLInputElement>("#email-change-new")!,
      again: document.querySelector<HTMLInputElement>("#email-change-confirm")!,
      send: document.querySelector<HTMLButtonElement>("button.emlSubmit")!
    };
  }

  it("both boxes empty: Send is reachable, and a press goes to the first box, opening nothing", async () => {
    const { fresh, send } = await open();
    expectLocked(send);
    await press(send);
    expect(document.activeElement).toBe(fresh);
    expect(document.querySelector(".authSecurityConfirmation")).toBeNull();
  });

  it("an empty box focus lands on says it is required (round 4 review: it said nothing)", async () => {
    const { fresh, again } = await open();
    expect(fresh.getAttribute("aria-required")).toBe("true");
    expect(again.getAttribute("aria-required")).toBe("true");
    expect(fresh.labels?.length ?? 0, "its label says what goes in it").toBeGreaterThan(0);
    expect(again.labels?.length ?? 0).toBeGreaterThan(0);
  });

  it("the first box filled, the second empty: a press, or Enter in the first box, goes to the second", async () => {
    const { fresh, again, send } = await open();
    await type(fresh, "ana@icub.ro");
    await press(send);
    expect(document.activeElement).toBe(again);
    await enterIn(fresh);
    expect(document.activeElement).toBe(again);
    expect(document.querySelector(".authSecurityConfirmation")).toBeNull();
  });

  it("both right: a press opens the security check, as before", async () => {
    const { fresh, again, send } = await open();
    await type(fresh, "ana@icub.ro");
    await type(again, "ana@icub.ro");
    expectOpen(send);
    await press(send);
    expect(document.querySelector(".authSecurityConfirmation")).not.toBeNull();
  });
});

describe("Delete account's Schedule deletion", () => {
  async function open() {
    const client = { readAccountErasure: vi.fn(async () => ({ status: "NONE" as const })), scheduleAccountErasure: vi.fn(), cancelAccountErasure: vi.fn(), authMethods: vi.fn(async () => methods), stepUp: vi.fn(async () => grant("DELETE_ACCOUNT")) };
    await mount(<AccountErasureControls client={client as never} catalog={settings} locale="en" />);
    return {
      box: document.querySelector<HTMLInputElement>("#account-deletion-confirmation")!,
      schedule: named(settings["settings.erasure.schedule"])
    };
  }
  const phrase = settings["settings.erasure.confirmationPhrase"];

  it("empty: Schedule deletion is reachable, the box is not marked wrong, and a press goes to the box", async () => {
    const { box, schedule } = await open();
    expectLocked(schedule);
    expect(box.getAttribute("aria-invalid")).toBe("false");
    await press(schedule);
    expect(document.activeElement).toBe(box);
    expect(document.querySelector(".authSecurityConfirmation")).toBeNull();
  });

  it("mistyped: a press goes to the box, which then says it is invalid; its own label already says what to type", async () => {
    const { box, schedule } = await open();
    // Round 4 review: not marked wrong while the person is still typing (from the first letter it was).
    await type(box, phrase.slice(0, 2));
    expect(box.getAttribute("aria-invalid")).toBe("false");
    await type(box, `${phrase}x`);
    expect(box.getAttribute("aria-invalid")).toBe("false");
    await press(schedule);
    expect(document.activeElement).toBe(box);
    expect(box.getAttribute("aria-invalid")).toBe("true");
    // The label is the box's name; describing the box by it too read the phrase twice.
    expect(box.getAttribute("aria-describedby")).toBeNull();
    expect(document.getElementById("account-deletion-confirmation-label")?.getAttribute("for")).toBe(box.id);
    expect(document.querySelector(".authSecurityConfirmation")).toBeNull();
    // Typed right afterwards: nothing is marked.
    await type(box, phrase);
    expect(box.getAttribute("aria-invalid")).toBe("false");
  });

  it("typed right: nothing is marked, and a press opens the security check, as before", async () => {
    const { box, schedule } = await open();
    await type(box, phrase);
    expect(box.getAttribute("aria-invalid")).toBe("false");
    expect(box.getAttribute("aria-describedby")).toBeNull();
    expectOpen(schedule);
    await press(schedule);
    expect(document.querySelector(".authSecurityConfirmation")).not.toBeNull();
  });
});
