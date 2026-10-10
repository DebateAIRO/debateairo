// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMfaRecoveryClient, createBackupEmailClient } from "../../packages/contract/src/mfa-recovery.js";
import { MfaRecoveryFlow } from "../../apps/ui/components/MfaRecoveryFlow.js";
import { BackupEmailVerification, BackupEmailConfirmation } from "../../apps/ui/components/BackupEmailVerification.js";
import { PasswordResetFlow } from "../../apps/ui/components/PasswordResetFlow.js";
import { LoginFlow } from "../../apps/ui/components/LoginFlow.js";
import { createPasswordResetClient } from "../../packages/contract/src/password-reset.js";
import { RecoveryFlow } from "../../apps/ui/components/auth/RecoveryFlow.js";
import authCatalog from "../../apps/ui/messages/en/auth.json";
import { createContractClient } from "../../packages/contract/src/client.js";
import en from "../../apps/ui/messages/en/mfa-recovery.json";
import ro from "../../apps/ui/messages/ro/mfa-recovery.json";
import ja from "../../apps/ui/messages/ja/mfa-recovery.json";
import type { LocaleCode } from "../../apps/ui/lib/i18n/locales.js";
let host: HTMLDivElement, root: Root;
const TOKEN = "A".repeat(43), SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const codes = Array.from({ length: 10 }, (_, i) => `SYNTHETIC-CODE-${i}-FIXTURE`);
beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement("div"); document.body.append(host); root = createRoot(host); history.replaceState({}, "", "/recover-authenticator"); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.useRealTimers(); });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
function fixture(dropped = false) {
  const requests: { path: string; body: unknown }[] = [];
  let status = "factor_required", exchanged = false;
  const expires_at = new Date(Date.now() + 240000).toISOString(), not_before = new Date(Date.now() + 86400000).toISOString();
  const client = createMfaRecoveryClient(async (url, init) => {
    const path = String(url).split("/mfa-recovery/")[1]!; requests.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (path === "status" && !exchanged) return json({ error: "MFA_RECOVERY_INVALID" }, 401);
    if (path === "exchange") { exchanged = true; return json({ status: "factor_required", expires_at }); }
    if (path === "totp/begin") { status = "totp_required"; return json({ status, secret: SECRET, otpauth_uri: `otpauth://totp/Synthetic?secret=${SECRET}`, account_label: "Synthetic replacement" }); }
    if (path === "totp/verify") status = "codes_required";
    if (path === "codes/generate") { status = "ack_required"; return json({ status, recovery_codes: codes }); }
    if (path === "codes/confirm") status = "ready";
    if (path === "complete") { status = "waiting"; if (dropped) throw new Error("synthetic lost reply"); return json({ status, not_before }); }
    if (path === "cancel-current") status = "cancelled";
    return json(path === "status" ? { status, expires_at, ...(status === "waiting" ? { not_before } : {}) } : { status });
  }, "/api", () => "B".repeat(43));
  return { client, requests };
}
async function click(text: string) { const b = [...host.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === text)!; expect(b).toBeDefined(); await act(async () => b.click()); }
async function type(name: string, value: string) { const input = host.querySelector<HTMLInputElement>(`input[name="${name}"]`)!; expect(input).not.toBeNull(); await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
async function submit() { await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
async function exchange(f = fixture()) { history.replaceState({}, "", `/recover-authenticator#token=${TOKEN}`); await act(async () => root.render(<MfaRecoveryFlow client={f.client} />)); await type("current-password", "known current password"); await act(async () => host.querySelector<HTMLInputElement>('input[name="ready"]')!.click()); await submit(); return f; }
async function finishToReady(f = fixture()) { await exchange(f); if (host.querySelector('input[name="code"]') === null) await click(en["factor.button"]); await type("code", "123 456"); await submit(); await click(en["codes.generate"]); await type("saved-code", codes[0]!); await submit(); return f; }
describe("known-password and verified-mail MFA replacement", () => {
  it.each([["en", en], ["ro", ro]] as const)("offers only primary identity and previously verified destinations in %s", async (locale, catalog) => {
    await act(async () => root.render(<MfaRecoveryFlow locale={locale} catalog={catalog} client={fixture().client} />));
    expect(host.querySelector('input[name="email"]')?.getAttribute("type")).toBe("email");
    expect([...host.querySelectorAll("option")].map(option => option.value)).toEqual(["primary", "backup"]);
    expect(host.querySelector('a[href="/recover"]')).not.toBeNull();
    expect(host.textContent).toContain(catalog["recognized.hint"]);
  });
  it("removes fragment without spending it and requires current password plus ready device", async () => {
    const f = fixture(); history.replaceState({}, "", `/recover-authenticator#token=${TOKEN}`);
    await act(async () => root.render(<StrictMode><MfaRecoveryFlow client={f.client} /></StrictMode>));
    expect(location.hash).toBe(""); expect(f.requests).toEqual([]);
    await type("current-password", "known current password"); await submit(); expect(f.requests).toEqual([]);
    await act(async () => host.querySelector<HTMLInputElement>('input[name="ready"]')!.click()); await submit();
    expect(f.requests[0]).toEqual({ path: "exchange", body: { token: TOKEN, password: "known current password" } });
    expect(host.querySelector('input[name="current-password"]')).toBeNull();
    if (!host.querySelector("svg")) await click(en["factor.button"]);
    expect(host.querySelector('svg[role="img"]')).not.toBeNull();
    expect(host.textContent).toContain(SECRET);
  });
  it("starts the 24-hour wait without requesting another password or changing it", async () => {
    const f = await finishToReady(); await click(en["ready.button"]);
    expect(f.requests.filter(request => request.path === "exchange")).toHaveLength(1);
    expect(f.requests.filter(request => request.path !== "exchange").every(request => !JSON.stringify(request.body).includes("known current password"))).toBe(true);
    expect(f.requests.find(request => request.path === "totp/verify")?.body).toEqual({ code: "123456" });
    expect(host.textContent).toContain("For your safety, this finishes in 24 hours.");
    // Review M3 2026-10-09: the person who started it gets no cancel link of their own; every address that may cancel does.
    expect(host.textContent).toContain("If this wasn't you, use the cancel link we emailed to all your addresses.");
    expect(host.textContent).not.toContain("We've emailed you a link to cancel");
    expect(host.querySelector("time")?.getAttribute("datetime")).toMatch(/^\d{4}-/);
    expect(host.textContent).not.toContain(en["done.title"]);
    expect(host.textContent).not.toContain(SECRET); expect(host.textContent).not.toContain(codes[0]);
  });
  it("blocks a repeated ambiguous completion until metadata status confirms success", async () => {
    const f = await finishToReady(fixture(true)); await click(en["ready.button"]);
    expect(host.textContent).toContain(en["error.unknown"]); await click(en["ready.button"]);
    expect(f.requests.filter(request => request.path === "complete")).toHaveLength(1);
    await click(en["check.state"]); expect(host.textContent).toContain(en["waiting.title"]);
  });
  // Review I1 2026-10-09: a second recovery while one is already waiting stops at the email link, with its own screen,
  // before a second authenticator and new codes are set up for nothing.
  it("stops at the email link when a replacement is already waiting, with its own plain screen", async () => {
    const paths: string[] = [];
    const client = createMfaRecoveryClient(async url => { const path = String(url).split("/mfa-recovery/")[1]!; paths.push(path); return path === "exchange" ? json({ error: "MFA_RECOVERY_ALREADY_WAITING" }, 409) : json({ error: "MFA_RECOVERY_INVALID" }, 401); }, "/api", () => "B".repeat(43));
    history.replaceState({}, "", `/recover-authenticator#token=${TOKEN}`);
    await act(async () => root.render(<StrictMode><MfaRecoveryFlow client={client} /></StrictMode>));
    await type("current-password", "known current password"); await act(async () => host.querySelector<HTMLInputElement>('input[name="ready"]')!.click()); await submit();
    expect(paths).toEqual(["exchange"]);
    expect(host.textContent).toContain("A recovery is already in progress.");
    expect(host.textContent).toContain("Use the link in the email we sent you, or cancel it from that email.");
    expect(host.textContent).not.toContain(en["refused.title"]); expect(host.textContent).not.toContain(en["error.unknown"]);
    expect(host.querySelector('input[name="current-password"]')).toBeNull(); expect(host.querySelector('[role="alert"]')).toBeNull();
  });
  it("clears a displayed setup secret at the original short replacement deadline", async () => {
    vi.useFakeTimers();
    const f = await exchange(); await click(en["factor.button"]); expect(host.textContent).toContain(SECRET);
    await act(async () => vi.advanceTimersByTime(240001));
    expect(host.textContent).toContain(en["expired.title"]); expect(host.textContent).not.toContain(SECRET);
    expect(host.querySelector("svg.mfaQr")).toBeNull(); expect(host.querySelector('input[name="code"]')).toBeNull();
    expect(f.requests.filter(request => request.path === "exchange")).toHaveLength(1);
  });
  it("keeps a dropped completion unknown after the replacement deadline ends", async () => {
    vi.useFakeTimers(); await finishToReady(fixture(true)); await click(en["ready.button"]);
    await act(async () => vi.advanceTimersByTime(240001));
    expect(host.textContent).toContain(en["deadline.unknown"]);
    expect([...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === en["expired.button"])?.disabled).toBe(true);
    expect(host.querySelector('a[href="/login"]')).not.toBeNull();
  });
});
describe("website verification of the existing bound backup address", () => {
  it("requests verification with current password and code only, and clears both proofs", async () => {
    const requests: unknown[] = [];
    const client = createBackupEmailClient(async (url, init) => { requests.push(init?.body ? JSON.parse(String(init.body)) : null); return String(url).endsWith("/start") ? json({ message: "If this account can be recovered, instructions will arrive through an eligible channel." }, 202) : json({ status: "pending", email: "bound@example.test" }); }, "/api", () => "B".repeat(43));
    await act(async () => root.render(<BackupEmailVerification client={client} />));
    expect(host.textContent).toContain("bound@example.test"); expect(host.textContent).toContain(en["backup.pending"]);
    await type("backup-password", "known password"); await type("backup-code", "123 456"); await submit();
    expect(requests.at(-1)).toEqual({ password: "known password", code: "123456" });
    expect([...host.querySelectorAll<HTMLInputElement>("input")].every(input => input.value === "")).toBe(true);
    expect(host.textContent).toContain(en["backup.sent"]);
  });
  it("waits for Continue before confirming a backup-email link", async () => {
    const requests: unknown[] = [];
    const client = createBackupEmailClient(async (_url, init) => { requests.push(JSON.parse(String(init?.body))); return json({ status: "verified" }); });
    history.replaceState({}, "", `/verify-backup-email#token=${TOKEN}`);
    await act(async () => root.render(<StrictMode><BackupEmailConfirmation client={client} /></StrictMode>));
    expect(location.hash).toBe(""); expect(requests).toEqual([]);
    await click(en.continue); expect(requests).toEqual([{ token: TOKEN }]);
    expect(host.textContent).toContain(en["backup.done.title"]);
  });
  it("reconciles a dropped backup verification request before accepting another mutation", async () => {
    let starts = 0;
    const client = createBackupEmailClient(async url => { if (String(url).endsWith("/start")) { starts++; throw new Error("synthetic lost request reply"); } return json({ status: starts ? "verified" : "pending", email: "bound@example.test" }); }, "/api", () => "B".repeat(43));
    await act(async () => root.render(<BackupEmailVerification client={client} />));
    await type("backup-password", "known password"); await type("backup-code", "123456"); await submit();
    expect([...host.querySelectorAll<HTMLInputElement>("input")].every(input => input.disabled && input.value === "")).toBe(true);
    await submit(); expect(starts).toBe(1);
    await click("Check backup email status"); expect(host.textContent).toContain(en["backup.verified"]);
  });
  it("checks an ambiguous backup confirmation using the same bounded idempotent token receipt", async () => {
    const bodies: unknown[] = [];
    const client = createBackupEmailClient(async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); if (bodies.length === 1) throw new Error("synthetic dropped confirmation"); return json({ status: "verified" }); });
    history.replaceState({}, "", `/verify-backup-email#token=${TOKEN}`);
    await act(async () => root.render(<BackupEmailConfirmation client={client} />));
    await click(en.continue); expect(host.textContent).toContain(en["backup.confirm.unknown"]);
    await click(en["backup.confirm.check"]); expect(bodies).toEqual([{ token: TOKEN }, { token: TOKEN }]);
    expect(host.textContent).toContain(en["backup.done.title"]);
  });
});
describe("safe entry into known-password authenticator recovery", () => {
  it("offers the known-password alternative at the ordinary login MFA challenge", async () => {
    const client = { beginLogin: async () => ({ challenge_token: TOKEN }), completeLogin: async () => ({ status: "completed" }) };
    await act(async () => root.render(<LoginFlow client={client as never} />));
    await type("email", "demo@example.test"); await type("password", "current fixture"); await submit();
    expect(host.querySelector('a[href="/recover-authenticator"]')).not.toBeNull();
  });
  it("confirms cancellation before leaving an active password reset for the new method", async () => {
    const requests: string[] = [], destinations: string[] = [];
    const client = createPasswordResetClient(async url => { const path = String(url).split("/").at(-1)!; requests.push(path); return json(path === "cancel-current" ? { status: "cancelled" } : { status: "password_required", expires_at: new Date(Date.now() + 240000).toISOString(), password_min_length: 8 }); }, "/api", () => "B".repeat(43));
    await act(async () => root.render(<PasswordResetFlow client={client} onRecoverAuthenticator={() => destinations.push("/recover-authenticator")} />));
    await click(en["known.link"]); expect(requests).toEqual(["status"]); expect(destinations).toEqual([]);
    await click(en["switch.confirm"]); expect(requests).toEqual(["status", "cancel-current"]); expect(destinations).toEqual(["/recover-authenticator"]);
  });
  it("keeps current general recovery fragment proof out of queries and hides alternate methods while proof is outstanding", async () => {
    const paths:string[]=[];
    const client=createContractClient("https://ui.example.test/api",async url=>{paths.push(String(url));return json({error:"synthetic unavailable"},503);});
    history.replaceState({},"",`/recover#token=${TOKEN}`);
    await act(async()=>root.render(<RecoveryFlow catalog={authCatalog} locale="en" client={client}/>));
    expect(window.location.hash).toBe("");expect(paths).toEqual([]);
    expect(host.querySelector('a[href="/recover-authenticator"]')).toBeNull();
    expect(host.querySelector('a[href="/reset-password"]')).toBeNull();
    expect(host.querySelector('input[name="code"]')).not.toBeNull();
  });
  it("a lost current general recovery proof reply cannot switch to another credential method", async () => {
    const paths:string[]=[];
    const client=createContractClient("https://ui.example.test/api",async url=>{paths.push(String(url));throw new Error("synthetic lost reply");});
    history.replaceState({},"",`/recover#token=${TOKEN}`);
    await act(async()=>root.render(<RecoveryFlow catalog={authCatalog} locale="en" client={client}/>));
    await type("code","synthetic-saved-code");await submit();
    expect(paths).toHaveLength(1);expect(paths[0]).toMatch(/\/v1\/auth\/recovery\/prove$/);
    expect(host.querySelector('a[href="/recover-authenticator"]')).toBeNull();
    expect(host.querySelector('a[href="/reset-password"]')).toBeNull();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
  });
  it("confirms the shared pause before cancelling an active MFA replacement", async () => {
    const f = await exchange();
    await click(en["saved.link"]); expect(f.requests.filter(request => request.path === "cancel-current")).toHaveLength(0);
    expect(host.textContent).toContain(en["cancel.pause"]);
    await click(en["switch.confirm"]);
    expect(f.requests.at(-1)?.path).toBe("cancel-current");
    expect(host.textContent).toContain(en["cancel.pause"]);
    expect(host.querySelector('a[href="/recover"]')).toBeNull();
  });
});

// Owner ruling 2026-10-09: the replacement only takes effect after a 24-hour wait, finished from an emailed link.
describe("the 24-hour wait and the finish link", () => {
  const FINISH = "F".repeat(43), not_before = new Date(Date.now() + 3600000).toISOString(), expires_at = new Date(Date.now() + 7 * 86400000).toISOString();
  function finishFixture(states: (Record<string, unknown> | (() => Response))[], finish: () => Response = () => json({ status: "completed" })) {
    const requests: { path: string; body: unknown }[] = [];
    const client = createMfaRecoveryClient(async (url, init) => { const path = String(url).split("/mfa-recovery/")[1]!; requests.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null }); if (path === "finish/status") { const next = states.length > 1 ? states.shift()! : states[0]!; return typeof next === "function" ? next() : json(next); } if (path === "finish") return finish(); if (path === "cancel") return json({ status: "cancelled" }); return json({ error: "MFA_RECOVERY_INVALID" }, 401); }, "/api", () => "B".repeat(43));
    return { client, requests };
  }
  async function open(f: ReturnType<typeof finishFixture>, catalog: Record<string, string> = en, locale: LocaleCode = "en") { history.replaceState({}, "", `/recover-authenticator#finish=${FINISH}`); await act(async () => root.render(<StrictMode><MfaRecoveryFlow client={f.client} catalog={catalog} locale={locale} /></StrictMode>)); }
  it("uses the owner's words for the wait, the finish link and the cancel", () => {
    expect(en["waiting.title"]).toBe("For your safety, this finishes in 24 hours.");
    expect(en["waiting.description"]).toBe("If this wasn't you, use the cancel link we emailed to all your addresses.");
    expect(en["finish.title"]).toBe("You can finish setting up your new authenticator now.");
    expect(en["cancelled.title"]).toBe("Recovery cancelled.");
  });
  it("before the 24 hours are over, shows when the link can be used and asks for nothing", async () => {
    const f = finishFixture([{ status: "waiting", not_before }]); await open(f);
    expect(location.hash).toBe("");
    expect(f.requests.filter(r => r.path === "finish/status")[0]?.body).toEqual({ token: FINISH });
    expect(host.textContent).toContain(en["waiting.title"]);
    expect(host.querySelector("time")?.getAttribute("datetime")).toBe(not_before);
    expect(host.querySelector('input[name="current-password"]')).toBeNull();
    expect(f.requests.some(r => r.path === "finish")).toBe(false);
  });
  it("after the 24 hours, finishes with the current password", async () => {
    const f = finishFixture([{ status: "ready_to_finish", expires_at }]); await open(f);
    expect(host.textContent).toContain(en["finish.title"]);
    await type("current-password", "known current password"); await submit();
    expect(f.requests.filter(r => r.path === "finish")).toEqual([{ path: "finish", body: { token: FINISH, password: "known current password" } }]);
    expect(host.textContent).toContain(en["done.title"]);
    expect(host.querySelector('input[name="current-password"]')).toBeNull();
  });
  it("keeps the form after a wrong password and says so", async () => {
    const f = finishFixture([{ status: "ready_to_finish", expires_at }], () => json({ error: "MFA_RECOVERY_PROOF_INVALID" }, 401)); await open(f);
    await type("current-password", "wrong password"); await submit();
    expect(host.textContent).toContain(en["error.proof"]);
    expect(host.querySelector<HTMLInputElement>('input[name="current-password"]')?.value).toBe("");
    expect(host.textContent).not.toContain(en["done.title"]);
  });
  it("goes back to the wait when the server says it is still too early", async () => {
    const f = finishFixture([{ status: "ready_to_finish", expires_at }, { status: "waiting", not_before }], () => json({ error: "MFA_RECOVERY_TOO_EARLY" }, 409)); await open(f);
    await type("current-password", "known current password"); await submit();
    expect(host.textContent).toContain(en["waiting.title"]);
    expect(host.querySelector('input[name="current-password"]')).toBeNull();
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });
  // Review M1 2026-10-09: a finish link that no longer works gets its own plain screen, not the generic refusal. The
  // server cannot tell cancelled, finished, expired and "the account changed" apart (all close the request the same
  // way), so one screen names them all and says how to tell whether it already finished.
  it("a finish link that no longer works says so in plain words, not the generic refusal", async () => {
    const f = finishFixture([() => json({ error: "MFA_RECOVERY_INVALID" }, 410)]); await open(f);
    expect(host.textContent).toContain("This link can no longer be used.");
    expect(host.textContent).toContain("The recovery may have been cancelled, finished already, or run out of time. It also stops if your password, email address or authenticator changed after it started.");
    expect(host.textContent).toContain("Nothing was changed by opening this link.");
    expect(host.textContent).not.toContain(en["refused.title"]); expect(host.textContent).not.toContain(en["refused.description"]);
    expect([...host.querySelectorAll("button")].map(b => b.textContent)).toContain(en["expired.button"]);
    expect(host.querySelector('input[name="current-password"]')).toBeNull();
  });
  it("a finish the server no longer accepts after the password shows the same plain screen", async () => {
    const f = finishFixture([{ status: "ready_to_finish", expires_at }], () => json({ error: "MFA_RECOVERY_INVALID" }, 410)); await open(f);
    await type("current-password", "known current password"); await submit();
    expect(host.textContent).toContain("This link can no longer be used.");
    expect(host.textContent).not.toContain(en["refused.title"]); expect(host.textContent).not.toContain(en["done.title"]);
  });
  it("a rate-limited finish check offers Try again with the same link, which is no longer in the address bar", async () => {
    const f = finishFixture([() => json({ error: "MFA_RECOVERY_RATE_LIMITED" }, 429), { status: "ready_to_finish", expires_at }]); await open(f);
    expect(location.hash).toBe(""); expect(host.textContent).toContain(en["error.rate"]);
    await click("Try again");
    expect(f.requests.filter(r => r.path === "finish/status").map(r => r.body)).toEqual([{ token: FINISH }, { token: FINISH }]);
    expect(host.textContent).toContain(en["finish.title"]); expect(host.textContent).not.toContain(en["error.rate"]);
  });
  it("cancels from the emailed link and says so", async () => {
    const f = finishFixture([]); history.replaceState({}, "", `/recover-authenticator#cancel=${"C".repeat(43)}`);
    await act(async () => root.render(<MfaRecoveryFlow client={f.client} />));
    await click(en["cancel.button"]);
    expect(f.requests.at(-1)).toEqual({ path: "cancel", body: { token: "C".repeat(43) } });
    expect(host.textContent).toContain("Recovery cancelled.");
  });
  it("speaks Romanian on the finish screens", async () => {
    const f = finishFixture([{ status: "ready_to_finish", expires_at }]); await open(f, ro, "ro");
    expect(host.textContent).toContain(ro["finish.title"]); expect(ro["finish.title"]).not.toBe(en["finish.title"]);
    expect(host.textContent).toContain(ro["finish.button"]);
  });
  // Owner requirement 2026-10-09: the wait screens are "clear plain screens in all 35 locales".
  it("shows the wait in the reader's language and date format (ja)", async () => {
    const f = finishFixture([{ status: "waiting", not_before }]); await open(f, ja, "ja");
    expect(host.querySelector("main")?.getAttribute("lang")).toBe("ja");
    expect(host.textContent).toContain(ja["finishWait.title"]); expect(ja["finishWait.title"]).not.toBe(en["finishWait.title"]);
    expect(host.querySelector("time")?.textContent).toBe(new Intl.DateTimeFormat("ja", { dateStyle: "medium", timeStyle: "short" }).format(new Date(not_before)));
  });
});
