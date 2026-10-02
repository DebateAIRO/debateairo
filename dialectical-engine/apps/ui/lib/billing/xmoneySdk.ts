/**
 * The ONE file that knows xMoney's embedded-form SDK (spec 2026-09-29 §2.5.3). Option names follow xMoney's SDK v2
 * docs; X0's sandbox recording confirms them, and a change is made here alone.
 */
export type XMoneyPaymentFormHandle = Readonly<{ submit(): void; destroy(): void }>;

export type XMoneyPaymentFormOptions = Readonly<{
  container: HTMLElement;
  publicKey: string;
  orderPayload: string;
  orderChecksum: string;
  options: Readonly<{ locale: string; displaySubmitButton: false; displaySaveCardOption: false }>;
  onReady: () => void;
  onError: (error: unknown) => void;
  /** xMoney's form finished its side (3-D Secure included). The outcome is read from OUR server, never from here. */
  onPaymentComplete: (result: unknown) => void;
}>;

export type XMoneyGlobal = Readonly<{ paymentForm(options: XMoneyPaymentFormOptions): XMoneyPaymentFormHandle }>;
export type XMoneySdkLoader = (origin: string, nonce: string | undefined) => Promise<XMoneyGlobal>;

declare global {
  interface Window { XMoney?: XMoneyGlobal }
}

export function xmoneySdkUrl(origin: string): string {
  return new URL("/sdk/v2/xmoney.js", origin).toString();
}

/** secure-stage.xmoney.com → stage, secure.xmoney.com → live, a local fake (localhost, *.localhost, *.test) → stage. */
export function sdkEnvironmentOfOrigin(origin: string): "stage" | "live" | null {
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    return null;
  }
  if (host === "secure-stage.xmoney.com") return "stage";
  if (host === "secure.xmoney.com") return "live";
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".test")) return "stage";
  return null;
}

/** AMENDMENTS-R1 A22: the server says which environment signed the order; the page's origin must agree. */
export function sdkOriginMatchesEnvironment(origin: string | null, environment: "stage" | "live"): boolean {
  return origin !== null && sdkEnvironmentOfOrigin(origin) === environment;
}

/** Adds the SDK script once, carrying the page nonce (A11), and resolves with window.XMoney. */
export const loadXMoneySdk: XMoneySdkLoader = (origin, nonce) => new Promise<XMoneyGlobal>((resolve, reject) => {
  if (window.XMoney !== undefined) {
    resolve(window.XMoney);
    return;
  }
  const url = xmoneySdkUrl(origin);
  let script = document.head.querySelector<HTMLScriptElement>("script[data-xmoney-sdk]");
  if (script === null) {
    script = document.createElement("script");
    script.src = url;
    script.async = true;
    if (nonce !== undefined) script.setAttribute("nonce", nonce);
    script.dataset.xmoneySdk = "true";
    document.head.appendChild(script);
  }
  script.addEventListener("load", () => {
    if (window.XMoney === undefined) reject(new Error("XMONEY_SDK_ABSENT"));
    else resolve(window.XMoney);
  }, { once: true });
  script.addEventListener("error", () => reject(new Error("XMONEY_SDK_LOAD_FAILED")), { once: true });
});
