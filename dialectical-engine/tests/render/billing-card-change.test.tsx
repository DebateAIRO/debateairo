// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { CardChangeFlow, type CardChangeClient } from "../../apps/ui/components/billing/CardChangeFlow.js";
import type { XMoneyGlobal, XMoneyPaymentFormOptions } from "../../apps/ui/lib/billing/xmoneySdk.js";
import billingEnglish from "../../apps/ui/messages/en/billing.json" with { type: "json" };

const mocks = vi.hoisted(() => ({
  session: null as string | null, billingOn: true, sessionLive: true, sessionCheckedWith: [] as string[]
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "__Host-debateai-session" && mocks.session !== null ? { value: mocks.session } : undefined)
  }),
  headers: async () => new Headers({ "user-agent": "card-page-test" })
}));
// P19's judge carry (progress.md, before P20): billing off is "not found" before any redirect, and a cookie alone is
// not a session, so the page asks P19's sessionConfirmed, as /checkout does.
vi.mock("@/lib/billing/serverBilling", () => ({
  billingIsOn: async () => mocks.billingOn,
  sessionConfirmed: async (sessionToken: string) => { mocks.sessionCheckedWith.push(sessionToken); return mocks.sessionLive; }
}));

import CardChangePage from "../../apps/ui/app/settings/card/page.js";
import { readRedirects, resetRedirects } from "./stubs/next-navigation.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  resetRedirects();
  // A case that fails part-way must not leak its session or billing switch into the next one.
  mocks.session = null;
  mocks.billingOn = true;
  mocks.sessionLive = true;
  mocks.sessionCheckedWith = [];
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
async function settle(): Promise<void> {
  for (let hop = 0; hop < 6; hop += 1) await act(async () => { await Promise.resolve(); });
}

describe("P20 the card change page (A11, A12)", () => {
  it("names the $1.00 hold before the card is saved, then saves it through xMoney and the server's charge state", async () => {
    const mounted: XMoneyPaymentFormOptions[] = [];
    const submit = vi.fn();
    const loadSdk = async (): Promise<XMoneyGlobal> => ({
      paymentForm: (options) => { mounted.push(options); return { submit, destroy: () => undefined }; }
    });
    const client = {
      startCardChange: vi.fn(async () => ({
        public_key: "pk_test_x", order_payload: "cA==", order_checksum: "cw==",
        charge_ref: "fedcba9876543210fedcba9876543210", sdk_environment: "stage" as const, hold_amount: "1.00"
      })),
      getBillingCharge: vi.fn(async () => ({ state: "SUCCEEDED" as const, reason_code: null }))
    };
    await act(async () => {
      root.render(<CardChangeFlow catalog={billingEnglish} locale="en" sdkOrigin="https://secure-stage.xmoney.com"
        nonce={undefined} client={client as unknown as CardChangeClient} loadSdk={loadSdk} />);
    });
    expect(container.textContent).toContain("We check the new card with your bank before we save it.");
    expect(client.startCardChange).not.toHaveBeenCalled();
    await act(async () => { [...container.querySelectorAll("button")].find((b) => b.textContent === "Continue to card details")!.click(); });
    await settle();
    expect(client.startCardChange).toHaveBeenCalledTimes(1);
    // Spec §1.3: the page names the hold in plain words, with the amount the server signed, before "Save card".
    expect(container.textContent).toContain("To check the new card, your bank shows a hold of $1.00. We release it at once; it is never charged.");
    await act(async () => { mounted[0]!.onReady(); });
    await act(async () => { [...container.querySelectorAll("button")].find((b) => b.textContent === "Save card")!.click(); });
    expect(submit).toHaveBeenCalledTimes(1);
    await act(async () => { mounted[0]!.onPaymentComplete({}); });
    await settle();
    expect(client.getBillingCharge).toHaveBeenCalledWith("fedcba9876543210fedcba9876543210");
    expect(container.textContent).toContain("Your new card is saved. Future payments use it.");
  });

  it("says nothing is charged when the check holds no money (X0 may set the hold to 0)", async () => {
    const client = {
      startCardChange: vi.fn(async () => ({
        public_key: "pk_test_x", order_payload: "cA==", order_checksum: "cw==",
        charge_ref: "fedcba9876543210fedcba9876543210", sdk_environment: "stage" as const, hold_amount: "0.00"
      })),
      getBillingCharge: vi.fn()
    };
    const loadSdk = async (): Promise<XMoneyGlobal> => ({ paymentForm: () => ({ submit: () => undefined, destroy: () => undefined }) });
    await act(async () => {
      root.render(<CardChangeFlow catalog={billingEnglish} locale="en" sdkOrigin="https://secure-stage.xmoney.com"
        nonce={undefined} client={client as unknown as CardChangeClient} loadSdk={loadSdk} />);
    });
    await act(async () => { [...container.querySelectorAll("button")].find((b) => b.textContent === "Continue to card details")!.click(); });
    await settle();
    expect(container.textContent).toContain("Your bank checks the new card. Nothing is charged.");
    expect(container.textContent).not.toContain("hold of");
  });

  it("says plainly that a card needs an active plan, that a pending deletion or an open payment takes no new card, and that the Terms come first", async () => {
    for (const [status, code, sentence] of [
      [409, "NOT_SUBSCRIBED", "You need an active plan to change the card."],
      [409, "ACCOUNT_ERASURE_PENDING", "Your account is scheduled for deletion. Cancel the deletion in Settings to subscribe or change your plan."],
      // D6b's P12e: a renewal or an upgrade payment is still being confirmed.
      [409, "CARD_CHANGE_NOT_AVAILABLE_NOW", "We couldn't save your new card just now because a payment on your plan is still being confirmed. Your current card stays in use; please try again in an hour."],
      [403, "LEGAL_REACCEPTANCE_REQUIRED", "Please accept the updated Terms first, then come back to this page."]
    ] as const) {
      act(() => root.unmount());
      root = createRoot(container);
      const client = {
        startCardChange: vi.fn(async () => { throw new ContractHttpError(status === 403 ? "FORBIDDEN" : "SERVER_FAILURE", status, "x", code); }),
        getBillingCharge: vi.fn()
      };
      await act(async () => {
        root.render(<CardChangeFlow catalog={billingEnglish} locale="en" sdkOrigin="https://secure-stage.xmoney.com"
          nonce={undefined} client={client as unknown as CardChangeClient} />);
      });
      await act(async () => { [...container.querySelectorAll("button")].find((b) => b.textContent === "Continue to card details")!.click(); });
      await settle();
      expect(container.textContent, code).toContain(sentence);
      expect(container.textContent, code).not.toContain("Something went wrong");
    }
  });

  it("back from the bank's check (P12e's backUrl ?charge=), polls that charge instead of starting again", async () => {
    const client = {
      startCardChange: vi.fn(),
      getBillingCharge: vi.fn(async () => ({ state: "SUCCEEDED" as const, reason_code: null }))
    };
    await act(async () => {
      root.render(<CardChangeFlow catalog={billingEnglish} locale="en" sdkOrigin="https://secure-stage.xmoney.com"
        nonce={undefined} returnedChargeRef="fedcba9876543210fedcba9876543210" client={client as unknown as CardChangeClient} />);
    });
    await settle();
    expect(client.getBillingCharge).toHaveBeenCalledWith("fedcba9876543210fedcba9876543210");
    expect(client.startCardChange).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Your new card is saved. Future payments use it.");
  });

  it("a new card from a country we cannot serve: the page says the hold is released and the old card stays (no email follows)", async () => {
    const client = {
      startCardChange: vi.fn(),
      getBillingCharge: vi.fn(async () => ({ state: "FAILED" as const, reason_code: "CARD_CHECK_REFUSED" }))
    };
    await act(async () => {
      root.render(<CardChangeFlow catalog={billingEnglish} locale="en" sdkOrigin="https://secure-stage.xmoney.com"
        nonce={undefined} returnedChargeRef="fedcba9876543210fedcba9876543210" client={client as unknown as CardChangeClient} />);
    });
    await settle();
    expect(container.textContent).toContain(
      "We can't accept cards issued in that card's country. The hold on it is released, and your plan keeps the card it had."
    );
    expect(container.textContent).not.toContain("The card couldn't be checked.");
  });

  it("a card check deferred because a plan payment is still open (D6b's CARD_CHECK_DEFERRED) asks to try again, never 'saved'", async () => {
    const client = {
      startCardChange: vi.fn(),
      getBillingCharge: vi.fn(async () => ({ state: "FAILED" as const, reason_code: "CARD_CHECK_DEFERRED" }))
    };
    await act(async () => {
      root.render(<CardChangeFlow catalog={billingEnglish} locale="en" sdkOrigin="https://secure-stage.xmoney.com"
        nonce={undefined} returnedChargeRef="fedcba9876543210fedcba9876543210" client={client as unknown as CardChangeClient} />);
    });
    await settle();
    expect(container.textContent).toContain(
      "We couldn't save your new card just now because a payment on your plan is still being confirmed. Your current card stays in use; please try again in an hour."
    );
    expect(container.textContent).not.toContain("Your new card is saved.");
    expect(container.textContent).not.toContain("The card couldn't be checked.");
  });

  it("a plan that stopped being live during the check (CARD_CHECK_NOT_LIVE) says a card needs an active plan, never 'saved'", async () => {
    const client = {
      startCardChange: vi.fn(),
      getBillingCharge: vi.fn(async () => ({ state: "FAILED" as const, reason_code: "CARD_CHECK_NOT_LIVE" }))
    };
    await act(async () => {
      root.render(<CardChangeFlow catalog={billingEnglish} locale="en" sdkOrigin="https://secure-stage.xmoney.com"
        nonce={undefined} returnedChargeRef="fedcba9876543210fedcba9876543210" client={client as unknown as CardChangeClient} />);
    });
    await settle();
    expect(container.textContent).toContain("You need an active plan to change the card.");
    expect(container.textContent).not.toContain("Your new card is saved.");
    expect(container.textContent).not.toContain("The card couldn't be checked.");
  });

  it("after two minutes of waiting on a card check, says it is still being confirmed and promises no email", async () => {
    vi.useFakeTimers();
    try {
      const client = {
        startCardChange: vi.fn(),
        getBillingCharge: vi.fn(async () => ({ state: "PENDING" as const, reason_code: null }))
      };
      await act(async () => {
        root.render(<CardChangeFlow catalog={billingEnglish} locale="en" sdkOrigin="https://secure-stage.xmoney.com"
          nonce={undefined} returnedChargeRef="fedcba9876543210fedcba9876543210" client={client as unknown as CardChangeClient} />);
      });
      await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
      expect(container.querySelector('[data-charge-state="TIMED_OUT"]')).not.toBeNull();
      expect(container.textContent).toContain("We're still confirming this with the payment provider.");
      expect(container.textContent).not.toMatch(/email/iu);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends a signed-out person to sign in and back to /settings/card, and is not found while billing is off", async () => {
    await expect(CardChangePage()).rejects.toThrow("NEXT_REDIRECT");
    expect(readRedirects()).toEqual(["/login?next=%2Fsettings%2Fcard"]);
    // Back from the bank's check signed out: the charge survives the sign-in, so the page polls it instead of
    // offering a second hold.
    resetRedirects();
    await expect(CardChangePage({ searchParams: Promise.resolve({ charge: "fedcba9876543210fedcba9876543210" }) }))
      .rejects.toThrow("NEXT_REDIRECT");
    expect(readRedirects()).toEqual([`/login?next=${encodeURIComponent("/settings/card?charge=fedcba9876543210fedcba9876543210")}`]);
    resetRedirects();
    await expect(CardChangePage({ searchParams: Promise.resolve({ charge: "../x" }) })).rejects.toThrow("NEXT_REDIRECT");
    expect(readRedirects()).toEqual(["/login?next=%2Fsettings%2Fcard"]);
    mocks.session = "t".repeat(43);
    expect(renderToStaticMarkup(await CardChangePage())).toContain("Update your card");
    mocks.billingOn = false;
    await expect(CardChangePage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("is not found while billing is off even when signed out, and sends an expired session back to sign-in", async () => {
    // Like /pricing and /checkout: billing off (or local mode) answers 404 before any sign-in redirect.
    mocks.session = null;
    mocks.billingOn = false;
    resetRedirects();
    await expect(CardChangePage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(readRedirects()).toEqual([]);
    // A cookie whose session expired or was revoked is no sign-in (spec §2.10); the charge still survives it.
    mocks.billingOn = true;
    mocks.session = "e".repeat(43);
    mocks.sessionLive = false;
    mocks.sessionCheckedWith = [];
    await expect(CardChangePage({ searchParams: Promise.resolve({ charge: "fedcba9876543210fedcba9876543210" }) }))
      .rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.sessionCheckedWith).toEqual(["e".repeat(43)]);
    expect(readRedirects()).toEqual([`/login?next=${encodeURIComponent("/settings/card?charge=fedcba9876543210fedcba9876543210")}`]);
    mocks.sessionLive = true;
  });

  it("a session that ended while the page was open goes back to sign-in and then to this page, with no error sentence", async () => {
    const navigated: string[] = [];
    const client = {
      startCardChange: vi.fn(async () => { throw new ContractHttpError("SESSION_REQUIRED", 401, "x"); }),
      getBillingCharge: vi.fn()
    };
    await act(async () => {
      root.render(<CardChangeFlow catalog={billingEnglish} locale="en" sdkOrigin="https://secure-stage.xmoney.com"
        nonce={undefined} client={client as unknown as CardChangeClient} navigate={(href) => { navigated.push(href); }} />);
    });
    await act(async () => { [...container.querySelectorAll("button")].find((b) => b.textContent === "Continue to card details")!.click(); });
    await settle();
    expect(navigated).toEqual(["/login?next=%2Fsettings%2Fcard"]);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("reads only a well-formed ?charge= and hands it to the flow", async () => {
    mocks.session = "t".repeat(43);
    mocks.billingOn = true;
    const returned = renderToStaticMarkup(await CardChangePage({
      searchParams: Promise.resolve({ charge: "fedcba9876543210fedcba9876543210" })
    }));
    expect(returned).toContain('data-charge-state="PENDING"');
    expect(returned).not.toContain("Continue to card details");
    for (const charge of ["../x", "FEDCBA9876543210FEDCBA9876543210", ["fedcba9876543210fedcba9876543210"]]) {
      const html = renderToStaticMarkup(await CardChangePage({ searchParams: Promise.resolve({ charge }) }));
      expect(html, String(charge)).toContain("Continue to card details");
      expect(html, String(charge)).not.toContain("data-charge-state");
    }
  });
});
