"use client";

import { useEffect, useRef, useState } from "react";
import {
  loadXMoneySdk,
  sdkOriginMatchesEnvironment,
  type XMoneyPaymentFormHandle,
  type XMoneySdkLoader
} from "@/lib/billing/xmoneySdk";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import billingEnglish from "@/messages/en/billing.json";

export type SignedOrder = Readonly<{
  public_key: string;
  order_payload: string;
  order_checksum: string;
  sdk_environment: "stage" | "live";
}>;

/**
 * xMoney's card form on our page (spec 2026-09-29 §1.3 step 4). The card fields are xMoney's iframes: no card data
 * reaches this code. B4 submits through xMoney; the payment's outcome comes from our server afterwards.
 */
export function XMoneyCardForm({
  checkout,
  sdkOrigin,
  nonce,
  locale,
  catalog = billingEnglish,
  submitLabel,
  summary,
  onSubmitted,
  loadSdk = loadXMoneySdk
}: Readonly<{
  checkout: SignedOrder;
  sdkOrigin: string | null;
  nonce: string | undefined;
  locale: string;
  catalog?: MessageCatalog;
  submitLabel: string;
  summary: string;
  onSubmitted: () => void;
  loadSdk?: XMoneySdkLoader;
}>) {
  const container = useRef<HTMLDivElement | null>(null);
  const handle = useRef<XMoneyPaymentFormHandle | null>(null);
  const submitted = useRef(onSubmitted);
  submitted.current = onSubmitted;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const usable = sdkOriginMatchesEnvironment(sdkOrigin, checkout.sdk_environment);

  useEffect(() => {
    if (!usable || sdkOrigin === null || container.current === null) return undefined;
    let active = true;
    loadSdk(sdkOrigin, nonce).then((sdk) => {
      if (!active || container.current === null) return;
      handle.current = sdk.paymentForm({
        container: container.current,
        publicKey: checkout.public_key,
        orderPayload: checkout.order_payload,
        orderChecksum: checkout.order_checksum,
        options: { locale, displaySubmitButton: false, displaySaveCardOption: false },
        onReady: () => { if (active) setReady(true); },
        onError: () => { if (active) { setFailed(true); setBusy(false); } },
        onPaymentComplete: () => { if (active) submitted.current(); }
      });
    }, () => { if (active) setFailed(true); });
    return () => {
      active = false;
      handle.current?.destroy();
      handle.current = null;
    };
  }, [usable, sdkOrigin, nonce, loadSdk, checkout.public_key, checkout.order_payload, checkout.order_checksum, locale]);

  if (!usable || failed) {
    return <p className="billingError" role="alert">{t(catalog, "billing.checkout.formUnavailable")}</p>;
  }
  return (
    <section className="billingCardForm" aria-labelledby="billing-card-title">
      <h2 id="billing-card-title">{t(catalog, "billing.checkout.cardTitle")}</h2>
      <p className="billingNote">{t(catalog, "billing.checkout.cardNote")}</p>
      <div ref={container} className="billingCardFrame" data-xmoney-container />
      <p className="billingTotal">{summary}</p>
      <div className="billingActions">
        <button
          type="button"
          className="btn btnDark"
          disabled={!ready || busy}
          onClick={() => { setBusy(true); handle.current?.submit(); }}
        >
          {submitLabel}
        </button>
      </div>
    </section>
  );
}
