export type TurnstileAction = "signup" | "resend-verification";
export type TurnstilePublicConfig = Readonly<{ siteKey: string; nonce: string }>;
export interface TurnstileRenderOptions {
  sitekey: string; action: TurnstileAction; language: string;
  appearance: "interaction-only"; execution: "render"; size: "flexible";
  "response-field": false;
  callback(token: string): void;
  "expired-callback"(): void;
  "timeout-callback"(): void;
  "error-callback"(code?: string): void;
}
export interface TurnstileBrowserApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}
declare global { interface Window { turnstile?: TurnstileBrowserApi; } }

// Cloudflare supported languages, checked 2026-10-04. Catalog et/ga/lv/mt use auto.
// https://developers.cloudflare.com/turnstile/reference/supported-languages/
const SUPPORTED = new Set(["ar", "bg", "zh", "hr", "cs", "da", "nl", "en", "fa", "fi", "fr", "de", "el", "he", "hi", "hu", "id", "it", "ja", "tlh", "ko", "lt", "ms", "nb", "pl", "pt", "ro", "ru", "sr", "sk", "sl", "es", "sv", "tl", "th", "tr", "uk", "vi"]);
export function turnstileLanguage(locale: string): string {
  const normalized = locale.toLowerCase().replaceAll("_", "-");
  if (normalized === "zh-tw" || normalized === "zh-hant" || normalized.startsWith("zh-hant-")) return "zh-tw";
  const language = normalized.split("-")[0]!;
  return SUPPORTED.has(language) ? language : "auto";
}
export function validTurnstilePublicConfig(config: TurnstilePublicConfig): boolean {
  return /^[A-Za-z0-9_-]{20,100}$/u.test(config.siteKey) && /^[A-Za-z0-9+/]{22}==$/u.test(config.nonce);
}
/** Server page uses this to pass only public config; production never selects a test widget. */
export function publicTurnstileConfig(siteKey: string | undefined, nonce: string | undefined, production: boolean): TurnstilePublicConfig {
  const candidate = { siteKey: siteKey ?? "", nonce: nonce ?? "" };
  return Object.freeze({ siteKey: validTurnstilePublicConfig(candidate) && !(production && /^[123]x0{18,}/u.test(candidate.siteKey)) ? candidate.siteKey : "", nonce: candidate.nonce });
}
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const loaders = new WeakMap<Document, { script: HTMLScriptElement; promise: Promise<TurnstileBrowserApi> }>();
/** Shared for strict effects and multiple consumers; script remains after widget unmount. */
export function loadTurnstile(nonce: string): Promise<TurnstileBrowserApi> {
  if (!/^[A-Za-z0-9+/]{22}==$/u.test(nonce)) return Promise.reject(new Error("TURNSTILE_UNAVAILABLE"));
  const previous = loaders.get(document);
  if (previous?.script.isConnected) return previous.promise;
  // An RSC navigation can carry a new server nonce while this document keeps its CSP.
  // Read the known root bootstrap's .nonce property (attributes may be hidden by browsers).
  const bootstrap = document.querySelector<HTMLScriptElement>("script#dialectical-document-bootstrap:not([data-turnstile])");
  const documentNonce = bootstrap?.nonce;
  const scriptNonce = documentNonce !== undefined && /^[A-Za-z0-9+/]{22}==$/u.test(documentNonce) ? documentNonce : nonce;
  const script = document.createElement("script");
  script.src = SCRIPT_URL; script.async = true; script.defer = true; script.nonce = scriptNonce; script.dataset.turnstile = "managed";
  const promise = new Promise<TurnstileBrowserApi>((resolve, reject) => {
    const fail = () => { clearTimeout(timeout); script.remove(); loaders.delete(document); reject(new Error("TURNSTILE_UNAVAILABLE")); };
    const ready = () => { if (!window.turnstile) { fail(); return; } clearTimeout(timeout); resolve(window.turnstile); };
    const timeout = setTimeout(fail, 10000);
    script.addEventListener("load", ready, { once: true }); script.addEventListener("error", fail, { once: true });
    document.head.append(script);
    if (window.turnstile) ready();
  });
  loaders.set(document, { script, promise });
  return promise;
}
