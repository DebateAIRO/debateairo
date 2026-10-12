// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { renderToStaticMarkup } from "react-dom/server";
import { DataExportCard } from "../../apps/ui/components/DataExportCard.js";
import { SettingsPageClient } from "../../apps/ui/components/SettingsPageClient.js";
import { SecurityActionResume } from "../../apps/ui/components/auth/SecurityActionResume.js";
import settings from "../../apps/ui/messages/en/settings.json" with { type: "json" };
import auth from "../../apps/ui/messages/en/auth.json" with { type: "json" };
import pub from "../../apps/ui/messages/en/public.json" with { type: "json" };

vi.mock("@/components/AuthGate", () => ({ AuthGate: ({ children }: { children: () => React.ReactNode }) => children() }));
vi.mock("@/components/consent/ConsentSettingsPanel", () => ({ ConsentSettingsPanel: () => <section aria-label="Privacy" /> }));
vi.mock("@/components/AccountErasureControls", () => ({ AccountErasureControls: () => <section aria-label="Delete account" /> }));
vi.mock("@/components/SessionControls", () => ({ SessionControls: () => null }));
vi.mock("@/components/billing/SubscriptionControls", () => ({ SubscriptionControls: () => null }));
vi.mock("@/components/billing/UsageBars", () => ({ UsageBars: () => null }));
vi.mock("@/components/EmailSettings", () => ({ EmailSettingsCard: () => null, takeEmailChangeLink: () => null }));

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const NONE = { status: "NONE" as const };
const PREPARING = { status: "PREPARING" as const, requested_at: "2026-10-08T15:43:00.000Z" };
const SENT = { status: "SENT" as const, requested_at: "2026-10-08T15:43:00.000Z", expires_at: "2026-10-09T15:43:00.000Z" };
const FAILED = { status: "FAILED" as const, requested_at: "2026-10-08T15:43:00.000Z" };
const methods = (available_step_up_methods: string[]) => ({ methods: [], recovery_codes_remaining: 0, available_step_up_methods, step_up_providers: [] });
const grant = () => ({ status: "step_up_complete", csrf_token: "c".repeat(43), step_up_grant: { action: "EXPORT_DATA", token: "g".repeat(43), expires_at: new Date(Date.now() + 300_000).toISOString() } });
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const client = (status: unknown = NONE) => ({
  readDataExportStatus: vi.fn(async () => status),
  requestDataExport: vi.fn(async () => PREPARING),
  authMethods: vi.fn(async () => methods(["password_totp"])),
  stepUp: vi.fn(async () => grant()),
  beginPasskeyStepUp: vi.fn(async () => ({ options: {}, challenge_handle: "h".repeat(43) })),
  completePasskeyStepUp: vi.fn(async () => grant())
});
async function mount(view: React.ReactNode) {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await act(async () => { root!.render(view); });
  return host;
}
async function flush() { await act(async () => { await Promise.resolve(); }); }
async function fill(selector: string, value: string) {
  const input = host!.querySelector<HTMLInputElement>(selector)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function button(text: string): HTMLButtonElement {
  const result = [...(host?.querySelectorAll("button") ?? [])].find((item) => item.textContent?.includes(text));
  if (!result) throw new Error(`BUTTON_MISSING:${text}`);
  return result;
}
async function click(text: string) { await act(async () => { button(text).click(); }); }
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = null; host?.remove(); host = null; vi.useRealTimers(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

it("U-1 places a plain export card after Privacy and before Delete account", () => {
  const html = renderToStaticMarkup(<SettingsPageClient />);
  const privacy = html.indexOf('aria-label="Privacy"');
  const exportCard = html.indexOf('aria-labelledby="export-heading"');
  const deletion = html.indexOf('aria-label="Delete account"');
  expect(privacy).toBeGreaterThan(-1);
  expect(exportCard).toBeGreaterThan(privacy);
  expect(deletion).toBeGreaterThan(exportCard);
  expect(html.slice(exportCard - 40, exportCard)).toContain("setCard");
  expect(html.slice(exportCard - 40, exportCard)).not.toContain("setCardDanger");
});
it("U-2 shows checking and no request button before status resolves", async () => {
  const pending = deferred<typeof NONE>(); const stub = client(); stub.readDataExportStatus.mockReturnValue(pending.promise);
  await mount(<DataExportCard catalog={settings} locale="en" client={stub as never} />);
  expect(host?.textContent).toContain(settings["settings.export.checking"]);
  expect(host?.querySelector("button")).toBeNull();
});
it("U-3 shows the title, explanation and enabled request in NONE", async () => {
  await mount(<DataExportCard catalog={settings} locale="en" client={client() as never} />);
  expect(host?.textContent).toContain(settings["settings.export.title"]);
  expect(host?.textContent).toContain(settings["settings.export.hint"]);
  expect(button(settings["settings.export.request"]).disabled).toBe(false);
});
it("U-4 opens EXPORT_DATA confirmation and Cancel returns to idle without a request", async () => {
  const stub = client(); await mount(<DataExportCard catalog={settings} locale="en" client={stub as never} />);
  await click(settings["settings.export.request"]); await flush();
  expect(host?.querySelector(".authSecurityConfirmation")).not.toBeNull();
  expect(stub.authMethods).toHaveBeenCalled();
  expect(stub.requestDataExport).not.toHaveBeenCalled();
  await click("Cancel"); expect(host?.querySelector(".authSecurityConfirmation")).toBeNull();
  expect(button(settings["settings.export.request"]).disabled).toBe(false);
});
it("V-36 opens the existing confirmation from the expired-link Settings entry without requesting", async () => {
  window.history.replaceState(null, "", "/settings?request-export=1");
  const stub = client(); await mount(<DataExportCard catalog={settings} locale="en" client={stub as never} />);
  expect(host?.querySelector(".authSecurityConfirmation")).not.toBeNull();
  expect(stub.authMethods).toHaveBeenCalled();
  const firstMethodReads = stub.authMethods.mock.calls.length;
  expect(stub.requestDataExport).not.toHaveBeenCalled();
  expect(window.location.pathname + window.location.search).toBe("/settings");
  await click("Cancel");
  expect(host?.querySelector(".authSecurityConfirmation")).toBeNull();
  await click(settings["settings.export.request"]); await flush();
  expect(host?.querySelector(".authSecurityConfirmation")).not.toBeNull();
  expect(stub.authMethods.mock.calls.length).toBeGreaterThan(firstMethodReads);
  expect(stub.requestDataExport).not.toHaveBeenCalled();
});
it("V-36 Settings entry uses the same no-method Security branch", async () => {
  window.history.replaceState(null, "", "/settings?request-export=1");
  const stub = client(); stub.authMethods.mockResolvedValue(methods([]) as never);
  await mount(<DataExportCard catalog={settings} locale="en" client={stub as never} />);
  expect(host?.textContent).toContain(settings["settings.export.noMethod"]);
  expect(host?.querySelector('a[href="/settings/security"]')).not.toBeNull();
  expect(host?.querySelector(".authSecurityConfirmation")).toBeNull();
  expect(stub.requestDataExport).not.toHaveBeenCalled();
});
it("V-36 opens confirmation for SENT but respects PREPARING with no panel", async () => {
  window.history.replaceState(null, "", "/settings?request-export=1");
  const sent = client(SENT); await mount(<DataExportCard catalog={settings} locale="en" client={sent as never} />);
  expect(host?.querySelector(".authSecurityConfirmation")).not.toBeNull();
  expect(sent.requestDataExport).not.toHaveBeenCalled();
  await click("Cancel");
  expect(host?.textContent).toContain(settings["settings.export.sent"].split("{")[0]);
  expect(sent.requestDataExport).not.toHaveBeenCalled();
  await act(async () => root!.unmount()); root = null; host?.remove(); host = null;
  window.history.replaceState(null, "", "/settings?request-export=1");
  const preparing = client(PREPARING); await mount(<DataExportCard catalog={settings} locale="en" client={preparing as never} />);
  expect(host?.textContent).toContain(settings["settings.export.preparing"].split("{")[0]);
  expect(host?.querySelector(".authSecurityConfirmation")).toBeNull();
  expect(preparing.authMethods).not.toHaveBeenCalled();
  expect(preparing.requestDataExport).not.toHaveBeenCalled();
  expect(window.location.pathname + window.location.search).toBe("/settings");
});
it("V-38 scrolls and focuses the first choice only for the expired-link entry", async () => {
  const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
  const scroll = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scroll });
  try {
    window.history.replaceState(null, "", "/settings?request-export=1");
    const stub = client(); await mount(<DataExportCard catalog={settings} locale="en" client={stub as never} />);
    expect(host?.querySelector(".authSecurityConfirmation")).not.toBeNull();
    expect(scroll).toHaveBeenCalledOnce();
    expect(scroll.mock.instances[0]).toBe(host?.querySelector('section[aria-labelledby="export-heading"]'));
    expect(document.activeElement).toBe(button("Password"));
    expect(stub.requestDataExport).not.toHaveBeenCalled();
    await click("Cancel");
    await click(settings["settings.export.request"]); await flush();
    expect(host?.querySelector(".authSecurityConfirmation")).not.toBeNull();
    expect(scroll).toHaveBeenCalledOnce();
    expect(document.activeElement).not.toBe(button("Password"));
  } finally {
    if (originalScroll) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScroll);
    else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  }
});
it("U-5 failed password and passkey proofs show only the card line", async () => {
  for (const method of ["password_totp", "passkey"]) {
    const stub = client(); stub.authMethods.mockResolvedValue(methods([method]) as never);
    stub.stepUp.mockRejectedValue(new Error("WRONG_CODE")); stub.completePasskeyStepUp.mockRejectedValue(new Error("BAD_PASSKEY"));
    await mount(<DataExportCard catalog={settings} locale="en" client={stub as never} />); await click(settings["settings.export.request"]); await flush();
    if (method === "password_totp") {
      await click("Password");
      await fill('[name="security-password"]', "wrong");
      await fill('[name="security-code"]', "123456");
    } else await click("Use a passkey");
    await flush();
    expect(host?.textContent).toContain(settings["settings.export.notAuthorized"]);
    expect(host?.querySelector(".authSecurityConfirmation")).not.toBeNull();
    expect(host?.querySelectorAll(".authSecurityConfirmation [role=alert]").length).toBe(0);
    expect(stub.requestDataExport).not.toHaveBeenCalled();
    await act(async () => root!.unmount()); root = null; host?.remove(); host = null;
  }
});
it("U-6 disables the requesting button until requestDataExport resolves", async () => {
  const pending = deferred<typeof PREPARING>(); const stub = client(); stub.requestDataExport.mockReturnValue(pending.promise);
  await mount(<DataExportCard catalog={settings} locale="en" client={stub as never} />); await click(settings["settings.export.request"]); await flush();
  await click("Password");
  await fill('[name="security-password"]', "correct");
  await fill('[name="security-code"]', "123456");
  expect(button(settings["settings.export.requesting"]).disabled).toBe(true);
  expect(stub.requestDataExport).toHaveBeenCalledWith("g".repeat(43), "en");
  await act(async () => pending.resolve(PREPARING));
});
it("FIX-UI2 W-B2 sends the contract locale for regional English while keeping UI locale formatting", async () => {
  for (const locale of ["en-US", "en-GB"] as const) {
    const stub = client();
    await mount(<DataExportCard catalog={settings} locale={locale} client={stub as never} />);
    await click(settings["settings.export.request"]); await flush();
    await click("Password");
    await fill('[name="security-password"]', "correct");
    await fill('[name="security-code"]', "123456");
    expect(stub.requestDataExport).toHaveBeenCalledWith("g".repeat(43), "en");
    await act(async () => root!.unmount()); root = null; host?.remove(); host = null;
  }
});
it("U-7 shows localized PREPARING time and no request control", async () => {
  await mount(<DataExportCard catalog={settings} locale="en" client={client(PREPARING) as never} />);
  expect(host?.textContent).toContain("Oct 8");
  expect(host?.textContent).toContain("2026");
  expect(host?.textContent).toContain(settings["settings.export.preparing"].split("{")[0]);
  expect(host?.querySelector("button")).toBeNull();
});
it("U-8 shows SENT times, request again and supersession note", async () => {
  await mount(<DataExportCard catalog={settings} locale="en" client={client(SENT) as never} />);
  expect(host?.textContent).toContain(settings["settings.export.sent"].split("{")[0]);
  expect(host?.textContent).toContain("Oct 9");
  expect(button(settings["settings.export.requestAgain"]).disabled).toBe(false);
  expect(host?.textContent).toContain(settings["settings.export.supersedes"]);
});
it("U-9 shows FAILED and offers another request", async () => {
  await mount(<DataExportCard catalog={settings} locale="en" client={client(FAILED) as never} />);
  expect(host?.textContent).toContain(settings["settings.export.failed"]);
  expect(button(settings["settings.export.request"]).disabled).toBe(false);
});
it("U-10 maps each refusal to a visible status then preserves the next read state", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-08T15:43:00.000Z"));
  const refusals = [
    ["COOKIE_SESSION_REQUIRED", "settings.export.sessionExpired"], ["SESSION_REQUIRED", "settings.export.sessionExpired"],
    ["EXPORT_UNAVAILABLE", "settings.export.unavailable"], ["STEP_UP_REQUIRED", "settings.export.notAuthorized"],
    ["EXPORT_EMAIL_REQUIRED", "settings.export.emailRequired"], ["EXPORT_ACCOUNT_ERASING", "settings.export.erasing"],
    ["EXPORT_ACCOUNT_HELD", "settings.export.held"], ["EXPORT_IN_PROGRESS", "settings.export.inProgress"],
    ["EXPORT_RATE_LIMITED", "settings.export.rateLimited"]
  ] as const;
  for (const [code, key] of refusals) {
    const stub = client();
    stub.requestDataExport.mockRejectedValue(new ContractHttpError(
      code === "SESSION_REQUIRED" || code === "COOKIE_SESSION_REQUIRED" ? "SESSION_REQUIRED" : code === "EXPORT_RATE_LIMITED" ? "RATE_LIMITED" : "FORBIDDEN",
      code === "EXPORT_RATE_LIMITED" ? 429 : 403, code, code, null, null,
      code === "EXPORT_RATE_LIMITED" ? 3600 : null
    ));
    stub.stepUp.mockResolvedValue(grant() as never);
    await mount(<DataExportCard catalog={settings} locale="en" client={stub as never} />); await click(settings["settings.export.request"]); await flush();
    await click("Password");
    await fill('[name="security-password"]', "correct");
    await fill('[name="security-code"]', "123456");
    await flush();
    const status = host!.querySelector('[role="status"]')?.textContent ?? "";
    expect(status).toContain(settings[key].split("{")[0]);
    if (code === "EXPORT_RATE_LIMITED") {
      const expectedTime = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date("2026-10-08T16:43:00.000Z"));
      expect(status).toContain(expectedTime);
    }
    expect(host?.textContent).toContain(settings["settings.export.hint"]);
    await act(async () => root!.unmount()); root = null; host?.remove(); host = null;
  }
});
it("FIX-UI2 V-32 clears a refusal on the next click and blocks repeats after confirmation", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  const pending = deferred<typeof PREPARING>();
  const stub = client();
  stub.requestDataExport
    .mockRejectedValueOnce(new ContractHttpError("HTTP_ERROR", 409, "busy", "EXPORT_IN_PROGRESS"))
    .mockReturnValueOnce(pending.promise);
  await mount(<DataExportCard catalog={settings} locale="en" client={stub as never} />);
  await click(settings["settings.export.request"]); await flush();
  await click("Password");
  await fill('[name="security-password"]', "correct");
  await fill('[name="security-code"]', "123456"); await flush();
  expect(host?.textContent).toContain(settings["settings.export.inProgress"]);
  await act(async () => { vi.advanceTimersByTime(5_000); }); await flush();
  expect(host?.textContent).toContain(settings["settings.export.inProgress"]);
  await click(settings["settings.export.request"]); await flush();
  expect(host?.textContent).not.toContain(settings["settings.export.inProgress"]);
  expect(button(settings["settings.export.request"]).disabled, "panel-open C2 state").toBe(false);
  await click("Password");
  await fill('[name="security-password"]', "correct");
  await fill('[name="security-code"]', "123456");
  expect(button(settings["settings.export.requesting"]).disabled).toBe(true);
  button(settings["settings.export.requesting"]).click();
  expect(stub.requestDataExport).toHaveBeenCalledTimes(2);
  await act(async () => pending.resolve(PREPARING));
  expect(host?.textContent).toContain(settings["settings.export.preparing"].split("{")[0]);
  expect(host?.querySelector("button")).toBeNull();
});
it("U-11 shows statusUnavailable after a failed status read", async () => {
  const stub = client(); stub.readDataExportStatus.mockRejectedValue(new Error("OFFLINE"));
  await mount(<DataExportCard catalog={settings} locale="en" client={stub as never} />);
  expect(host?.textContent).toContain(settings["settings.export.statusUnavailable"]);
});
it("FIX-UI U-N2 shows one state line when a SENT poll fails", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  let offline = false;
  const stub = client(SENT);
  stub.readDataExportStatus.mockImplementation(async () => { if (offline) throw new Error("OFFLINE"); return SENT; });
  await mount(<DataExportCard catalog={settings} locale="en" client={stub as never} />);
  expect(host!.querySelectorAll('[role="status"]')).toHaveLength(1);
  offline = true;
  await act(async () => { vi.advanceTimersByTime(5_000); });
  await flush();
  expect([...host!.querySelectorAll('[role="status"]')].map((line) => line.textContent)).toEqual([settings["settings.export.statusUnavailable"]]);
  await act(async () => root!.unmount()); root = null; host?.remove(); host = null;
  const noMethod = client(); let noMethodOffline = false;
  noMethod.authMethods.mockResolvedValue(methods([]) as never);
  noMethod.readDataExportStatus.mockImplementation(async () => { if (noMethodOffline) throw new Error("OFFLINE"); return NONE; });
  await mount(<DataExportCard catalog={settings} locale="en" client={noMethod as never} />);
  await click(settings["settings.export.request"]); await flush();
  noMethodOffline = true;
  await act(async () => { vi.advanceTimersByTime(5_000); }); await flush();
  expect([...host!.querySelectorAll('[role="status"]')].map((line) => line.textContent)).toEqual([settings["settings.export.statusUnavailable"]]);
});
it("FIX-UI2 W-N5 hides stale PREPARING and FAILED lines when a poll fails", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  for (const current of [PREPARING, FAILED]) {
    let offline = false;
    const stub = client(current);
    stub.readDataExportStatus.mockImplementation(async () => { if (offline) throw new Error("OFFLINE"); return current; });
    await mount(<DataExportCard catalog={settings} locale="en" client={stub as never} />);
    offline = true;
    await act(async () => { vi.advanceTimersByTime(5_000); }); await flush();
    expect([...host!.querySelectorAll('[role="status"]')].map((line) => line.textContent)).toEqual([settings["settings.export.statusUnavailable"]]);
    await act(async () => root!.unmount()); root = null; host?.remove(); host = null;
  }
});
it("U-12 has a Security link and no confirmation when no proof method exists", async () => {
  const stub = client(); stub.authMethods.mockResolvedValue(methods([]) as never);
  await mount(<DataExportCard catalog={settings} locale="en" client={stub as never} />); await click(settings["settings.export.request"]);
  expect(host?.textContent).toContain(settings["settings.export.noMethod"]);
  expect(host?.querySelector('a[href="/settings/security"]')).not.toBeNull();
  expect(host?.querySelector('p.setStatus a[href="/settings/security"]')).toBeNull();
  expect(host?.querySelector('.setCardRow a[href="/settings/security"]')).not.toBeNull();
  expect(host?.querySelector(".authSecurityConfirmation")).toBeNull();
});
it("FIX-UI U-N13 leaves Export data enabled while confirmation is open", async () => {
  await mount(<DataExportCard catalog={settings} locale="en" client={client() as never} />);
  await click(settings["settings.export.request"]); await flush();
  expect(host?.querySelector(".authSecurityConfirmation")).not.toBeNull();
  expect(button(settings["settings.export.request"]).disabled).toBe(false);
});
it("U-13 polls PREPARING into SENT on the second five-second tick", async () => {
  vi.useFakeTimers(); const stub = client(PREPARING); stub.readDataExportStatus.mockResolvedValueOnce(PREPARING as never).mockResolvedValue(SENT as never);
  await mount(<DataExportCard catalog={settings} locale="en" client={stub as never} />);
  expect(host?.textContent).toContain(settings["settings.export.preparing"].split("{")[0]);
  await act(async () => vi.advanceTimersByTimeAsync(10_000));
  expect(stub.readDataExportStatus.mock.calls.length).toBeGreaterThanOrEqual(2);
  expect(host?.textContent).toContain(settings["settings.export.sent"].split("{")[0]);
});
it("U-14 resumes EXPORT_DATA once with title only and maps in-progress refusal", async () => {
  const success = client();
  await mount(<SecurityActionResume catalog={auth} settingsCatalog={settings} publicCatalog={pub} locale="en" client={success as never} takeProof={() => grant() as never} />);
  expect(host?.querySelector("p")?.textContent).toBe(settings["settings.export.title"]);
  await click("Confirm action"); await flush();
  expect(success.requestDataExport).toHaveBeenCalledOnce();
  expect(success.requestDataExport).toHaveBeenCalledWith("g".repeat(43), "en");
  expect(host?.querySelector('[role="status"]')?.textContent).toContain(settings["settings.export.preparing"].split("{")[0]);
  await act(async () => root!.unmount()); root = null; host?.remove(); host = null;
  const stub = client(); stub.requestDataExport.mockRejectedValue(new ContractHttpError("HTTP_ERROR", 409, "busy", "EXPORT_IN_PROGRESS"));
  await mount(<SecurityActionResume catalog={auth} settingsCatalog={settings} publicCatalog={pub} locale="en" client={stub as never} takeProof={() => grant() as never} />);
  expect(host?.querySelector("p")?.textContent).toBe(settings["settings.export.title"]);
  await click("Confirm action"); await flush();
  expect(stub.requestDataExport).toHaveBeenCalledOnce();
  expect(stub.requestDataExport).toHaveBeenCalledWith("g".repeat(43), "en");
  expect(host?.textContent).toContain(settings["settings.export.inProgress"]);
});
it("FIX-UI2 W-B2 maps regional English on the provider-return export path", async () => {
  for (const locale of ["en-US", "en-GB"] as const) {
    const stub = client();
    await mount(<SecurityActionResume catalog={auth} settingsCatalog={settings} publicCatalog={pub}
      locale={locale} client={stub as never} takeProof={() => grant() as never} />);
    await click("Confirm action"); await flush();
    expect(stub.requestDataExport).toHaveBeenCalledWith("g".repeat(43), "en");
    await act(async () => root!.unmount()); root = null; host?.remove(); host = null;
  }
});
