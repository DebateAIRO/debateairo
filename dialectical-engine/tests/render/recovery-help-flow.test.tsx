// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRecoveryPermitClient } from "../../packages/contract/src/mfa-recovery.js";
import { RecoveryHelpFlow } from "../../apps/ui/components/auth/RecoveryHelpFlow.js";
import { RecoveryFlow } from "../../apps/ui/components/auth/RecoveryFlow.js";
import { formatDateAndTime } from "../../apps/ui/lib/i18n/translate.js";
import auth from "../../apps/ui/messages/en/auth.json";

/**
 * /recover/help: a locked-out person with no saved recovery code asks the Owner for help. The page talks to the API
 * through the real client over a fake server, so each case reads the bodies that would reach it and the refusals it
 * would send. The set-up after the finish link is /recover's own (evidence, then a new sign-in method): those two
 * pieces are stood in here so the test sees exactly the authority they are given; the new recovery codes step uses
 * the real Settings confirmation over a stubbed account client.
 */
const seen = vi.hoisted(() => ({ evidence: null as null | Record<string, unknown>, enrollment: null as null | Record<string, unknown> }));
vi.mock("../../apps/ui/components/auth/OnboardingEvidence.js", () => ({
  OnboardingEvidence: (props: Record<string, unknown> & { onReady: () => void }) => { seen.evidence = props; return <button type="button" data-stub="evidence" onClick={props.onReady}>evidence done</button>; }
}));
vi.mock("../../apps/ui/components/auth/SecurityEnrollment.js", () => ({
  SecurityEnrollment: (props: Record<string, unknown> & { onAuthenticated: (value: unknown) => void; onExpired: () => void }) => {
    seen.enrollment = props;
    return <><button type="button" data-stub="enrolled" onClick={() => props.onAuthenticated({ status: "authenticated" })}>passkey made</button><button type="button" data-stub="enroll-expired" onClick={props.onExpired}>enrolment ran out</button></>;
  }
}));

const S = auth as Readonly<Record<string, string>>;
const say = (key: string) => S[`auth.recoveryHelp.${key}`]!;
const LINK = "L".repeat(43), CAP = "C".repeat(43);
const generic = { message: "If this account can be recovered, instructions will arrive through an eligible channel." };

type Call = Readonly<{ path: string; body: Record<string, unknown> | null }>;
type Answer = Readonly<{ status: number; body: unknown }>;
/** The API's recovery-permit routes: each path answers from its queue, the last answer repeating. */
function server(answers: Record<string, Answer[]>) {
  const calls: Call[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(/^\/api\/v1\/auth\/recovery-permit\//u, "");
    calls.push({ path, body: typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : null });
    const queue = answers[path];
    if (!queue?.length) return Response.json({ error: "UNEXPECTED" }, { status: 500 });
    const answer = queue.length > 1 ? queue.shift()! : queue[0]!;
    return Response.json(answer.body, { status: answer.status });
  }) as typeof fetch;
  return { calls, client: createRecoveryPermitClient(fetcher, "/api") };
}
const ok = (body: unknown, status = 200): Answer => ({ status, body });
const refuse = (status: number, error: string): Answer => ({ status, body: { error } });
const opened = (ms = 300_000) => ({ status: "RECOVERY_ENROLL_ONLY", available_methods: ["passkey", "totp"], totp_unavailable_reason: null, recovery_capability: CAP, expires_at: new Date(Date.now() + ms).toISOString() });

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  seen.evidence = null; seen.enrollment = null;
});
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); window.history.replaceState(null, "", "/"); });

async function open(api: ReturnType<typeof server>, hash = "", props: Record<string, unknown> = {}) {
  window.history.replaceState(null, "", `/recover/help${hash}`);
  await act(async () => { root.render(<RecoveryHelpFlow catalog={auth} locale="en" client={api.client} {...props}/>); for (let turn = 0; turn < 6; turn++) await Promise.resolve(); });
}
const text = () => host.textContent ?? "";
const button = (label: string) => [...host.querySelectorAll("button")].find(item => item.textContent?.trim() === label);
async function type(selector: string, value: string) {
  const field = host.querySelector<HTMLInputElement>(selector)!;
  expect(field, selector).not.toBeNull();
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function submit() { await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); }
async function press(label: string) { const found = button(label); expect(found, label).toBeDefined(); await act(async () => found!.click()); }
const alert = () => host.querySelector('[role="alert"]')?.textContent ?? null;
const password = () => host.querySelector<HTMLInputElement>("#recover-help-password");

describe("asking for a link", () => {
  it("shows the same sentence for any address and sends only the address", async () => {
    const api = server({ start: [ok(generic, 202)] });
    for (const address of ["someone@example.com", "nobody-here@example.org"]) {
      // A fresh visit for each address.
      await act(async () => root.unmount());
      root = createRoot(host);
      await open(api);
      expect(host.querySelector("#auth-title")?.textContent).toBe(say("start.title"));
      await type("#recover-help-email", `  ${address} `);
      await submit();
      expect(host.querySelector('[role="status"]')?.textContent).toBe(say("sent.status"));
      expect(text()).toContain(say("sent.title"));
      expect(text()).not.toContain(address);
    }
    expect(api.calls.map(call => [call.path, call.body])).toEqual([["start", { email: "someone@example.com" }], ["start", { email: "nobody-here@example.org" }]]);
  });
  it("after a server error does not claim anything was sent, and keeps the form", async () => {
    const api = server({ start: [refuse(503, "RECOVERY_PERMIT_UNAVAILABLE")] });
    await open(api);
    await type("#recover-help-email", "someone@example.com");
    await submit();
    expect(alert()).toBe(say("start.failed"));
    expect(text()).not.toContain(say("sent.status"));
    expect(host.querySelector("#recover-help-email")).not.toBeNull();
  });
  it("too many tries says to wait", async () => {
    const api = server({ start: [refuse(429, "RECOVERY_PERMIT_RATE_LIMITED")] });
    await open(api);
    await type("#recover-help-email", "someone@example.com");
    await submit();
    expect(alert()).toBe(say("rateLimited"));
  });
  it("asks the server nothing for something that is not an address, and ties the error to the field", async () => {
    const api = server({});
    await open(api);
    await type("#recover-help-email", "not an address");
    await submit();
    const field = host.querySelector<HTMLInputElement>("#recover-help-email")!;
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(field.getAttribute("aria-describedby")?.split(" ")).toContain("recover-help-error");
    expect(alert()).toBe(S["auth.invalidEmail"]);
    expect(api.calls).toEqual([]);
  });
});

describe("the emailed link", () => {
  it("takes the link out of the address bar, asks for the password, and a wrong password keeps the form with the error on the field", async () => {
    const api = server({ request: [refuse(401, "RECOVERY_PERMIT_PROOF_INVALID"), ok({ status: "requested" })] });
    await open(api, `#token=${LINK}`);
    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain(LINK);
    expect(host.querySelector("#auth-title")?.textContent).toBe(say("request.title"));
    await type("#recover-help-password", "wrong one");
    await submit();
    expect(alert()).toBe(say("wrongPassword"));
    expect(password()).not.toBeNull();
    expect(password()!.getAttribute("aria-invalid")).toBe("true");
    expect(password()!.getAttribute("aria-describedby")?.split(" ")).toEqual(["recover-help-password-hint", "recover-help-error"]);
    expect(document.activeElement).toBe(password());
    await type("#recover-help-password", "right one");
    await submit();
    expect(api.calls.map(call => [call.path, call.body])).toEqual([["request", { token: LINK, password: "wrong one" }], ["request", { token: LINK, password: "right one" }]]);
    expect(host.querySelector("#auth-title")?.textContent).toBe(say("requested.title"));
    expect(text()).toContain(say("requested.description"));
    expect(text()).toContain(say("requested.next"));
    expect(password()).toBeNull();
    // A new step: focus is on its headline.
    expect(document.activeElement?.id).toBe("auth-title");
  });
  it("a link the server no longer takes is one generic sentence, with no reason", async () => {
    const api = server({ request: [refuse(410, "RECOVERY_PERMIT_INVALID")] });
    await open(api, `#token=${LINK}`);
    await type("#recover-help-password", "secret");
    await submit();
    expect(host.querySelector("#auth-title")?.textContent).toBe(say("invalid.title"));
    expect(text()).toContain(say("invalid.description"));
    expect(text()).not.toContain("RECOVERY_PERMIT");
    expect(password()).toBeNull();
    await press(say("invalid.button"));
    expect(host.querySelector("#recover-help-email")).not.toBeNull();
  });
  it.each(["#token=short", `#other=${LINK}`, `#token=${LINK}&cancel=${LINK}`])("a link that is not one of ours (%s) is the same generic sentence, and nothing is sent", async hash => {
    const api = server({});
    await open(api, hash);
    expect(text()).toContain(say("invalid.description"));
    expect(api.calls).toEqual([]);
  });
  it("a cancel link cancels as the page opens and says so", async () => {
    const api = server({ cancel: [ok({ status: "cancelled" })] });
    await open(api, `#cancel=${LINK}`);
    expect(api.calls.map(call => [call.path, call.body])).toEqual([["cancel", { token: LINK }]]);
    expect(host.querySelector("#auth-title")?.textContent).toBe(say("cancelled.title"));
    expect(text()).toContain(say("cancelled.description"));
    expect(text()).toContain(say("cancelled.next"));
    expect(window.location.hash).toBe("");
  });
  it("under StrictMode the cancel link is sent once", async () => {
    const api = server({ cancel: [ok({ status: "cancelled" })] });
    window.history.replaceState(null, "", `/recover/help#cancel=${LINK}`);
    await act(async () => { root.render(<StrictMode><RecoveryHelpFlow catalog={auth} locale="en" client={api.client}/></StrictMode>); for (let turn = 0; turn < 6; turn++) await Promise.resolve(); });
    expect(api.calls.map(call => call.path)).toEqual(["cancel"]);
    expect(host.querySelector("#auth-title")?.textContent).toBe(say("cancelled.title"));
  });
  it("a cancel that did not go through says so and offers to try again", async () => {
    const api = server({ cancel: [refuse(503, "RECOVERY_PERMIT_UNAVAILABLE"), ok({ status: "cancelled" })] });
    await open(api, `#cancel=${LINK}`);
    expect(alert()).toBe(say("failed"));
    expect(text()).not.toContain(say("cancelled.title"));
    await press(say("retry"));
    expect(host.querySelector("#auth-title")?.textContent).toBe(say("cancelled.title"));
  });
});

describe("the finish link", () => {
  it("while the 72 hours run, says from when it works and asks for no password", async () => {
    const notBefore = "2026-11-27T10:00:00.000Z";
    const api = server({ "finish/status": [ok({ status: "waiting", not_before: notBefore })] });
    await open(api, `#finish=${LINK}`);
    expect(api.calls.map(call => [call.path, call.body])).toEqual([["finish/status", { token: LINK }]]);
    expect(host.querySelector("#auth-title")?.textContent).toBe(say("finishWait.title"));
    expect(text()).toContain(say("finishWait.when").replace("{date}", formatDateAndTime("en", notBefore)));
    expect(password()).toBeNull();
  });
  it("when ready, asks for the password, then runs evidence, a new sign-in method and new recovery codes", async () => {
    const done = vi.fn();
    const grant = { status: "step_up_complete", csrf_token: "c".repeat(43), step_up_grant: { action: "REGENERATE_RECOVERY_CODES", token: "g".repeat(43), expires_at: new Date(Date.now() + 300_000).toISOString() } };
    const account = {
      authMethods: vi.fn().mockResolvedValue({ methods: [], recovery_codes_remaining: 0, available_step_up_methods: ["password_totp"], step_up_providers: [] }),
      stepUp: vi.fn().mockResolvedValue(grant),
      regenerateRecoveryCodes: vi.fn().mockResolvedValue({ codes: ["AAAA-BBBB-CCCC-DDDD", "EEEE-FFFF-GGGG-HHHH"] })
    };
    const capability = opened();
    const api = server({ "finish/status": [ok({ status: "ready_to_finish", expires_at: capability.expires_at })], finish: [refuse(401, "RECOVERY_PERMIT_PROOF_INVALID"), ok(capability)] });
    const ended = vi.fn();
    window.addEventListener("debateai:staff-session-ended", ended);
    try {
      await open(api, `#finish=${LINK}`, { accountClient: account, onDone: done });
      expect(host.querySelector("#auth-title")?.textContent).toBe(say("finish.title"));
      await type("#recover-help-password", "wrong");
      await submit();
      expect(alert()).toBe(say("wrongPassword"));
      expect(password()!.getAttribute("aria-invalid")).toBe("true");
      await type("#recover-help-password", "right");
      await submit();
      expect(api.calls.filter(call => call.path === "finish").map(call => call.body)).toEqual([{ token: LINK, password: "wrong" }, { token: LINK, password: "right" }]);
      expect(ended).toHaveBeenCalledOnce();
      // The same first piece /recover shows after a saved code, with the same authority.
      expect(seen.evidence).toMatchObject({ authority: { kind: "recovery", token: CAP }, locale: "en", client: account });
      expect(seen.enrollment).toBeNull();
      await press("evidence done");
      expect(seen.enrollment).toMatchObject({ client: account, authority: { kind: "recovery", token: CAP, expiresAt: capability.expires_at, availableMethods: ["passkey", "totp"], totpUnavailableReason: null } });
      expect(done).not.toHaveBeenCalled();
      await press("passkey made");
      // Signed in: new recovery codes, with a fresh proof from the method just made.
      expect(host.querySelector("#auth-title")?.textContent).toBe(say("codes.title"));
      expect(account.authMethods).toHaveBeenCalled();
      await press(S["auth.security.passwordMethod"]!);
      await type('input[name="security-password"]', "right");
      await type('input[name="security-code"]', "123456");
      expect(account.stepUp).toHaveBeenCalledWith("right", "123456", { action: "REGENERATE_RECOVERY_CODES" });
      expect(account.regenerateRecoveryCodes).toHaveBeenCalledWith("g".repeat(43));
      expect(text()).toContain("AAAA-BBBB-CCCC-DDDD");
      const proceed = button(S["auth.continue"]!)!;
      expect(proceed.disabled).toBe(true);
      const saved = [...host.querySelectorAll("label")].find(label => label.textContent === say("codes.saved"))!.querySelector("input")!;
      await act(async () => saved.click());
      expect(proceed.disabled).toBe(false);
      await act(async () => proceed.click());
      expect(done).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener("debateai:staff-session-ended", ended);
    }
  });
  it("Later leaves without codes", async () => {
    const done = vi.fn();
    const account = { authMethods: vi.fn().mockResolvedValue({ methods: [], recovery_codes_remaining: 0, available_step_up_methods: ["passkey"], step_up_providers: [] }), regenerateRecoveryCodes: vi.fn() };
    const api = server({ "finish/status": [ok({ status: "ready_to_finish", expires_at: opened().expires_at })], finish: [ok(opened())] });
    await open(api, `#finish=${LINK}`, { accountClient: account, onDone: done });
    await type("#recover-help-password", "right");
    await submit();
    await press("evidence done");
    await press("passkey made");
    await press(say("codes.later"));
    expect(done).toHaveBeenCalledOnce();
    expect(account.regenerateRecoveryCodes).not.toHaveBeenCalled();
  });
  it("a finish sent before the 72 hours shows the wait again", async () => {
    const notBefore = "2026-11-27T10:00:00.000Z";
    const api = server({ "finish/status": [ok({ status: "ready_to_finish", expires_at: opened().expires_at }), ok({ status: "waiting", not_before: notBefore })], finish: [refuse(409, "RECOVERY_PERMIT_TOO_EARLY")] });
    await open(api, `#finish=${LINK}`);
    await type("#recover-help-password", "right");
    await submit();
    expect(host.querySelector("#auth-title")?.textContent).toBe(say("finishWait.title"));
    expect(password()).toBeNull();
  });
  it("when the 5 minutes run out before a sign-in method is made, says so and that the same link works again", async () => {
    vi.useFakeTimers();
    const api = server({ "finish/status": [ok({ status: "ready_to_finish", expires_at: new Date(Date.now() + 60_000).toISOString() })], finish: [ok(opened(1000))] });
    await open(api, `#finish=${LINK}`, { accountClient: {} });
    await type("#recover-help-password", "right");
    await submit();
    await press("evidence done");
    await act(async () => { vi.advanceTimersByTime(1001); });
    expect(host.querySelector("#auth-title")?.textContent).toBe(say("expired.title"));
    expect(text()).toContain(say("expired.next"));
    expect(button("passkey made")).toBeUndefined();
  });
  it("the set-up's own expiry says the same", async () => {
    const api = server({ "finish/status": [ok({ status: "ready_to_finish", expires_at: opened().expires_at })], finish: [ok(opened())] });
    await open(api, `#finish=${LINK}`, { accountClient: {} });
    await type("#recover-help-password", "right");
    await submit();
    await press("evidence done");
    await press("enrolment ran out");
    expect(text()).toContain(say("expired.next"));
  });
});

describe("the way in from /recover, and the words", () => {
  it("the email form and the saved-code form both link to the help page", async () => {
    window.history.replaceState(null, "", "/recover");
    await act(async () => root.render(<RecoveryFlow catalog={auth} locale="en" client={{} as never}/>));
    const link = () => [...host.querySelectorAll("a")].find(anchor => anchor.getAttribute("href") === "/recover/help");
    expect(link()?.textContent).toBe(say("askLink"));
    await act(async () => root.unmount());
    root = createRoot(host);
    window.history.replaceState(null, "", `/recover#token=${LINK}`);
    await act(async () => root.render(<RecoveryFlow catalog={auth} locale="en" client={{} as never}/>));
    expect(host.querySelector("[name=code]")).not.toBeNull();
    expect(link()?.textContent).toBe(say("askLink"));
  });
  it("no sentence uses the jargon", () => {
    for (const [key, value] of Object.entries(S).filter(([name]) => name.startsWith("auth.recoveryHelp."))) {
      expect(value, key).not.toMatch(/permit|credential|capability|token|factor|\bMFA\b|operator|eligib/iu);
    }
  });
});
