"use client";

import { t, type MessageCatalog } from "@/lib/i18n/translate";

/** Spec 2026-10-05 §2.6.1: the cardholder fields NETOPIA needs on every payment (the checkout and the card page). */
export type BillingDetails = Readonly<{ firstName: string; lastName: string; phone: string; street: string; postalCode: string }>;

export function BillingDetailsFields({
  catalog, idPrefix, values, onChange, postalOptional, errors
}: Readonly<{
  catalog: MessageCatalog;
  idPrefix: string;
  values: BillingDetails;
  onChange: (field: keyof BillingDetails, value: string) => void;
  /** `postcodeOptional(country)`: the field stays, labelled optional. */
  postalOptional: boolean;
  /** Each field's own error sentence, already translated; a field named here is marked invalid and points at it. */
  errors?: Readonly<Partial<Record<keyof BillingDetails, string | undefined>>>;
}>) {
  const field = (name: keyof BillingDetails, labelKey: string, autoComplete: string, type = "text", required = true) => {
    const error = errors?.[name];
    const errorId = `${idPrefix}-${name}-error`;
    return (
      <div className="billingField">
        <label htmlFor={`${idPrefix}-${name}`}>{t(catalog, labelKey)}</label>
        <input id={`${idPrefix}-${name}`} type={type} value={values[name]} autoComplete={autoComplete} required={required}
          aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(name, event.target.value)} />
        {error ? <p id={errorId} className="authFieldError">{error}</p> : null}
      </div>
    );
  };
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
