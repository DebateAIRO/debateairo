// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AGE_REFUSAL_COOKIE_NAME, AGE_REFUSAL_COOKIE_VALUE, ContractHttpError } from "@debateai/contract";
import { SignUpFlow } from "../../apps/ui/components/SignUpFlow.js";

const mocks = vi.hoisted(() => ({ availability: vi.fn(), cookies: new Map<string, string>() }));
vi.mock("@/lib/serverApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/serverApi.js")>()),
  createServerContractClient: () => ({ getGeoAvailability: mocks.availability })
}));
// The page reads the age gate's lockout cookie (PR #41); each case sets exactly the cookies it needs.
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (mocks.cookies.has(name) ? { value: mocks.cookies.get(name)! } : undefined)
  }),
  headers: async () => new Headers({ "user-agent": "vitest-render-browser" })
}));

import SignUpPage from "../../apps/ui/app/sign-up/page.js";

const G1 = "DebateAI isn't available in your country yet.";
let root: Root | null = null;

async function mount(element: ReactElement): Promise<void> {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(element));
  await act(async () => { for (let index = 0; index < 4; index += 1) await Promise.resolve(); });
}

describe("sign-up says the country is not open, instead of the form (paid plans G3b, sentence G1)", () => {
  beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    mocks.availability.mockReset();
    mocks.cookies.clear();
    vi.unstubAllGlobals();
  });

  it("shows G1 and no form when sign-up is closed for this visitor", async () => {
    mocks.availability.mockResolvedValue({ signup: false, pay: false });
    await mount(await SignUpPage());
    expect(document.body.textContent).toContain(G1);
    expect(document.querySelector('form[data-form="signup"]')).toBeNull();
  });

  it("shows the form when sign-up is open, and when the check itself fails", async () => {
    mocks.availability.mockResolvedValue({ signup: true, pay: false });
    await mount(await SignUpPage());
    expect(document.querySelector('form[data-form="signup"]')).not.toBeNull();
    await act(async () => root!.unmount());
    mocks.availability.mockRejectedValue(new Error("unreachable"));
    await mount(await SignUpPage());
    expect(document.querySelector('form[data-form="signup"]')).not.toBeNull();
  });

  it("keeps the age lockout first: while it lasts the refusal is all the browser sees, and nothing is asked (8j)", async () => {
    mocks.cookies.set(AGE_REFUSAL_COOKIE_NAME, AGE_REFUSAL_COOKIE_VALUE);
    mocks.availability.mockResolvedValue({ signup: false, pay: false });
    await mount(await SignUpPage());
    expect(mocks.availability).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(G1);
    expect(document.querySelector('form[data-form="signup"]')).toBeNull();
  });

  it("shows G1 when the registration itself is refused for the country", async () => {
    const register = vi.fn().mockRejectedValue(
      new ContractHttpError("FORBIDDEN", 403, "COUNTRY_SIGNUP_UNAVAILABLE", "COUNTRY_SIGNUP_UNAVAILABLE")
    );
    const checkAge = vi.fn().mockResolvedValue({ outcome: "allowed" });
    await mount(<SignUpFlow client={{ register, checkAge }} />);
    const field = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
    // The age gate's date is React state: typed first, through the value setter and an `input` event.
    for (const [name, value] of [["dob-d", "01"], ["dob-m", "01"], ["dob-y", "1990"]] as const) {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field(name), value);
        field(name).dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    field("email").value = "person@example.test";
    field("confirm-email").value = "person@example.test";
    field("recovery-email").value = "recovery@example.test";
    field("password").value = "correct horse battery staple";
    field("confirm-password").value = "correct horse battery staple";
    for (const box of ["privacy-accepted", "terms-accepted"]) field(box).checked = true;
    await act(async () => {
      document.querySelector<HTMLFormElement>('form[data-form="signup"]')!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await act(async () => { await Promise.resolve(); });
    expect(register).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(G1);
  });
});
