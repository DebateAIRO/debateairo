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
 * exchange sets beside the HttpOnly one. The fake server below answers as the API does: the status read is refused unless
 * the browser holds that reset's (or recovery's) cookies.
 */

const TOKEN = "A".repeat(43);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const holds = (cookie: string) => document.cookie.split(";").map(member => member.trim()).includes(cookie);
let host: HTMLDivElement, root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
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
  function server(state: Readonly<Record<string, unknown>> = { status: "password_required", expires_at: "2030-01-01T00:00:00Z", password_min_length: 12, password_max_length: 1024 }, options: { dropStart?: boolean } = {}) {
    const paths: string[] = [];
    const client = createPasswordResetClient(async url => {
      const path = String(url).split("/password-reset/")[1]!;
      paths.push(path);
      if (path === "status") return holds(PASSWORD_RESET_CSRF_COOKIE) ? json(state) : json({ error: "PASSWORD_RESET_INVALID" }, 401);
      if (path === "start") { if (options.dropStart) throw new TypeError("synthetic dropped response"); return json({ message: "If this account can be recovered, instructions will arrive through an eligible channel." }, 202); }
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

  it("Check reset status still asks the server when it is pressed, with or without a reset held", async () => {
    history.replaceState({}, "", "/reset-password");
    const f = server(undefined, { dropStart: true });
    await act(async () => root.render(<PasswordResetFlow client={f.client} />));
    await type("email", "person@example.test"); await submit();
    expect(host.textContent).toContain(reset["error.unknown"]);
    expect(f.paths).toEqual(["start"]);
    await click(reset["check.state"]);
    expect(f.paths).toEqual(["start", "status"]);
  });
});

describe("the authenticator recovery page asks for its step only when the browser holds a recovery", () => {
  const expires_at = new Date(Date.now() + 240000).toISOString();
  function server(state: Readonly<Record<string, unknown>> = { status: "factor_required", expires_at }, options: { dropStart?: boolean } = {}) {
    const paths: string[] = [];
    const client = createMfaRecoveryClient(async url => {
      const path = String(url).split("/mfa-recovery/")[1]!;
      paths.push(path);
      if (path === "status") return holds(MFA_RECOVERY_CSRF_COOKIE) ? json(state) : json({ error: "MFA_RECOVERY_INVALID" }, 401);
      if (path === "start") { if (options.dropStart) throw new TypeError("synthetic dropped response"); return json({ message: "If this account can be recovered, instructions will arrive through an eligible channel." }, 202); }
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

  it("Check recovery state still asks the server when it is pressed", async () => {
    history.replaceState({}, "", "/recover-authenticator");
    const f = server(undefined, { dropStart: true });
    await act(async () => root.render(<MfaRecoveryFlow client={f.client} />));
    await type("email", "person@example.test"); await submit();
    expect(host.textContent).toContain(mfa["error.unknown"]);
    expect(f.paths).toEqual(["start"]);
    await click(mfa["check.state"]);
    expect(f.paths).toEqual(["start", "status"]);
  });
});
