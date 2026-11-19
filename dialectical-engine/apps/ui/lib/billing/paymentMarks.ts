export type PaymentMarks = Readonly<{ netopia: boolean; visa: boolean; mastercard: boolean }>;

/** The server setting that names the marks to show (README §14.7), e.g. `netopia,visa,mastercard`. */
export const PAYMENT_MARKS_SETTING = "PAYMENT_MARKS_AVAILABLE";

/** The three marks, NETOPIA's first; each one's file is `/payment-marks/<name>.svg`. */
export const PAYMENT_MARK_NAMES = Object.freeze(["netopia", "visa", "mastercard"] as const) satisfies
  ReadonlyArray<keyof PaymentMarks>;

/**
 * NETOPIA's logo beside the Visa and Mastercard marks, the marks NETOPIA's shop approval asks for in the footer and on
 * the checkout (spec §2.10, §2.18). The brands' artwork may not be redistributed, so it is never in the repository or a
 * release folder: root keeps the official files outside every release (test site
 * /etc/debateai-v3-preview/public/payment-marks/, public server /etc/debateai/payment-marks/) and Caddy serves exactly
 * the three names, /payment-marks/<name>.svg, before the website. The website shows the marks its
 * PAYMENT_MARKS_AVAILABLE setting names (README §14.7), comma-separated in any order (NETOPIA's still shows first);
 * spaces and capitals are forgiven, and an absent, empty or unknown name shows nothing. When `NETOPIA_LOGO_ID` is set,
 * NETOPIA's hosted logo replaces these files. Server components only: this reads the process environment.
 */
export function availablePaymentMarks(
  environment: Readonly<Record<string, string | undefined>> = process.env
): PaymentMarks {
  const named = new Set((environment[PAYMENT_MARKS_SETTING] ?? "").split(",").map((name) => name.trim().toLowerCase()));
  const shows = (mark: keyof PaymentMarks): boolean => named.has(mark);
  return Object.freeze({ netopia: shows("netopia"), visa: shows("visa"), mastercard: shows("mastercard") });
}

/** The server setting that holds the shop id NETOPIA shows the merchant for its hosted logo, e.g. `123456`. */
export const NETOPIA_LOGO_SETTING = "NETOPIA_LOGO_ID";

/**
 * Digits only, 1 to 12. The website refuses to start on any other value (server.mjs writes the same form out again,
 * since it can import only .mjs files), and the test site's tools check the same form (environment.mjs isNetopiaLogoId).
 */
export const NETOPIA_LOGO_ID_FORM = /^[0-9]{1,12}$/;

/**
 * NETOPIA's hosted logo: one picture of its mark beside the Visa and Mastercard marks, the version made for a light
 * background. The visitor's browser loads it from NETOPIA's server, so the shop id in its address is public by design.
 * Null when the setting is absent or not of the form: then the footer and the checkout show what they showed before.
 * Server components only: this reads the process environment.
 */
export function netopiaLogoAddress(
  environment: Readonly<Record<string, string | undefined>> = process.env
): string | null {
  const id = environment[NETOPIA_LOGO_SETTING];
  return id !== undefined && NETOPIA_LOGO_ID_FORM.test(id) ? `https://mny.ro/np-black-0.svg?id=${id}` : null;
}
