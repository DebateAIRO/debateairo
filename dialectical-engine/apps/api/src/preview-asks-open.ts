import type { PreviewAsksOpenTo } from "@debateai/providers";

export type PreviewAsksOpenBootInput = Readonly<{
  /** The parsed PREVIEW_ASKS_OPEN_TO: undefined keeps the team rule, and nothing here is checked. */
  asksOpen: PreviewAsksOpenTo | undefined;
  /** The ask room was composed: the site's daily ceiling, its 8 debates at once and each person's window hold. */
  roomComposed: boolean;
  /** The payment system billing runs on, or null when billing is off (the provider-only mode included). */
  paymentEnvironment: "sandbox" | "live" | null;
}>;

/**
 * Checked once at boot, when the room and billing are both built; each refusal is a TypeError whose message is its code.
 * Asks open to strangers need the room, because only the room bounds each person's spending. "everyone" is refused
 * while billing runs on the sandbox: anyone could then pay for a plan with the provider's public test card and get real
 * AI credit. "everyone-with-test-payments" names exactly that test, so it is refused on any other payment system, and
 * the boot line always says which one strangers meet.
 */
export function assertPreviewAsksOpenBoot(input: PreviewAsksOpenBootInput): void {
  if (input.asksOpen === undefined) return;
  if (!input.roomComposed) throw new TypeError("PREVIEW_ASKS_OPEN_TO_WITHOUT_ROOM");
  if (input.asksOpen === "everyone" && input.paymentEnvironment === "sandbox") {
    throw new TypeError("PREVIEW_ASKS_OPEN_TO_SANDBOX_BILLING");
  }
  if (input.asksOpen === "everyone-with-test-payments" && input.paymentEnvironment !== "sandbox") {
    throw new TypeError("PREVIEW_ASKS_OPEN_TO_TEST_PAYMENTS_NOT_SANDBOX");
  }
}

/** The one content-free boot line naming which opening runs; null with the team rule. */
export function previewAsksOpenBootLine(asksOpen: PreviewAsksOpenTo | undefined): string | null {
  return asksOpen === undefined ? null : JSON.stringify({ event: "api.preview.asks_open", to: asksOpen });
}
