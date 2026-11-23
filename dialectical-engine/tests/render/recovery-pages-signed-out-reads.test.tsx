// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPasswordResetClient } from "../../packages/contract/src/password-reset.js";
import { createMfaRecoveryClient } from "../../packages/contract/src/mfa-recovery.js";
import { PasswordResetFlow } from "../../apps/ui/components/PasswordResetFlow.js";
import { MfaRecoveryFlow } from "../../apps/ui/components/MfaRecoveryFlow.js";
import reset from "../../apps/ui/messages/en/password-reset.json";
import mfa from "../../apps/ui/messages/en/mfa-recovery.json";
import { CSRF_COOKIE, holdReadableCookies, MFA_RECOVERY_CSRF_COOKIE, PASSWORD_RESET_CSRF_COOKIE } from "../support/sessionCookie.js";

/*
 * The site sits behind a site password at the edge, and the browser forgets that password whenever a request it sent with
 * it comes back 401 without asking for it again. The reset and recovery status reads are answered 401 by the API when the
 * browser holds no reset (or recovery) cookie, so opening either page with nothing in progress asked for the site password
 * again at the next press. The page now asks for its step only when the browser holds the readable cookie the API's
 * exchange sets beside the HttpOnly one, and Check reset status / Check recovery state are answered in the website when
 * it holds none. The fake servers below answer as the API does: the status read is refused unless the browser holds that
 * reset's (or recovery's) cookies. The Check tests use the pages' own clients, which send through `fetch`, stood in here.
 */
const site = vi.hoisted(() => {
  const state = { paths: [] as string[], drop: new Set<string>(), reset: null as unknown, recovery: null as unknown, holds: (_cookie: string) => false };
  const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = String(input).replace(/^\/api\/v1\/auth\//u, "");
    state.paths.push(path);
    if (state.drop.has(path)) throw new TypeError("synthetic dropped response");
    if (path === "password-reset/start" || path === "mfa-recovery/start") return answer({ message: "If this account can be recovered, instructions will arrive through an eligible channel." }, 202);
    if (path === "password-reset/status") return state.holds("__Host-debateai-password-reset-csrf") ? answer(state.reset) : answer({ error: "PASSWORD_RESET_INVALID" }, 401);
    if (path === "mfa-recovery/status") return state.holds("__Host-debateai-mfa-recovery-csrf") ? answer(state.recovery) : answer({ error: "MFA_RECOVERY_INVALID" }, 401);
    return answer({ error: "UNEXPECTED_PATH" }, 404);
  }) as typeof fetch;
  return state;
});

const TOKEN = "A".repeat(43);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const holds = (cookie: string) => document.cookie.split(";").map(member => member.trim()).includes(cookie);
let host: HTMLDivElement, root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  site.paths = []; site.drop.clear(); site.holds = (name) => document.cookie.split(";").some(member => member.trim().startsWith(`${name}=`));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); history.replaceState({}, "", "/"); });

async function click(text: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === text);
  expect(button, text).toBeDefined();
  await act(async () => button!.click());
}
async function type(name: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  expect(input).not.toBeNull();
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function submit() { await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }

describe("the password reset page asks for its step only when the browser holds a reset", () => {
  function server(state: Readonly<Record<string, unknown>> = { status: "password_required", expires_at: "2030-01-01T00:00:00Z", password_min_length: 12, password_max_length: 1024 }) {
    const paths: string[] = [];
    const client = createPasswordResetClient(async url => {
      const path = String(url).split("/password-reset/")[1]!;
      paths.push(path);
      if (path === "status") return holds(PASSWORD_RESET_CSRF_COOKIE) ? json(state) : json({ error: "PASSWORD_RESET_INVALID" }, 401);
      if (path === "start") return json({ message: "If this account can be recovered, instructions will arrive through an eligible channel." }, 202);
      if (path === "exchange") return json({ status: "password_required", expires_at: "2030-01-01T00:00:00Z", password_min_length: 12, password_max_length: 1024 });
      if (path === "cancel") return json({ status: "cancelled" });
      throw new Error(`UNEXPECTED_PATH:${path}`);
    }, "/api", () => undefined);
    return { client, paths };
  }

  it("opened with no reset in progress, it shows the request form and sends nothing", async () => {
    history.replaceState({}, "", "/reset-password");
    const f = server();
    await act(async () => root.render(<StrictMode><PasswordResetFlow client={f.client} /></StrictMode>));
    expect(f.paths).toEqual([]);
    expect(host.textContent).toContain(reset["request.title"]);
    expect([...host.querySelectorAll("button")].some(button => button.textContent === reset["request.button"])).toBe(true);
  });

  it("a session's cookie or an authenticator recovery's cookie is no reset: still nothing is sent", async () => {
    history.replaceState({}, "", "/reset-password");
    holdReadableCookies(CSRF_COOKIE, MFA_RECOVERY_CSRF_COOKIE);
    const f = server();
    await act(async () => root.render(<PasswordResetFlow client={f.client} />));
    expect(f.paths).toEqual([]);
    expect(host.textContent).toContain(reset["request.title"]);
  });

  it("a reload in the middle of a reset (or another tab) still restores the step", async () => {
    history.replaceState({}, "", "/reset-password");
    holdReadableCookies(PASSWORD_RESET_CSRF_COOKIE);
    const f = server();
    await act(async () => root.render(<PasswordResetFlow client={f.client} />));
    expect(f.paths).toEqual(["status"]);
    expect(host.querySelector('input[name="code"]')).not.toBeNull();
  });

  it.each([["completed", reset["done.title"]], ["cancelled", reset["cancelled.title"]]] as const)("after the reset is %s its cookies stay until they expire, and the page still reads how it ended", async (status, title) => {
    history.replaceState({}, "", "/reset-password");
    holdReadableCookies(PASSWORD_RESET_CSRF_COOKIE);
    const f = server({ status, expires_at: "2030-01-01T00:00:00Z", password_min_length: 12, password_max_length: 1024 });
    await act(async () => root.render(<PasswordResetFlow client={f.client} />));
    expect(f.paths).toEqual(["status"]);
    expect(host.textContent).toContain(title);
  });

  it("a mailed reset link opened in a tab with no reset sends nothing until Continue, then exchanges", async () => {
    history.replaceState({}, "", `/reset-password#token=${TOKEN}`);
    const f = server();
    await act(async () => root.render(<StrictMode><PasswordResetFlow client={f.client} /></StrictMode>));
    expect(f.paths).toEqual([]);
    await click(reset.continue);
    expect(f.paths).toEqual(["exchange"]);
    expect(host.querySelector('input[name="code"]')).not.toBeNull();
  });

  it("a mailed cancel link opened in a tab with no reset sends nothing until the press, then cancels", async () => {
    history.replaceState({}, "", `/reset-password#cancel=${TOKEN}`);
    const f = server();
    await act(async () => root.render(<PasswordResetFlow client={f.client} />));
    expect(f.paths).toEqual([]);
    await click(reset["cancel.button"]);
    expect(f.paths).toEqual(["cancel"]);
    expect(host.textContent).toContain(reset["cancelled.title"]);
  });

  it("Check reset status with no reset held is answered in the website: nothing is sent, and the page shows the reset is over", async () => {
    // The start's answer was lost. The start sets no cookie, so the server could only refuse the status read (401).
    history.replaceState({}, "", "/reset-password");
    site.drop.add("password-reset/start");
    await act(async () => root.render(<PasswordResetFlow />));
    await type("email", "person@example.test"); await submit();
    expect(host.textContent).toContain(reset["error.unknown"]);
    expect(site.paths).toEqual(["password-reset/start"]);
    await click(reset["check.state"]);
    expect(site.paths, "the press sends nothing").toEqual(["password-reset/start"]);
    expect(host.textContent, "what the server's refusal showed").toContain(reset["expired.title"]);
  });

  it("Check reset status with a reset held asks the server, as before", async () => {
    history.replaceState({}, "", "/reset-password");
    holdReadableCookies(PASSWORD_RESET_CSRF_COOKIE);
    site.reset = { status: "password_required", expires_at: "2030-01-01T00:00:00Z", password_min_length: 12, password_max_length: 1024 };
    site.drop.add("password-reset/complete");
    await act(async () => root.render(<PasswordResetFlow />));
    expect(site.paths).toEqual(["password-reset/status"]);
    await type("new-password", "a long new password"); await type("confirm-password", "a long new password"); await type("code", "123456");
    await submit();
    expect(host.textContent).toContain(reset["error.unknown"]);
    await click(reset["check.state"]);
    expect(site.paths).toEqual(["password-reset/status", "password-reset/complete", "password-reset/status"]);
    expect(host.textContent).toContain(reset["checked.hint"]);
  });
});

describe("the authenticator recovery page asks for its step only when the browser holds a recovery", () => {
  const expires_at = new Date(Date.now() + 240000).toISOString();
  function server(state: Readonly<Record<string, unknown>> = { status: "factor_required", expires_at }) {
    const paths: string[] = [];
    const client = createMfaRecoveryClient(async url => {
      const path = String(url).split("/mfa-recovery/")[1]!;
      paths.push(path);
      if (path === "status") return holds(MFA_RECOVERY_CSRF_COOKIE) ? json(state) : json({ error: "MFA_RECOVERY_INVALID" }, 401);
      if (path === "start") return json({ message: "If this account can be recovered, instructions will arrive through an eligible channel." }, 202);
      if (path === "finish/status") return json({ status: "ready_to_finish", expires_at });
      throw new Error(`UNEXPECTED_PATH:${path}`);
    }, "/api", () => undefined);
    return { client, paths };
  }

  it("opened with no recovery in progress, it shows the request form and sends nothing", async () => {
    history.replaceState({}, "", "/recover-authenticator");
    const f = server();
    await act(async () => root.render(<StrictMode><MfaRecoveryFlow client={f.client} /></StrictMode>));
    expect(f.paths).toEqual([]);
    expect(host.textContent).toContain(mfa["request.title"]);
  });

  it("a session's cookie or a password reset's cookie is no recovery: still nothing is sent", async () => {
    history.replaceState({}, "", "/recover-authenticator");
    holdReadableCookies(CSRF_COOKIE, PASSWORD_RESET_CSRF_COOKIE);
    const f = server();
    await act(async () => root.render(<MfaRecoveryFlow client={f.client} />));
    expect(f.paths).toEqual([]);
  });

  it("a reload in the middle of a recovery still restores the step, and a waiting one still shows its wait", async () => {
    history.replaceState({}, "", "/recover-authenticator");
    holdReadableCookies(MFA_RECOVERY_CSRF_COOKIE);
    let f = server();
    await act(async () => root.render(<MfaRecoveryFlow client={f.client} />));
    expect(f.paths).toEqual(["status"]);
    expect([...host.querySelectorAll("button")].some(button => button.textContent === mfa["factor.button"])).toBe(true);
    await act(async () => root.unmount()); root = createRoot(host);
    f = server({ status: "waiting", expires_at, not_before: new Date(Date.now() + 86400000).toISOString() });
    await act(async () => root.render(<MfaRecoveryFlow client={f.client} />));
    expect(f.paths).toEqual(["status"]);
    expect(host.textContent).toContain(mfa["waiting.title"]);
  });

  it("mailed links work in a tab with no recovery: the email and cancel links send nothing first, the finish link reads its own state", async () => {
    for (const [fragment, expected] of [[`token=${TOKEN}`, []], [`cancel=${TOKEN}`, []], [`finish=${TOKEN}`, ["finish/status"]]] as const) {
      history.replaceState({}, "", `/recover-authenticator#${fragment}`);
      const f = server();
      await act(async () => root.render(<StrictMode><MfaRecoveryFlow client={f.client} /></StrictMode>));
      expect(f.paths, fragment).toEqual(expected);
      expect(location.hash).toBe("");
      await act(async () => root.unmount()); root = createRoot(host);
    }
  });

  it("Check recovery state with no recovery held is answered in the website: nothing is sent, however often it is pressed", async () => {
    // The start's answer was lost. The start sets no cookie, so the server could only refuse the status read (401).
    history.replaceState({}, "", "/recover-authenticator");
    site.drop.add("mfa-recovery/start");
    await act(async () => root.render(<MfaRecoveryFlow />));
    await type("email", "person@example.test"); await submit();
    expect(host.textContent).toContain(mfa["error.unknown"]);
    for (let press = 0; press < 3; press += 1) await click(mfa["check.state"]);
    expect(site.paths, "the presses send nothing").toEqual(["mfa-recovery/start"]);
    // As after the server's refusal: whether the start went through stays unknown, and Check recovery state stays.
    expect(host.textContent).toContain(mfa["error.unknown"]);
  });

  it("Check recovery state with a recovery held asks the server, as before", async () => {
    history.replaceState({}, "", "/recover-authenticator");
    holdReadableCookies(MFA_RECOVERY_CSRF_COOKIE);
    site.recovery = { status: "factor_required", expires_at };
    site.drop.add("mfa-recovery/totp/begin");
    await act(async () => root.render(<MfaRecoveryFlow />));
    expect(site.paths).toEqual(["mfa-recovery/status"]);
    await click(mfa["factor.button"]);
    expect(host.textContent).toContain(mfa["error.unknown"]);
    await click(mfa["check.state"]);
    expect(site.paths).toEqual(["mfa-recovery/status", "mfa-recovery/totp/begin", "mfa-recovery/status"]);
    expect([...host.querySelectorAll("button")].some(button => button.textContent === mfa["factor.button"])).toBe(true);
    expect(host.textContent).not.toContain(mfa["error.unknown"]);
  });
});
