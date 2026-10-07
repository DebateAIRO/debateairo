// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TurnstileChallenge } from "../../apps/ui/components/auth/TurnstileChallenge.js";
import { publicTurnstileConfig, turnstileLanguage, type TurnstileRenderOptions } from "../../apps/ui/lib/turnstile.js";
let host: HTMLDivElement; let root: Root;
let options: TurnstileRenderOptions; let rendered: number; let removed: string[]; let resets: string[];
let tokens: Array<string | null>; let errors: number;
const nonce = "abcdefghijklmnopqrstuv==";
function view(resetKey = 0) { return <StrictMode><TurnstileChallenge siteKey="1x00000000000000000000AA" action="signup" locale="en-GB" nonce={nonce} resetKey={resetKey} onToken={token => tokens.push(token)} onError={() => { errors++; }} /></StrictMode>; }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); rendered = 0; removed = []; resets = []; tokens = []; errors = 0;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  window.turnstile = { render: (container, config) => { options = config; rendered++; container.append(document.createElement("iframe")); return `widget-${rendered}`; }, reset: id => { resets.push(id); }, remove: id => { removed.push(id); host.querySelector("iframe")?.remove(); } };
});
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); document.head.querySelectorAll("script[data-turnstile]").forEach(script => script.remove()); delete window.turnstile; vi.unstubAllGlobals(); });
describe("managed Turnstile lifecycle", () => {
  it("loads one nonced script and renders one live widget under strict effects", async () => {
    await act(async () => root.render(view()));
    const scripts = document.head.querySelectorAll<HTMLScriptElement>("script[data-turnstile]"); expect(scripts).toHaveLength(1);
    expect(scripts[0]!.src).toBe("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"); expect(scripts[0]!.nonce).toBe(nonce);
    expect(host.querySelectorAll("iframe")).toHaveLength(1); expect(options).toMatchObject({ sitekey: "1x00000000000000000000AA", action: "signup", language: "en", appearance: "interaction-only", execution: "render", size: "flexible", "response-field": false });
    expect(JSON.stringify(options)).not.toContain("secret");
  });
  it("uses the loaded document nonce when a client navigation carries a newer server nonce", async () => {
    const bootstrap = document.createElement("script"); bootstrap.id = "dialectical-document-bootstrap"; bootstrap.nonce = "zyxwvutsrqponmlkjihgfe=="; document.head.append(bootstrap);
    try { await act(async () => root.render(view())); expect(document.head.querySelector<HTMLScriptElement>("script[data-turnstile]")!.nonce).toBe("zyxwvutsrqponmlkjihgfe=="); }
    finally { bootstrap.remove(); }
  });
  it("clears expiry, resets consumed proof without recreating widget, removes on unmount", async () => {
    await act(async () => root.render(view())); const renders = rendered;
    options.callback("browser-proof"); expect(tokens.at(-1)).toBe("browser-proof");
    options["expired-callback"](); expect(tokens.at(-1)).toBeNull();
    await act(async () => root.render(view(1))); expect(tokens.at(-1)).toBeNull(); expect(resets).toHaveLength(1); expect(rendered).toBe(renders);
    await act(async () => root.unmount()); expect(host.querySelectorAll("iframe")).toHaveLength(0); expect(removed).toContain(`widget-${renders}`);
    root = createRoot(host);
  });
  it("clears proof and exposes a constant error on provider failure", async () => {
    await act(async () => root.render(view())); options.callback("browser-proof"); options["error-callback"]("secret-looking-provider-code");
    expect(tokens.at(-1)).toBeNull(); expect(errors).toBe(1);
  });
  it("refuses script execution without a nonce or public site key", async () => {
    await act(async () => root.render(<TurnstileChallenge siteKey="" action="signup" locale="ro" nonce="" resetKey={0} onToken={token => tokens.push(token)} onError={() => { errors++; }} />));
    expect(document.head.querySelector("script[data-turnstile]")).toBeNull(); expect(rendered).toBe(0); expect(tokens.at(-1)).toBeNull(); expect(errors).toBeGreaterThan(0);
  });
  it("fails closed for production test site keys and keeps only the public key and nonce", () => {
    expect(publicTurnstileConfig("1x00000000000000000000AA", nonce, true)).toEqual({ siteKey: "", nonce });
    expect(publicTurnstileConfig("0x4AAAAAAFNg9KPm2tECytqZ", nonce, true)).toEqual({ siteKey: "0x4AAAAAAFNg9KPm2tECytqZ", nonce });
  });
  it("renders only after script load and ignores load after unmount", async () => {
    delete window.turnstile;
    await act(async () => root.render(view())); expect(rendered).toBe(0);
    const script = document.head.querySelector<HTMLScriptElement>("script[data-turnstile]")!;
    window.turnstile = { render: (container, config) => { options = config; rendered++; container.append(document.createElement("iframe")); return "async-widget"; }, reset: () => undefined, remove: () => host.querySelector("iframe")?.remove() };
    await act(async () => script.dispatchEvent(new Event("load"))); expect(rendered).toBe(1);
    await act(async () => root.unmount()); script.dispatchEvent(new Event("load")); expect(host.querySelector("iframe")).toBeNull();
    root = createRoot(host);
  });
  it.each([["en-US", "en"], ["en-GB", "en"], ["ro-RO", "ro"], ["zh-TW", "zh-tw"], ["et", "auto"], ["lv", "auto"], ["ga", "auto"], ["mt", "auto"], ["pt-PT", "pt"], ["invalid", "auto"]])("maps %s to supported language %s", (locale, language) => { expect(turnstileLanguage(locale)).toBe(language); });
});
