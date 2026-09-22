// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignUpFlow } from "../apps/ui/components/SignUpFlow.js";
let root: Root | null = null;
const f = (n: string) => document.querySelector<HTMLInputElement>(`input[name="${n}"]`)!;
describe("materiality of type=button on the policy control", () => {
  beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const c = document.createElement("div"); document.body.append(c); root = createRoot(c); });
  afterEach(async () => { if (root) await act(async () => root!.unmount()); root = null;
    document.body.replaceChildren(); vi.unstubAllGlobals(); });
  it("both boxes ticked, then the Privacy Policy control is clicked", async () => {
    const register = vi.fn().mockResolvedValue({ message: "ok" });
    await act(async () => root!.render(<SignUpFlow client={{ register, resendVerification: vi.fn() }} />));
    f("email").value = "person@example.test"; f("recovery-email").value = "r@example.test";
    f("password").value = "correct horse battery staple";
    await act(async () => { f("adult-affirmed").click(); });
    await act(async () => { f("privacy-accepted").click(); });
    const ctl = document.querySelector<HTMLButtonElement>(".consentPolicyLink")!;
    console.log("policy control type =", ctl.type);
    await act(async () => { ctl.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    console.log("register called times =", register.mock.calls.length);
    expect(register, "clicking Privacy Policy must never create the account").not.toHaveBeenCalled();
  });
});
