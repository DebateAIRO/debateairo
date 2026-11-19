// Where the asks lock meets the payments lock at the API's boot on the hosted preview. main.ts runs the live payments
// rule (stage preview-live-payments) and then the asks rule (stage preview-asks-open), each over the payment system its
// own way: the first reads the billing connectors or the provider-only ones, the second the billing connectors only.
// Together they must mean: asks open to everyone only with billing on, NETOPIA's live system and the owner's switch;
// asks open with test payments only with billing on and NETOPIA's sandbox, and never with the switch.
import { describe, expect, it } from "vitest";
import { assertPreviewLivePayments } from "../../apps/api/src/billing/stage-clock.js";
import { assertPreviewAsksOpenBoot } from "../../apps/api/src/preview-asks-open.js";

/** What main.ts has built, named the way the owner meets it. */
const BILLING = {
  "billing off": { billingConnectors: null, providerOnlyConnectors: null, billingOn: false },
  "provider-only, sandbox": { billingConnectors: null, providerOnlyConnectors: "sandbox", billingOn: false },
  "provider-only, live": { billingConnectors: null, providerOnlyConnectors: "live", billingOn: false },
  "billing on, sandbox": { billingConnectors: "sandbox", providerOnlyConnectors: null, billingOn: true },
  "billing on, live": { billingConnectors: "live", providerOnlyConnectors: null, billingOn: true }
} as const;
const ASKS = [undefined, "everyone", "everyone-with-test-payments"] as const;
const FLAGS = [null, "real-money"] as const;

/** The two stages in boot order, with main.ts's own inputs; the first refusal's code, or null when the API starts. */
function boot(billing: keyof typeof BILLING, asksOpen: typeof ASKS[number], flag: typeof FLAGS[number]): string | null {
  const built = BILLING[billing];
  try {
    assertPreviewLivePayments({
      preview: true, paymentEnvironment: built.billingConnectors ?? built.providerOnlyConnectors, billingOn: built.billingOn, flag
    });
    assertPreviewAsksOpenBoot({ asksOpen, roomComposed: true, paymentEnvironment: built.billingConnectors });
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? (error as Error).message;
  }
}

const TABLE = (Object.keys(BILLING) as Array<keyof typeof BILLING>)
  .flatMap((billing) => ASKS.flatMap((asksOpen) => FLAGS.map((flag) => [billing, asksOpen, flag] as const)));

describe("the asks and live payments boot rules together, on the hosted preview", () => {
  it.each(TABLE)("%s, asks %s, switch %s", (billing, asksOpen, flag) => {
    const verdict = boot(billing, asksOpen, flag);
    if (asksOpen === "everyone") {
      expect(verdict === null).toBe(billing === "billing on, live" && flag === "real-money");
    } else if (asksOpen === "everyone-with-test-payments") {
      expect(verdict === null).toBe(billing === "billing on, sandbox" && flag === null);
    } else {
      // The team rule: only the payments rule can refuse, exactly as without the asks lock.
      expect(verdict === null).toBe(
        (flag === null && billing !== "provider-only, live" && billing !== "billing on, live") || (flag === "real-money" && billing === "billing on, live"));
    }
    // Every refusal is a named code the launcher prints.
    if (verdict !== null) expect(verdict).toMatch(/^PREVIEW_(?:LIVE_PAYMENTS|ASKS_OPEN_TO)_[A-Z_]+$/u);
  });

  it("names the refusal a half-made opening meets", () => {
    expect(boot("billing on, sandbox", "everyone", null)).toBe("PREVIEW_ASKS_OPEN_TO_SANDBOX_BILLING");
    expect(boot("billing off", "everyone", null)).toBe("PREVIEW_ASKS_OPEN_TO_BILLING_OFF");
    expect(boot("provider-only, sandbox", "everyone", null)).toBe("PREVIEW_ASKS_OPEN_TO_BILLING_OFF");
    expect(boot("billing on, live", "everyone", null)).toBe("PREVIEW_LIVE_PAYMENTS_UNSET");
    expect(boot("billing on, live", "everyone-with-test-payments", "real-money")).toBe("PREVIEW_ASKS_OPEN_TO_TEST_PAYMENTS_NOT_SANDBOX");
    expect(boot("provider-only, live", "everyone", "real-money")).toBe("PREVIEW_LIVE_PAYMENTS_BILLING_OFF");
  });
});
