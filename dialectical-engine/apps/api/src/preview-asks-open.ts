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
 * Asks open to strangers need the room, because only the room bounds each person's spending. "everyone" needs real
 * payments: on the sandbox anyone could pay for a plan with the provider's public test card and get real AI credit, and
 * with billing off an account has no plan window of its own, so a couple of accounts could use up the site's whole day.
 * "everyone-with-test-payments" names exactly the sandbox test, so it is refused on any other payment system, and the
 * boot line always says which one strangers meet. "everyone-with-listed-buyers" names a sandbox test too, where anyone
 * may ask and only the listed accounts may buy, so it is refused on any other payment system as well: with billing off
 * no account has a plan window of its own, and real payments are opened to strangers only by "everyone".
 */
export function assertPreviewAsksOpenBoot(input: PreviewAsksOpenBootInput): void {
  if (input.asksOpen === undefined) return;
  if (!input.roomComposed) throw new TypeError("PREVIEW_ASKS_OPEN_TO_WITHOUT_ROOM");
  if (input.asksOpen === "everyone" && input.paymentEnvironment === "sandbox") {
    throw new TypeError("PREVIEW_ASKS_OPEN_TO_SANDBOX_BILLING");
  }
  if (input.asksOpen === "everyone" && input.paymentEnvironment === null) {
    throw new TypeError("PREVIEW_ASKS_OPEN_TO_BILLING_OFF");
  }
  if (input.asksOpen === "everyone-with-test-payments" && input.paymentEnvironment !== "sandbox") {
    throw new TypeError("PREVIEW_ASKS_OPEN_TO_TEST_PAYMENTS_NOT_SANDBOX");
  }
  if (input.asksOpen === "everyone-with-listed-buyers" && input.paymentEnvironment !== "sandbox") {
    throw new TypeError("PREVIEW_ASKS_OPEN_TO_LISTED_BUYERS_NOT_SANDBOX");
  }
}

/** The one content-free boot line naming which opening runs; null with the team rule. */
export function previewAsksOpenBootLine(asksOpen: PreviewAsksOpenTo | undefined): string | null {
  return asksOpen === undefined ? null : JSON.stringify({ event: "api.preview.asks_open", to: asksOpen });
}

/**
 * With "everyone-with-listed-buyers", a second content-free line: how many accounts the team line lists, which may buy
 * besides the accounts the Owner approves on the Team page (migration 0186). That list changes with no restart, so a line
 * written at start cannot count it; the morning check reads it in the database. A count only, never an id. Null with any
 * other value.
 */
export function previewListedBuyersBootLine(
  asksOpen: PreviewAsksOpenTo | undefined, teamUserIds: readonly string[] | undefined
): string | null {
  return asksOpen !== "everyone-with-listed-buyers" ? null
    : JSON.stringify({ event: "api.preview.listed_buyers", count: teamUserIds?.length ?? 0 });
}
