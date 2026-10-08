import { parsePhoneNumberWithError } from "libphonenumber-js/min";

/** A self-reported profile value, never proof of ownership or a delivery channel. */
export function normalizeManualPhone(value: unknown): string {
  if (typeof value !== "string" || value.length > 128 || !value.trim().startsWith("+")) {
    throw new TypeError("PHONE_INVALID");
  }
  try {
    const phone = parsePhoneNumberWithError(value.trim(), { extract: false });
    if (phone.ext !== undefined || !phone.isPossible()) throw new TypeError("PHONE_INVALID");
    return phone.number;
  } catch {
    throw new TypeError("PHONE_INVALID");
  }
}
