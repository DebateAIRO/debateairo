"use client";

import { t, type MessageCatalog } from "@/lib/i18n/translate";

/** Spec 2026-10-05 §2.6.1: the cardholder fields NETOPIA needs on every payment (the checkout and the card page). */
export type BillingDetails = Readonly<{ firstName: string; lastName: string; phone: string; street: string; postalCode: string }>;

export function BillingDetailsFields({
  catalog, idPrefix, values, onChange, postalOptional
}: Readonly<{
  catalog: MessageCatalog;
  idPrefix: string;
  values: BillingDetails;
  onChange: (field: keyof BillingDetails, value: string) => void;
  /** `postcodeOptional(country)`: the field stays, labelled optional. */
  postalOptional: boolean;
}>) {
  const field = (name: keyof BillingDetails, labelKey: string, autoComplete: string, type = "text", required = true) => (
    <div className="billingField">
      <label htmlFor={`${idPrefix}-${name}`}>{t(catalog, labelKey)}</label>
      <input id={`${idPrefix}-${name}`} type={type} value={values[name]} autoComplete={autoComplete} required={required}
        onChange={(event) => onChange(name, event.target.value)} />
    </div>
  );
  return (
    <>
      {field("firstName", "billing.checkout.firstName", "given-name")}
      {field("lastName", "billing.checkout.lastName", "family-name")}
      {field("phone", "billing.checkout.phone", "tel", "tel")}
      {field("street", "billing.checkout.street", "address-line1")}
      {field("postalCode", postalOptional ? "billing.checkout.postalCodeOptional" : "billing.checkout.postalCode",
        "postal-code", "text", !postalOptional)}
    </>
  );
}
