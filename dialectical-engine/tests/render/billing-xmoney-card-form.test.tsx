// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { XMoneyCardForm } from "../../apps/ui/components/billing/XMoneyCardForm.js";
import {
  loadXMoneySdk,
  sdkOriginMatchesEnvironment,
  type XMoneyGlobal,
  type XMoneyPaymentFormOptions
} from "../../apps/ui/lib/billing/xmoneySdk.js";
import billingEnglish from "../../apps/ui/messages/en/billing.json" with { type: "json" };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const CHECKOUT = Object.freeze({
  public_key: "pk_test_x", order_payload: "cGF5bG9hZA==", order_checksum: "c2lnbg==",
  charge_ref: "0123456789abcdef0123456789abcdef", sdk_environment: "stage" as const
});
const NONCE = "AAAAAAAAAAAAAAAAAAAAAA==";
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.head.querySelectorAll("script[data-xmoney-sdk]").forEach((node) => node.remove());
  delete (window as { XMoney?: XMoneyGlobal }).XMoney;
});

function fakeSdk() {
  const mounted: XMoneyPaymentFormOptions[] = [];
  const submit = vi.fn();
  const destroy = vi.fn();
  const sdk: XMoneyGlobal = { paymentForm: (options) => { mounted.push(options); return { submit, destroy }; } };
  return { sdk, mounted, submit, destroy };
}

describe("P19 XMoneyCardForm", () => {
  it("mounts xMoney's form with the server's signed order, and submits only through xMoney", async () => {
    const fake = fakeSdk();
    const loadSdk = vi.fn(async () => fake.sdk);
    const onSubmitted = vi.fn();
    await act(async () => {
      root.render(<XMoneyCardForm checkout={CHECKOUT} sdkOrigin="https://secure-stage.xmoney.com" nonce={NONCE}
        locale="ro" catalog={billingEnglish} submitLabel="Subscribe and pay" summary="Plus total"
        onSubmitted={onSubmitted} loadSdk={loadSdk} />);
    });
    for (let hop = 0; hop < 3; hop += 1) await act(async () => { await Promise.resolve(); });
    expect(loadSdk).toHaveBeenCalledWith("https://secure-stage.xmoney.com", NONCE);
    expect(fake.mounted).toHaveLength(1);
    expect(fake.mounted[0]).toMatchObject({
      publicKey: "pk_test_x", orderPayload: "cGF5bG9hZA==", orderChecksum: "c2lnbg==",
      options: { locale: "ro", displaySubmitButton: false, displaySaveCardOption: false }
    });
    expect(fake.mounted[0]!.container).toBe(container.querySelector("[data-xmoney-container]"));
    const pay = [...container.querySelectorAll("button")].find((button) => button.textContent === "Subscribe and pay")!;
    expect(pay.disabled).toBe(true);
    await act(async () => { fake.mounted[0]!.onReady(); });
    expect(pay.disabled).toBe(false);
    await act(async () => { pay.click(); });
    expect(fake.submit).toHaveBeenCalledTimes(1);
    expect(onSubmitted).not.toHaveBeenCalled();
    await act(async () => { fake.mounted[0]!.onPaymentComplete({}); });
    expect(onSubmitted).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    expect(fake.destroy).toHaveBeenCalledTimes(1);
    root = createRoot(container);
  });

  it("refuses to mount when the SDK origin and the server's environment disagree, or no origin is set", async () => {
    const loadSdk = vi.fn(async () => fakeSdk().sdk);
    await act(async () => {
      root.render(<XMoneyCardForm checkout={{ ...CHECKOUT, sdk_environment: "live" }} sdkOrigin="https://secure-stage.xmoney.com"
        nonce={NONCE} locale="en" catalog={billingEnglish} submitLabel="Subscribe and pay" summary="x"
        onSubmitted={() => undefined} loadSdk={loadSdk} />);
    });
    expect(container.textContent).toContain("The card form couldn't be loaded. Please reload the page.");
    expect(loadSdk).not.toHaveBeenCalled();
    expect(sdkOriginMatchesEnvironment(null, "stage")).toBe(false);
    expect(sdkOriginMatchesEnvironment("https://secure.xmoney.com", "live")).toBe(true);
    expect(sdkOriginMatchesEnvironment("https://localhost:4443", "stage")).toBe(true);
    expect(sdkOriginMatchesEnvironment("https://localhost:4443", "live")).toBe(false);
  });

  it("the default loader adds ONE nonce-carrying script from the SDK origin and never fetches it in a test", async () => {
    const loading = loadXMoneySdk("https://secure-stage.xmoney.com", NONCE);
    const scripts = document.head.querySelectorAll("script[data-xmoney-sdk]");
    expect(scripts).toHaveLength(1);
    const script = scripts[0] as HTMLScriptElement;
    expect(script.src).toBe("https://secure-stage.xmoney.com/sdk/v2/xmoney.js");
    expect(script.getAttribute("nonce")).toBe(NONCE);
    const fake = fakeSdk();
    (window as { XMoney?: XMoneyGlobal }).XMoney = fake.sdk;
    script.dispatchEvent(new Event("load"));
    await expect(loading).resolves.toBe(fake.sdk);
    await expect(loadXMoneySdk("https://secure-stage.xmoney.com", NONCE)).resolves.toBe(fake.sdk);
    expect(document.head.querySelectorAll("script[data-xmoney-sdk]")).toHaveLength(1);
  });
});
