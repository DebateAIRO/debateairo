"use client";

import type { ReactNode } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/** Spec 2026-10-05 §2.6.1: the cardholder fields NETOPIA needs on every payment (the checkout and the card page). */
export type BillingDetails = Readonly<{ firstName: string; lastName: string; phone: string; street: string; postalCode: string }>;

/**
 * Design Document v2 (19b): the fields sit in the page's two-column grid (`.billingGrid`): first and last name, the
 * phone beside the city (`cityField`, which the page owns), then the street on a row of its own and the postal code.
 */
export function BillingDetailsFields({
  catalog, idPrefix, values, onChange, postalOptional, errors, cityField
}: Readonly<{
  catalog: MessageCatalog;
  idPrefix: string;
  values: BillingDetails;
  onChange: (field: keyof BillingDetails, value: string) => void;
  /** `postcodeOptional(country)`: the field stays, labelled optional. */
  postalOptional: boolean;
  /** Each field's own error sentence, already translated; a field named here is marked invalid and points at it. */
  errors?: Readonly<Partial<Record<keyof BillingDetails, string | undefined>>>;
  /** The page's own city field, drawn beside the phone. */
  cityField?: ReactNode;
}>) {
  const field = (name: keyof BillingDetails, labelKey: string, autoComplete: string, type = "text", required = true, wide = false) => {
    const error = errors?.[name];
    const errorId = `${idPrefix}-${name}-error`;
    return (
      <div className={wide ? "billingField billingFieldWide" : "billingField"}>
        <label htmlFor={`${idPrefix}-${name}`}>{t(catalog, labelKey)}</label>
        <input id={`${idPrefix}-${name}`} type={type} value={values[name]} autoComplete={autoComplete} required={required}
          aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}
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
      {cityField}
      {field("street", "billing.checkout.street", "address-line1", "text", true, true)}
      {field("postalCode", postalOptional ? "billing.checkout.postalCodeOptional" : "billing.checkout.postalCode",
        "postal-code", "text", !postalOptional)}
    </>
  );
}
