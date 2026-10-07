import type { Payer } from "@debateai/billing-core";
import type { BillingProfile } from "./records.js";

/** E.164 as the quote stores it (spec §2.6.1): `+` and 8–15 digits. */
const E164 = /^\+[0-9]{8,15}$/;
const UUID = /^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$/;

const filled = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

/**
 * Spec §2.5.3: the cardholder NETOPIA receives on every payment, built from the NEWEST billing profile (names, phone and
 * address) and the account's CURRENT email (A29 (k), W8). Null when anything NETOPIA requires for a saved-card charge is
 * missing ([SALES]): the renewal then fails `CARD_NOT_SAVED` with no call, and a hosted start refuses before calling. The
 * region and the postcode may be null (the package writes NETOPIA's `state` from the city and `""` for a country without
 * postcodes). Never logged: it is personal data.
 */
export function payerFromProfile(profile: BillingProfile | null, email: string | null): Payer | null {
  if (profile === null || email === null) return null;
  const firstName = filled(profile.firstName);
  const lastName = filled(profile.lastName);
  const phone = filled(profile.phone);
  const city = filled(profile.city);
  const street = filled(profile.street);
  if (firstName === null || lastName === null || phone === null || city === null || street === null) return null;
  if (!E164.test(phone)) return null;
  return Object.freeze({
    firstName, lastName, email, phone, country: profile.country, region: filled(profile.region), city,
    postalCode: filled(profile.postalCode), street
  });
}

/** Spec §2.6.4: our `billing.customer.customer_id` as 32 lower-case hex, the same for every payment of that customer. */
export function clientIdOf(customerId: string): string {
  if (!UUID.test(customerId)) throw new TypeError("BILLING_CUSTOMER_ID_INVALID");
  return customerId.replaceAll("-", "").toLowerCase();
}

/**
 * The address NETOPIA posts its message to: the UI proxy's `/api` prefix in front of the API route
 * (`NETOPIA_NOTIFY_PATH`, apps/api/src/billing/index.ts; tests/unit/billing-netopia-renewal-rules.test.ts pins the two
 * equal). R-7: PUBLIC_APP_URL is the only origin.
 */
export function netopiaNotifyUrl(publicAppUrl: string): string {
  return new URL("/api/v1/billing/netopia/notify", publicAppUrl).toString();
}

/** NETOPIA's `redirectUrl`: the page that polls the charge (spec §2.6.5); never trusted to decide anything. */
export function paymentReturnUrl(publicAppUrl: string, path: "/checkout/return" | "/settings/card", chargeId: string): string {
  return new URL(`${path}?charge=${chargeId}`, publicAppUrl).toString();
}
