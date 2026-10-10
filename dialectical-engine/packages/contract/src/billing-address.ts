/**
 * NETOPIA's cardholder fields (spec 2026-10-05 §2.6.1, §2.3 `Payer`), shared by the API's quote and the checkout page so
 * both read one rule. NETOPIA requires the full payer on every payment, the monthly ones included.
 */

/** Countries where many addresses are used without a postal code in use (to start: Ireland's Eircode). */
const NO_POSTCODE_COUNTRIES: ReadonlySet<string> = new Set(["IE"]);

/** Whether a buyer in `country` (ISO alpha-2) may leave the postal code empty; NETOPIA then receives "". */
export function postcodeOptional(country: string): boolean {
  return NO_POSTCODE_COUNTRIES.has(country);
}

/** E.164: "+", a first digit that is not 0, and 8 to 15 digits in all. */
const E164 = /^\+[1-9][0-9]{7,14}$/u;
const SEPARATORS = /[\s().\-/]/gu;

/** The phone as the server stores it ("+40712345678"), or null when it is not one; "00" stands for "+". */
export function e164Phone(text: string): string | null {
  const compact = text.trim().replace(SEPARATORS, "");
  const international = compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
  return E164.test(international) ? international : null;
}
