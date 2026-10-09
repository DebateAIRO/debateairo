// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailPendingScreen } from "../../apps/ui/components/auth/EmailPendingScreen.js";
import english from "../../apps/ui/messages/en/auth.json";
import type { TurnstileRenderOptions } from "../../apps/ui/lib/turnstile.js";
import { RESEND_VERIFICATION_PUBLIC_MESSAGE } from "@debateai/contract";
let host: HTMLDivElement; let root: Root; let options: TurnstileRenderOptions; let resets: number;
const requests: unknown[] = [];
let response: () => Promise<{ message: typeof RESEND_VERIFICATION_PUBLIC_MESSAGE; retry_after_seconds: 60 }>;
const ack = { message: RESEND_VERIFICATION_PUBLIC_MESSAGE, retry_after_seconds: 60 as const };
const button = () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(b => b.dataset.action === "resend")!;
async function render(config = { siteKey: "1x00000000000000000000AA", nonce: "abcdefghijklmnopqrstuv==" }) {
  await act(async () => root.render(<EmailPendingScreen email="person@example.test" retryAfterSeconds={60} client={{ resendVerification: async (request: unknown) => { requests.push(request); return response(); } } as never} catalog={english} locale="ro" turnstile={config} onDifferentEmail={() => { requests.push("different"); }} />));
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-04T12:00:00Z")); requests.length = 0; resets = 0; response = async () => ack;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  window.turnstile = { render: (container, config) => { options = config; container.append(document.createElement("iframe")); return "widget"; }, reset: () => { resets++; }, remove: () => host.querySelector("iframe")?.remove() };
});
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); delete window.turnstile; document.body.replaceChildren(); document.head.querySelectorAll("script[data-turnstile]").forEach(s => s.remove()); vi.unstubAllGlobals(); });
describe("email waiting screen", () => {
  it("keeps resend disabled through second59 and enables at60 with fresh proof", async () => {
    await render(); await act(async () => options.callback("first-proof"));
    await act(async () => vi.advanceTimersByTimeAsync(59_000)); expect(button().disabled).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(999)); expect(button().disabled).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(1)); expect(button().disabled).toBe(false);
    expect(host.textContent).toContain("person@example.test"); expect(host.querySelector("input[type=password]")).toBeNull();
    expect((host.querySelector('[aria-live]')?.textContent ?? "")).not.toMatch(/59|58|57/);
  });
  it("recalculates elapsed time after backgrounding instead of counting missed timer callbacks", async () => {
    await render(); await act(async () => options.callback("proof"));
    vi.setSystemTime(new Date("2026-10-04T12:02:00Z"));
    await act(async () => document.dispatchEvent(new Event("visibilitychange"))); expect(button().disabled).toBe(false);
  });
  it("admits one request per click burst, resets proof and starts a new generic ACK cooldown", async () => {
    await render(); await act(async () => options.callback("proof-one")); await act(async () => vi.advanceTimersByTimeAsync(60_000));
    let resolve!: (acknowledgement: typeof ack) => void; response = () => new Promise(done => { resolve = done; });
    await act(async () => { button().click(); button().click(); }); expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ email: "person@example.test", locale: "ro", ui_locale: "ro", turnstile_token: "proof-one" });
    expect(options.action).toBe("resend-verification"); expect(button().disabled).toBe(true);
    await act(async () => resolve(ack)); expect(resets).toBe(1);
    await act(async () => vi.advanceTimersByTimeAsync(60_000)); expect(button().disabled).toBe(true);
    await act(async () => options.callback("proof-two")); expect(button().disabled).toBe(false);
    expect(host.textContent).not.toMatch(/successfully sent|delivered|account exists/i);
  });
  it("requires fresh proof after an outage and keeps errors concise without server details", async () => {
    await render(); await act(async () => options.callback("proof")); await act(async () => vi.advanceTimersByTimeAsync(60_000));
    response = async () => { throw new Error("sensitive upstream provider diagnostic"); };
    await act(async () => button().click()); expect(resets).toBe(1); expect(button().disabled).toBe(true);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("We could not request another email. Try again shortly.");
    expect(host.textContent).not.toContain("diagnostic");
    await act(async () => options.callback("new-proof")); expect(button().disabled).toBe(false);
  });
  it("fails closed without configuration and offers address correction", async () => {
    await render({ siteKey: "", nonce: "" }); await act(async () => vi.advanceTimersByTimeAsync(60_000)); expect(button().disabled).toBe(true);
    const different = [...host.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Use a different email")!;
    await act(async () => different.click()); expect(requests).toEqual(["different"]);
  });
  /*
   * PR #95 CI red (2026-10-09): taking the live region off the sentence (so the sign-in resend entry is not
   * read twice) also took it off sign-up's "If this address can be registered…", which nothing else says.
   * After sign-up that sentence is the submit's outcome, a status message; the resend entry's sentence is
   * an instruction until a send, and the send is said once, by the form announcer.
   */
  it("after sign-up, says the sent sentence as a status message", async () => {
    await render();
    const sentence = [...host.querySelectorAll("p")].find(p => p.textContent === english["auth.signUp.registrationSent"]);
    expect(sentence?.getAttribute("role")).toBe("status");
  });
  it("on the sign-in resend entry, says a send once, through the announcer only", async () => {
    const sent = english["auth.pending.resendSent"];
    await act(async () => root.render(<EmailPendingScreen email="person@example.test" retryAfterSeconds={0} client={{ resendVerification: async () => ack } as never} catalog={english} locale="en" turnstile={{ siteKey: "1x00000000000000000000AA", nonce: "abcdefghijklmnopqrstuv==" }}
      notice={english["auth.pending.resendNotice"]} context={{ eyebrow: "e", title: "t", action: "Send email", sent }} onDifferentEmail={() => undefined} />));
    const live = () => [...host.querySelectorAll('[aria-live], [role="status"], [role="alert"]')];
    expect(live().map(region => region.textContent)).not.toContain(english["auth.pending.resendNotice"]);
    await act(async () => options.callback("proof")); await act(async () => button().click()); await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(live().filter(region => region.textContent === sent)).toHaveLength(1);
  });
});
