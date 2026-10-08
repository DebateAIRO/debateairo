// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ContractHttpError, createContractClient } from "@debateai/contract";
import { ExportDownloadClient } from "../../apps/ui/components/ExportDownloadClient.js";
import { SocialCompleteFlow } from "../../apps/ui/components/auth/SocialCompleteFlow.js";
import { PENDING_EXPORT_KEY } from "../../apps/ui/lib/dataExportPending.js";
import { safeReturnPath } from "../../apps/ui/lib/returnPath.js";
import settings from "../../apps/ui/messages/en/settings.json" with { type: "json" };

const token = "t".repeat(43);
const filename = "dialectical-engine-export-2026-10-08.zip";
const bytes = new Uint8Array([80, 75, 3, 4]).buffer;
const browser = vi.hoisted(() => ({ authenticate: vi.fn(async () => ({})), register: vi.fn(), cancel: vi.fn(), supportsConditional: vi.fn() }));
const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("@/lib/consumerWebAuthn", () => ({ createConsumerWebAuthnBrowser: () => browser }));
let root: Root | null = null;
let host: HTMLDivElement | null = null;
const stub = () => ({ downloadDataExport: vi.fn(async () => ({ bytes, filename })) });
async function mount(view: React.ReactNode) {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await act(async () => { root!.render(view); });
  return host;
}
async function flush() { await act(async () => { await Promise.resolve(); }); }
function button(text: string) { const found = [...(host?.querySelectorAll("button") ?? [])].find((item) => item.textContent?.includes(text)); if (!found) throw new Error(`BUTTON_MISSING:${text}`); return found; }
beforeEach(() => { sessionStorage.clear(); window.history.replaceState(null, "", "/export"); });
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = null; host?.remove(); host = null; sessionStorage.clear(); window.history.replaceState(null, "", "/"); vi.unstubAllGlobals(); });

it("D-1 stashes the fragment token and strips it from browser history", async () => {
  window.history.replaceState(null, "", `/export#${token}`);
  const replace = vi.spyOn(window.history, "replaceState");
  await mount(<ExportDownloadClient catalog={settings} client={stub() as never} />);
  expect(sessionStorage.getItem(PENDING_EXPORT_KEY)).toBe(token);
  expect(window.location.hash).toBe("");
  expect(replace).toHaveBeenCalledWith(null, "", "/export");
  replace.mockRestore();
});
it("D-2 sends signed-out users to login without the token in the URL", async () => {
  for (const error of [new ContractHttpError("SESSION_REQUIRED", 401, "signed out"), new ContractHttpError("HTTP_ERROR", 401, "signed out", "COOKIE_SESSION_REQUIRED")]) {
    sessionStorage.setItem(PENDING_EXPORT_KEY, token);
    const client = stub(); client.downloadDataExport.mockRejectedValue(error);
    const assign = vi.fn(); const replacement = Object.create(window); Object.defineProperty(replacement, "location", { value: { ...window.location, assign, pathname: "/export", hash: "" } });
    vi.stubGlobal("window", replacement);
    await mount(<ExportDownloadClient catalog={settings} client={client as never} />);
    expect(assign).toHaveBeenCalledWith("/login?next=/export");
    expect(JSON.stringify(assign.mock.calls)).not.toContain(token);
    await act(async () => root!.unmount()); root = null; host?.remove(); host = null; vi.unstubAllGlobals();
  }
});
it("D-3 starts the ZIP download and the button downloads it again", async () => {
  sessionStorage.setItem(PENDING_EXPORT_KEY, token);
  const client = stub(); const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const create = vi.fn(() => "blob:export-fixture"); Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  await mount(<ExportDownloadClient catalog={settings} client={client as never} />);
  expect(host?.textContent).toContain(settings["settings.export.download.title"]);
  expect(host?.textContent).toContain(settings["settings.export.download.starting"]);
  expect(button(settings["settings.export.download.button"])).toBeTruthy();
  expect(click).toHaveBeenCalled();
  expect(click.mock.instances[0]?.download).toBe(filename);
  await act(async () => button(settings["settings.export.download.button"]).click());
  expect(click).toHaveBeenCalledTimes(2);
  expect(client.downloadDataExport).toHaveBeenCalledWith(token);
  click.mockRestore();
});
it("D-4 clears a wrong-account token and omits Back to Settings", async () => {
  sessionStorage.setItem(PENDING_EXPORT_KEY, token);
  const client = stub(); client.downloadDataExport.mockRejectedValue(new ContractHttpError("HTTP_ERROR", 403, "wrong", "EXPORT_WRONG_ACCOUNT"));
  await mount(<ExportDownloadClient catalog={settings} client={client as never} />);
  expect(host?.textContent).toContain(settings["settings.export.download.wrongAccount"]);
  expect(sessionStorage.getItem(PENDING_EXPORT_KEY)).toBeNull();
  expect(host?.querySelector('a[href="/settings"]')).toBeNull();
});
it("D-5 clears an invalid token and links back to Settings", async () => {
  sessionStorage.setItem(PENDING_EXPORT_KEY, token);
  const client = stub(); client.downloadDataExport.mockRejectedValue(new ContractHttpError("HTTP_ERROR", 404, "invalid", "EXPORT_LINK_INVALID"));
  await mount(<ExportDownloadClient catalog={settings} client={client as never} />);
  expect(host?.textContent).toContain(settings["settings.export.download.invalid"]);
  expect(sessionStorage.getItem(PENDING_EXPORT_KEY)).toBeNull();
  expect(host?.querySelector('a.setBtn[href="/settings"]')).not.toBeNull();
});
it("D-6 keeps a held link and provides Back to Settings", async () => {
  sessionStorage.setItem(PENDING_EXPORT_KEY, token);
  const client = stub(); client.downloadDataExport.mockRejectedValue(new ContractHttpError("HTTP_ERROR", 423, "held", "EXPORT_ACCOUNT_HELD"));
  await mount(<ExportDownloadClient catalog={settings} client={client as never} />);
  expect(host?.textContent).toContain(settings["settings.export.held"]);
  expect(sessionStorage.getItem(PENDING_EXPORT_KEY)).toBe(token);
  expect(host?.querySelector('a.setBtn[href="/settings"]')).not.toBeNull();
});
it("D-7 allows the exact export return path", () => {
  expect(safeReturnPath("/export")).toBe("/export");
});
it("D-8 resumes pending export after social sign-in and otherwise uses the old destination", async () => {
  for (const pending of [true, false]) {
    if (pending) sessionStorage.setItem(PENDING_EXPORT_KEY, token); else sessionStorage.removeItem(PENDING_EXPORT_KEY);
    window.history.replaceState(null, "", `/social/complete#kind=login&token=${"a".repeat(43)}&next=/settings`);
    browser.authenticate.mockResolvedValue({});
    const client = { socialLoginStatus: vi.fn(async () => ({ expires_at: new Date(Date.now() + 300000).toISOString(), available_methods: ["passkey"] })), beginPasskeyLogin: vi.fn(async () => ({ challenge_handle: "h".repeat(43), options: {} })), completePasskeyLogin: vi.fn(async () => ({ status: "authenticated", csrf_token: "c".repeat(43) })) };
    await mount(<SocialCompleteFlow client={client as never} />);
    const assign = vi.fn(); const replacement = Object.create(window); Object.defineProperty(replacement, "location", { value: { ...window.location, assign } });
    vi.stubGlobal("window", replacement);
    await act(async () => button("Use a passkey").click()); await flush();
    if (pending) { expect(navigation.push).toHaveBeenCalledWith("/export"); expect(assign).not.toHaveBeenCalled(); }
    else { expect(assign).toHaveBeenCalledWith("/settings"); expect(navigation.push).not.toHaveBeenCalled(); }
    await act(async () => root!.unmount()); root = null; host?.remove(); host = null; vi.unstubAllGlobals(); navigation.push.mockClear();
  }
});
it("D-9 sends the token in a POST body and never in a fetch URL", async () => {
  const urls: string[] = []; const bodies: string[] = [];
  const fetcher = vi.fn(async (url: URL, init: RequestInit) => { urls.push(String(url)); bodies.push(String(init.body)); return new Response(bytes, { status: 200, headers: { "content-disposition": `attachment; filename="${filename}"` } }); });
  const client = createContractClient("https://app.test", fetcher as never);
  await client.downloadDataExport(token);
  expect(urls).toEqual(["https://app.test/v1/account/export/download"]);
  expect(urls.join(" ")).not.toContain(token);
  expect(JSON.parse(bodies[0]!)).toEqual({ token });
});
it("D-10 keeps an unavailable link, shows a status and no download control", async () => {
  sessionStorage.setItem(PENDING_EXPORT_KEY, token);
  const client = stub(); client.downloadDataExport.mockRejectedValue(new ContractHttpError("HTTP_ERROR", 503, "unavailable", "EXPORT_UNAVAILABLE"));
  await mount(<ExportDownloadClient catalog={settings} client={client as never} />);
  expect(host?.textContent).toContain(settings["settings.export.download.title"]);
  expect(host?.querySelector('[role="status"]')?.textContent).toContain(settings["settings.export.unavailable"]);
  expect(host?.querySelector('a.setBtn[href="/settings"]')).not.toBeNull();
  expect(host?.querySelector("a[download]")).toBeNull();
  expect(sessionStorage.getItem(PENDING_EXPORT_KEY)).toBe(token);
});
it("D-11 treats a direct visit without a token as invalid without downloading", async () => {
  const client = stub(); await mount(<ExportDownloadClient catalog={settings} client={client as never} />);
  expect(host?.textContent).toContain(settings["settings.export.download.invalid"]);
  expect(host?.querySelector('a.setBtn[href="/settings"]')).not.toBeNull();
  expect(client.downloadDataExport).not.toHaveBeenCalled();
});
