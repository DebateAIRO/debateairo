// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPasswordResetClient } from "../../packages/contract/src/password-reset.js";
import { PasswordResetFlow } from "../../apps/ui/components/PasswordResetFlow.js";
import { LoginFlow } from "../../apps/ui/components/LoginFlow.js";
import en from "../../apps/ui/messages/en/password-reset.json";
import ro from "../../apps/ui/messages/ro/password-reset.json";

let host: HTMLDivElement, root: Root;
const state = { status: "password_required", expires_at: "2030-01-01T00:00:00Z", password_min_length: 12, password_max_length: 1024 };
beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement("div"); document.body.append(host); root = createRoot(host); history.replaceState({}, "", "/reset-password"); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
function fixture(options: { dropped?: boolean; proofRejected?: boolean; resume?: boolean; exchangeDropped?: boolean; cancelDropped?: boolean; statusUnavailable?: boolean; missingAfterCancel?: boolean } = {}) {
  const requests: { path: string; body: unknown }[] = [];
  let exchanged = Boolean(options.resume), completed = false, cancelled = false;
  const client = createPasswordResetClient(async (url, init) => {
    const path = String(url).split("/").at(-1)!;
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ path, body });
    if (path === "exchange") { exchanged = true; if (options.exchangeDropped) throw new TypeError("synthetic dropped response"); }
    if (path === "complete") { if (options.proofRejected) return json({ error: "PASSWORD_RESET_PROOF_INVALID" }, 401); completed = true; if (options.dropped) throw new TypeError("synthetic dropped response"); }
    if (path === "cancel-current") { cancelled = true; if (options.cancelDropped) throw new TypeError("synthetic dropped cancellation"); }
    if (path === "status" && options.statusUnavailable) return json({ error: "PASSWORD_RESET_UNAVAILABLE" }, 503);
    if (path === "status" && cancelled && options.missingAfterCancel) return json({ error: "PASSWORD_RESET_INVALID" }, 401);
    if (path === "status" && cancelled) return json({ ...state, status: "cancelled" });
    if (path === "status" && !exchanged) return json({ error: "PASSWORD_RESET_INVALID" }, 401);
    return json(path === "start" ? { message: "If this account can be recovered, instructions will arrive through an eligible channel." } : path === "complete" ? { status: "completed" } : path === "cancel" || path === "cancel-current" ? { status: "cancelled" } : { ...state, status: completed ? "completed" : "password_required" }, path === "start" ? 202 : 200);
  }, "/api", () => "B".repeat(43));
  return { client, requests };
}
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
async function click(text: string) { const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === text); expect(button).toBeDefined(); await act(async () => button!.click()); }
async function type(name: string, value: string) { const input = host.querySelector<HTMLInputElement>(`input[name="${name}"]`)!; expect(input).not.toBeNull(); await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
async function submit() { await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
async function enterForm(f = fixture()) { history.replaceState({}, "", "/reset-password#token=" + "A".repeat(43)); await act(async () => root.render(<PasswordResetFlow client={f.client} />)); await click(en.continue); return f; }
async function fill() { await type("new-password", "long unique new password"); await type("confirm-password", "long unique new password"); await type("code", "123 456"); }

describe("ordinary password-only reset screen", () => {
  it.each([["en", en, "Email address"], ["ro", ro, "Adresa de e-mail"]] as const)("has visible email labels and saved-code fallback in %s", async (locale, catalog, label) => {
    await act(async () => root.render(<PasswordResetFlow locale={locale} catalog={catalog} client={fixture().client} />));
    const field = [...host.querySelectorAll("label")].find(item => item.textContent === label)!;
    expect(host.querySelector(`#${field.htmlFor}`)?.tagName).toBe("INPUT");
    expect(host.querySelector("main")?.getAttribute("lang")).toBe(locale);
    expect(host.querySelector('a[href="/recover"]')).not.toBeNull();
    expect(host.textContent).not.toMatch(/T2|csrf|user_id|capability|QR/);
  });
  it("removes the fragment, retains it across StrictMode, and exchanges only on Continue", async () => {
    const f = fixture(); history.replaceState({}, "", "/reset-password#token=" + "A".repeat(43));
    await act(async () => root.render(<StrictMode><PasswordResetFlow client={f.client} /></StrictMode>));
    expect(location.hash).toBe(""); expect(f.requests).toEqual([]);
    await click(en.continue);
    expect(f.requests).toEqual([{ path: "exchange", body: { token: "A".repeat(43) } }]);
    expect(host.querySelectorAll("form")).toHaveLength(1);
    expect([...host.querySelectorAll("input")].map(input => input.name)).toEqual(["new-password", "confirm-password", "code"]);
    expect(host.querySelector('input[name="new-password"]')?.getAttribute("autocomplete")).toBe("new-password");
    expect(host.querySelector('input[name="code"]')?.getAttribute("autocomplete")).toBe("one-time-code");
    expect(host.querySelector('input[name="new-password"]')?.getAttribute("minlength")).toBe("12");
  });
  it("finishes with the current authenticator code in the same form and keeps the authenticator", async () => {
    const f = await enterForm(); await fill(); await submit();
    expect(f.requests.at(-1)).toEqual({ path: "complete", body: { password: "long unique new password", code: "123456" } });
    expect(host.textContent).toContain(en["done.title"]);
    expect(host.textContent).toContain(en["done.hint"]);
    expect(host.querySelectorAll("input")).toHaveLength(0);
    expect(host.querySelectorAll('a[href="/login"]')).not.toHaveLength(0);
  });
  it("keeps mismatched confirmation and malformed code out of completion transport", async () => {
    const f = await enterForm(); await fill(); await type("confirm-password", "different"); await submit();
    expect(host.textContent).toContain(en["password.mismatch"]);
    expect(f.requests.filter(request => request.path === "complete")).toHaveLength(0);
    await type("confirm-password", "long unique new password"); await type("code", "123"); await submit();
    expect(host.textContent).toContain(en["error.code.format"]);
    expect(f.requests.filter(request => request.path === "complete")).toHaveLength(0);
  });
  it("blocks repeating ambiguous completion, clears fields, and recognizes success by metadata status", async () => {
    const f = await enterForm(fixture({ dropped: true })); await fill(); await submit();
    expect(host.textContent).toContain(en["error.unknown"]);
    expect([...host.querySelectorAll<HTMLInputElement>("input")].every(input => input.value === "" && input.disabled)).toBe(true);
    await submit(); expect(f.requests.filter(request => request.path === "complete")).toHaveLength(1);
    await click(en["check.state"]);
    expect(f.requests.at(-1)).toEqual({ path: "status", body: null });
    expect(host.textContent).toContain(en["done.title"]);
  });
  it("reconciles a dropped exchange using status instead of consuming the link twice", async () => {
    const f = fixture({ exchangeDropped: true }); history.replaceState({}, "", "/reset-password#token=" + "A".repeat(43));
    await act(async () => root.render(<PasswordResetFlow client={f.client} />)); await click(en.continue); await click(en["check.state"]);
    expect(f.requests.map(request => request.path)).toEqual(["exchange", "status"]);
    expect(host.querySelector('input[name="code"]')).not.toBeNull();
  });
  it("keeps proof rejection on the combined form and clears the rejected code", async () => {
    const f = await enterForm(fixture({ proofRejected: true })); await fill(); await submit();
    expect(host.textContent).toContain(en["error.code"]);
    expect(host.querySelector<HTMLInputElement>('input[name="code"]')?.value).toBe("");
    expect(host.querySelectorAll("form")).toHaveLength(1);
  });
  it("resumes a restricted session without requesting a new link", async () => {
    const f = fixture({ resume: true }); await act(async () => root.render(<PasswordResetFlow client={f.client} />));
    expect(f.requests.map(request => request.path)).toEqual(["status"]);
    expect(host.querySelector('input[name="code"]')).not.toBeNull();
  });
  it("routes Forgot password from login to the streamlined page", async () => {
    await act(async () => root.render(<LoginFlow />));
    expect(host.querySelector('a[href="/reset-password"]')).not.toBeNull();
  });
  it("keeps native email and credential submissions in query-free POST bodies", async () => {
    await act(async () => root.render(<PasswordResetFlow client={fixture().client} />));
    expect(host.querySelector("form")?.getAttribute("method")).toBe("post");
    expect(host.querySelector("form")?.getAttribute("action")).toBe("/reset-password");
    await enterForm();
    expect(host.querySelector("form")?.getAttribute("method")).toBe("post");
    expect(host.querySelector("form")?.getAttribute("action")).toBe("/reset-password");
  });
  it("closes the reset binding before navigating to saved-code recovery", async () => {
    const f = fixture({ resume: true }); const destinations: string[] = [];
    await act(async () => root.render(<PasswordResetFlow client={f.client} onRecoverAccess={() => destinations.push("/recover")} />));
    await fill();
    await click(en["fallback.link"]);
    await click("Cancel this request and switch");
    expect(f.requests.at(-1)).toEqual({ path: "cancel-current", body: {} });
    expect(destinations).toEqual(["/recover"]);
    expect(host.querySelectorAll("input")).toHaveLength(0);
  });
  it("keeps an ambiguous fallback cancellation on screen until status confirms closure", async () => {
    const f = fixture({ resume: true, cancelDropped: true }); const destinations: string[] = [];
    await act(async () => root.render(<PasswordResetFlow client={f.client} onRecoverAccess={() => destinations.push("/recover")} />));
    await click(en["fallback.link"]);
    await click("Cancel this request and switch");
    expect(destinations).toEqual([]);
    expect(host.textContent).toContain(en["error.unknown"]);
    await click(en["check.state"]);
    expect(f.requests.map(request => request.path)).toEqual(["status", "cancel-current", "status"]);
    expect(destinations).toEqual(["/recover"]);
  });
  it("guides an email-requested reader to close the reset before switching recovery", async () => {
    await act(async () => root.render(<PasswordResetFlow client={fixture().client} />));
    await type("email", "demo@example.test"); await submit();
    expect(host.querySelector('a[href="/recover"]')).toBeNull();
    expect(host.textContent).toContain(en["fallback.pending"]);
  });
  it("does not infer closed recovery binding from a missing cookie after ambiguous cancellation", async () => {
    const f = fixture({ resume: true, cancelDropped: true, missingAfterCancel: true }); const destinations: string[] = [];
    await act(async () => root.render(<PasswordResetFlow client={f.client} onRecoverAccess={() => destinations.push("/recover")} />));
    await click(en["fallback.link"]); await click("Cancel this request and switch"); await click(en["check.state"]);
    expect(destinations).toEqual([]);
    expect(host.textContent).toContain(en["fallback.unknown"]);
    expect([...host.querySelectorAll<HTMLInputElement>("input")].every(input => input.disabled)).toBe(true);
  });
});
