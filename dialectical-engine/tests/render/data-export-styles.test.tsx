// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DataExportCard } from "../../apps/ui/components/DataExportCard.js";
import { ExportDownloadClient } from "../../apps/ui/components/ExportDownloadClient.js";
import { AccountErasureControls } from "../../apps/ui/components/AccountErasureControls.js";
import { ContractHttpError } from "@debateai/contract";
import settings from "../../apps/ui/messages/en/settings.json" with { type: "json" };

let root: Root | null = null; let host: HTMLDivElement | null = null;
const source = (path: string) => readFileSync(resolve(process.cwd(), `apps/ui/${path}`), "utf8");
function injectStyles() {
  const style = document.createElement("style");
  style.textContent = ["app/globals.css", "app/security-confirmation.css", "app/data-export.css"].map(source).join("\n");
  document.head.append(style);
  return style;
}
async function mount(view: React.ReactNode) {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); await act(async () => root!.render(view));
  return host;
}
async function flush() { await act(async () => { await Promise.resolve(); }); }
function click(text: string) { const button = [...(host?.querySelectorAll("button") ?? [])].find((item) => item.textContent?.includes(text)); if (!button) throw new Error(`BUTTON_MISSING:${text}`); return act(async () => button.click()); }
const methods = { methods: [], recovery_codes_remaining: 0, available_step_up_methods: ["passkey", "provider", "password_totp"], step_up_providers: ["google", "apple"] };
const exportClient = () => ({ readDataExportStatus: vi.fn(async () => ({ status: "NONE" })), requestDataExport: vi.fn(), authMethods: vi.fn(async () => methods) });
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = null; host?.remove(); host = null; document.head.querySelectorAll("style").forEach((style) => style.remove()); sessionStorage.clear(); vi.unstubAllGlobals(); });

it("Y-1 loads the two scoped token-only stylesheets after billing", () => {
  const layout = source("app/layout.tsx");
  const order = ["./billing.css", "./security-confirmation.css", "./data-export.css"].map((name) => layout.indexOf(name));
  expect(order.every((at) => at >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  for (const name of ["security-confirmation.css", "data-export.css"]) expect(source(`app/${name}`)).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|oklch\(/i);
  const selectors = [...source("app/security-confirmation.css").matchAll(/(^|})\s*([^{}]+)\s*\{/g)].map((match) => match[2]!.trim());
  expect(selectors.length).toBeGreaterThanOrEqual(5);
  expect(selectors.every((selector) => selector.startsWith(".authSecurity"))).toBe(true);
});
it("Y-2 gives export and Delete-account panels the same measured container and pill values", async () => {
  injectStyles(); const client = exportClient();
  await mount(<DataExportCard catalog={settings} locale="en" client={client as never} />); await click(settings["settings.export.request"]); await flush();
  const exportPanel = host!.querySelector<HTMLElement>("section.authSecurityConfirmation")!;
  const measured = (panel: HTMLElement) => { const css = getComputedStyle(panel); return [css.marginTop, css.paddingTop, css.borderTopWidth, css.borderTopStyle, css.display, css.flexDirection, css.gap, getComputedStyle(panel.querySelector<HTMLButtonElement>("button")!).borderRadius]; };
  const exportValues = measured(exportPanel);
  expect(exportValues).toEqual(["14px", "14px", "1px", "solid", "flex", "column", "12px", "999px"]);
  await act(async () => root!.unmount()); root = null; host?.remove(); host = null;
  const erasure = { readAccountErasure: vi.fn(async () => ({ status: "NONE" })), scheduleAccountErasure: vi.fn(), cancelAccountErasure: vi.fn(), authMethods: vi.fn(async () => methods) };
  await mount(<AccountErasureControls catalog={settings} locale="en" client={erasure as never} />); await flush();
  const input = host!.querySelector<HTMLInputElement>("#account-deletion-confirmation")!;
  await act(async () => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!; setter.call(input, settings["settings.erasure.confirmationPhrase"]); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await click(settings["settings.erasure.schedule"]); await flush();
  const deletePanel = host!.querySelector<HTMLElement>("section.authSecurityConfirmation")!;
  expect(measured(deletePanel)).toEqual(exportValues);
  await click("Password");
  const deleteForm = deletePanel.querySelector<HTMLElement>("form.authForm")!;
  expect(getComputedStyle(deleteForm).flexDirection).toBe("row");
  expect(deleteForm.querySelector<HTMLButtonElement>(".setBtnQuiet")?.type).toBe("button");
});
it("Y-3 styles all three methods, the selected password form and its accessible fields", async () => {
  injectStyles(); await mount(<DataExportCard catalog={settings} locale="en" client={exportClient() as never} />); await click(settings["settings.export.request"]); await flush();
  const panel = host!.querySelector<HTMLElement>(".authSecurityConfirmation")!;
  for (const row of panel.querySelectorAll<HTMLElement>(".authSecurityActions")) {
    const css = getComputedStyle(row); expect([css.display, css.gap, css.flexWrap]).toEqual(["flex", "10px", "wrap"]);
  }
  expect(panel.querySelectorAll(".authSecurityActions").length).toBe(3);
  const hint = getComputedStyle(panel.querySelector<HTMLElement>(".authFieldHint")!);
  expect([hint.marginTop, hint.marginBottom, hint.fontSize, hint.lineHeight]).toEqual(["0px", "8px", "11.5px", "1.55"]);
  expect([...panel.querySelectorAll(".authSecurityActions button")].every((button) => button.classList.contains("setBtn"))).toBe(true);
  await click("Password");
  const selected = [...panel.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Password"))!;
  expect(selected.getAttribute("aria-pressed")).toBe("true");
  // jsdom loses the selected color after globals.css's var() border shorthand.
  expect(source("app/security-confirmation.css")).toMatch(/\.authSecurityConfirmation \.setBtn\[aria-pressed="true"\]\s*\{\s*border-color:\s*var\(--ink\);\s*\}/);
  const form = panel.querySelector<HTMLElement>(".authForm")!; const css = getComputedStyle(form);
  expect([css.display, css.flexDirection, css.gap, css.alignItems]).toEqual(["flex", "row", "10px", "center"]);
  expect(css.marginTop).toBe("0px");
  expect(form.querySelector<HTMLButtonElement>(".setBtnQuiet")?.type).toBe("button");
  for (const field of form.querySelectorAll<HTMLElement>(".setField")) {
    const label = field.querySelector("label")!; const input = field.querySelector("input")!;
    expect(getComputedStyle(label).clipPath).toBe("inset(50%)");
    expect(input.placeholder).toBe(label.textContent);
    expect(getComputedStyle(input).fontWeight).toBe("400");
    expect(getComputedStyle(input).letterSpacing).toBe("normal");
  }
  expect(form.querySelector("button")?.className).toContain("setBtnPrimary");
  const cancel = [...panel.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Cancel")!;
  expect(cancel.className).toContain("setBtnQuiet"); expect(getComputedStyle(cancel).padding).toBe("7px 15px");
});
it("Y-4 computes DONE title and message declarations in L1 and L6", async () => {
  injectStyles(); const token = "t".repeat(43);
  for (const unavailable of [false, true]) {
    sessionStorage.setItem("debateai.exportPending", token);
    const client = { downloadDataExport: vi.fn(unavailable ? async () => { throw new ContractHttpError("HTTP_ERROR", 503, "unavailable", "EXPORT_UNAVAILABLE"); } : async () => ({ bytes: new Uint8Array([80, 75]).buffer, filename: "dialectical-engine-export-2026-10-08.zip" })) };
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:fixture") });
    await mount(<ExportDownloadClient catalog={settings} client={client as never} />);
    const title = host!.querySelector<HTMLElement>("h1.setTitle.exportPageTitle")!;
    const message = host!.querySelector<HTMLElement>('[role="status"].exportMessage')!;
    expect([getComputedStyle(title).marginTop, getComputedStyle(title).fontSize]).toEqual(["0px", "30px"]);
    const css = getComputedStyle(message);
    expect([css.marginTop, css.fontSize, css.lineHeight, css.color]).toEqual(["0px", "12.5px", "1.55", "var(--ink)"]);
    if (unavailable) expect(host!.querySelector('a.setBtn[href="/settings"]')).not.toBeNull();
    await act(async () => root!.unmount()); root = null; host?.remove(); host = null; click.mockRestore();
  }
});
